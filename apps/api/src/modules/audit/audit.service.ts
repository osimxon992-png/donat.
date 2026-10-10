import type { Prisma, PrismaClient } from '@prisma/client';
import { redact, type Logger } from '../../lib/logger';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export class AuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  /** Audit logging must never break the business operation that triggered it. */
  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    try {
      await (tx ?? this.prisma).auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          metadata: entry.metadata ? (redact(entry.metadata) as Prisma.InputJsonValue) : undefined,
          ip: entry.ip,
          userAgent: entry.userAgent?.slice(0, 300),
        },
      });
    } catch (err) {
      if (tx) throw err; // inside a transaction the caller decides
      this.logger.error({ err, action: entry.action }, 'failed to write audit log');
    }
  }
}
