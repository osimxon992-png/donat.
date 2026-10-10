import type { PrismaClient } from '@prisma/client';
import type { Env } from '../../config/env';
import { getDummyPasswordHash, hashPassword, randomToken, sha256, verifyPassword } from '../../lib/crypto';
import { AppError, badRequest, conflict, unauthorized } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { AuditService } from '../audit/audit.service';
import type { Mailer } from '../notifications/mailer';
import type { TokenService } from './tokens';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const ROTATION_GRACE_MS = 30_000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export function publicUser(user: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: string;
  marketingOptIn: boolean;
  createdAt: Date;
  role: { name: string; permissions: string[] };
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    status: user.status,
    marketingOptIn: user.marketingOptIn,
    createdAt: user.createdAt,
    role: user.role.name,
    permissions: user.role.permissions,
  };
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
    private readonly logger: Logger,
  ) {}

  async register(input: { email: string; password: string; name: string }, client: ClientInfo) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
    const role = await this.prisma.role.findUnique({ where: { name: 'CUSTOMER' } });
    if (!role) throw new Error('CUSTOMER role missing — run the database seed');
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.user.create({
        data: { email: input.email, passwordHash, name: input.name, roleId: role.id },
        include: { role: true },
      });
      await this.audit.log({ actorId: user.id, action: 'auth.register', entityType: 'User', entityId: user.id, ...client });
      const tokens = await this.issueSession(user.id, client);
      return { user: publicUser(user), tokens };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
      throw err;
    }
  }

  async login(input: { email: string; password: string }, client: ClientInfo) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email }, include: { role: true } });
    if (!user) {
      await verifyPassword(input.password, await getDummyPasswordHash()); // equalise timing
      throw unauthorized('Invalid email or password');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
        },
      });
      await this.audit.log({ actorId: user.id, action: 'auth.login_failed', entityType: 'User', entityId: user.id, ...client });
      throw unauthorized('Invalid email or password');
    }
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit.log({ actorId: user.id, action: 'auth.login', entityType: 'User', entityId: user.id, ...client });
    const tokens = await this.issueSession(user.id, client);
    return { user: publicUser(user), tokens };
  }

  private async issueSession(userId: string, client: ClientInfo): Promise<IssuedTokens> {
    const refreshToken = randomToken(48);
    const refreshExpiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 300),
      },
    });
    const accessToken = await this.tokens.signAccessToken({ sub: userId, sid: session.id });
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  /** Rotate a refresh token. Reuse of an already-rotated token revokes the session. */
  async refresh(refreshToken: string | undefined, client: ClientInfo): Promise<IssuedTokens> {
    if (!refreshToken) throw unauthorized('Missing refresh token');
    const hash = sha256(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hash }, include: { user: true } });

    if (!session) {
      const reused = await this.prisma.session.findUnique({ where: { previousTokenHash: hash } });
      if (reused && !reused.revokedAt) {
        const withinGrace = reused.rotatedAt && Date.now() - reused.rotatedAt.getTime() < ROTATION_GRACE_MS;
        if (!withinGrace) {
          await this.prisma.session.update({ where: { id: reused.id }, data: { revokedAt: new Date() } });
          await this.audit.log({
            actorId: reused.userId,
            action: 'auth.refresh_token_reuse',
            entityType: 'Session',
            entityId: reused.id,
            ...client,
          });
          this.logger.warn({ sessionId: reused.id }, 'refresh token reuse detected; session revoked');
        }
      }
      throw unauthorized('Invalid refresh token');
    }
    if (session.revokedAt || session.expiresAt < new Date()) throw unauthorized('Session expired');
    if (session.user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');

    const next = randomToken(48);
    // Compare-and-swap on the current hash so two concurrent refreshes cannot both win.
    const updated = await this.prisma.session.updateMany({
      where: { id: session.id, tokenHash: hash, revokedAt: null },
      data: {
        tokenHash: sha256(next),
        previousTokenHash: hash,
        rotatedAt: new Date(),
        lastUsedAt: new Date(),
        ip: client.ip,
      },
    });
    if (updated.count !== 1) throw unauthorized('Invalid refresh token');
    const accessToken = await this.tokens.signAccessToken({ sub: session.userId, sid: session.id });
    return { accessToken, refreshToken: next, refreshExpiresAt: session.expiresAt };
  }

  async logout(sessionId: string | undefined, refreshToken: string | undefined) {
    if (sessionId) {
      await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    } else if (refreshToken) {
      await this.prisma.session.updateMany({
        where: { tokenHash: sha256(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async logoutAll(userId: string, exceptSessionId?: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, sessionId: string, currentPassword: string, newPassword: string, client: ClientInfo) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest('Current password is incorrect');
    }
    if (currentPassword === newPassword) throw badRequest('New password must be different');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
    await this.logoutAll(userId, sessionId); // sign out other devices
    await this.audit.log({ actorId: userId, action: 'auth.password_changed', entityType: 'User', entityId: userId, ...client });
  }

  /** Always resolves (no account enumeration). Returns the token only for tests/dev logging. */
  async requestPasswordReset(email: string, client: ClientInfo): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') return undefined;
    const token = randomToken(32);
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });
    const link = `${this.env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mailer.send({
      to: user.email,
      subject: 'Reset your password',
      text: `Use this link within 1 hour to reset your password: ${link}\nIf you did not request this, ignore this email.`,
    });
    await this.audit.log({ actorId: user.id, action: 'auth.password_reset_requested', entityType: 'User', entityId: user.id, ...client });
    return token;
  }

  async resetPassword(token: string, newPassword: string, client: ClientInfo) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) throw badRequest('Reset link is invalid or has expired');
    await this.prisma.$transaction(async (tx) => {
      const used = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw badRequest('Reset link is invalid or has expired');
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null },
      });
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    await this.audit.log({ actorId: record.userId, action: 'auth.password_reset', entityType: 'User', entityId: record.userId, ...client });
  }
}
