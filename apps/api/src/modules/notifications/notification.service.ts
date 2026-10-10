import type { Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from '../../lib/logger';

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}

export class NotificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  async notify(input: NotificationInput, tx?: Prisma.TransactionClient): Promise<void> {
    try {
      await (tx ?? this.prisma).notification.create({ data: input });
    } catch (err) {
      if (tx) throw err;
      this.logger.error({ err, type: input.type }, 'failed to create notification');
    }
  }

  list(userId: string, take = 50) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }
}
