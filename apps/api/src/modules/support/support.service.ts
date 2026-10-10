import type { PrismaClient, TicketStatus } from '@prisma/client';
import { forbidden, notFound, unprocessable } from '../../lib/errors';
import type { AuditService } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';

export class SupportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  listForUser(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { order: { select: { orderNumber: true } }, _count: { select: { messages: true } } },
    });
  }

  async create(userId: string, input: { subject: string; message: string; orderId?: string }) {
    if (input.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order || order.userId !== userId) throw notFound('Order');
    }
    return this.prisma.supportTicket.create({
      data: {
        userId,
        subject: input.subject,
        orderId: input.orderId,
        status: 'AWAITING_SUPPORT',
        messages: { create: { authorId: userId, body: input.message } },
      },
    });
  }

  async get(ticketId: string, viewer: { userId: string; isStaff: boolean }) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, orderNumber: true, status: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true } } } },
      },
    });
    if (!ticket) throw notFound('Ticket');
    if (!viewer.isStaff && ticket.userId !== viewer.userId) throw notFound('Ticket');
    return ticket;
  }

  async reply(ticketId: string, author: { userId: string; isStaff: boolean }, body: string) {
    const ticket = await this.get(ticketId, author);
    if (ticket.status === 'CLOSED') throw unprocessable('This ticket is closed', 'TICKET_CLOSED');
    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicketMessage.create({ data: { ticketId, authorId: author.userId, body, isStaff: author.isStaff } });
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: author.isStaff ? 'AWAITING_CUSTOMER' : 'AWAITING_SUPPORT' },
      });
      if (author.isStaff) {
        await this.notifications.notify(
          {
            userId: ticket.userId,
            type: 'support.reply',
            title: `New reply: ${ticket.subject}`,
            body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
            link: `/account/support/${ticketId}`,
          },
          tx,
        );
      }
    });
    return this.get(ticketId, author);
  }

  async setStatus(ticketId: string, actor: { userId: string; isStaff: boolean }, status: TicketStatus) {
    const ticket = await this.get(ticketId, actor);
    if (!actor.isStaff && status !== 'CLOSED') throw forbidden();
    await this.prisma.supportTicket.update({ where: { id: ticket.id }, data: { status } });
    if (actor.isStaff) {
      await this.audit.log({ actorId: actor.userId, action: 'support.status', entityType: 'SupportTicket', entityId: ticketId, metadata: { status } });
    }
  }

  listAll(where: { status?: TicketStatus }, skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: { user: { select: { email: true, name: true } }, order: { select: { orderNumber: true } } },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
  }
}
