import crypto from 'node:crypto';
import type { Game, Prisma, PrismaClient, Promotion } from '@prisma/client';
import { applyBps, type CheckoutInput } from '@donat/shared';
import type { Env } from '../../config/env';
import { sha256, stableStringify } from '../../lib/crypto';
import { AppError, badRequest, conflict, notFound, serviceUnavailable, unprocessable } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { AuditService } from '../audit/audit.service';
import type { ProviderManagerService } from '../fulfillment/provider-manager.service';
import { ProviderNotAvailableError } from '../fulfillment/topup-provider';
import type { PaymentService } from '../payments/payment.service';
import type { OrderStateService } from './order-state.service';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const ORDER_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function orderNumber(): string {
  const d = new Date();
  const date = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  let suffix = '';
  for (const b of crypto.randomBytes(6)) suffix += ORDER_NUMBER_ALPHABET[b % ORDER_NUMBER_ALPHABET.length];
  return `DN${date}${suffix}`;
}

export class PlayerIdError extends AppError {
  constructor(message: string, code = 'INVALID_PLAYER_ID') {
    super(400, code, message);
  }
}

/** Validate the player ID format against the game's rules (cheap, local, no supplier call). */
export function checkPlayerIdFormat(game: Pick<Game, 'playerIdPattern' | 'playerIdLabel' | 'requiresServer' | 'servers'>, playerId: string, serverId: string) {
  let pattern: RegExp;
  try {
    pattern = new RegExp(game.playerIdPattern);
  } catch {
    pattern = /^[0-9]{5,15}$/;
  }
  if (!pattern.test(playerId)) throw new PlayerIdError(`${game.playerIdLabel} format is invalid`);
  if (game.requiresServer) {
    if (!serverId) throw new PlayerIdError('Please choose a server', 'SERVER_REQUIRED');
    if (game.servers.length && !game.servers.includes(serverId)) throw new PlayerIdError('Unknown server', 'INVALID_SERVER');
  }
}

export class CheckoutService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
    private readonly providers: ProviderManagerService,
    private readonly payments: PaymentService,
    private readonly orderState: OrderStateService,
    private readonly audit: AuditService,
    private readonly logger: Logger,
  ) {}

  async validatePlayer(gameSlug: string, playerId: string, serverId: string) {
    const game = await this.prisma.game.findFirst({
      where: { slug: gameSlug, isActive: true, deletedAt: null },
      include: { products: { where: { isActive: true, deletedAt: null }, take: 1, orderBy: { sortOrder: 'asc' } } },
    });
    if (!game) throw notFound('Game');
    checkPlayerIdFormat(game, playerId, serverId);
    const product = game.products[0];
    if (!product) throw unprocessable('This game has no products available', 'NO_PRODUCTS');
    return this.remoteValidate(game.slug, product.id, playerId, serverId);
  }

  private async remoteValidate(gameSlug: string, productId: string, playerId: string, serverId: string) {
    try {
      const result = await this.providers.validatePlayer(gameSlug, productId, playerId, serverId || undefined);
      if (!result.valid) throw new PlayerIdError(result.reason ?? 'Player not found', 'PLAYER_NOT_FOUND');
      return { valid: true, nickname: result.nickname ?? null };
    } catch (err) {
      if (err instanceof ProviderNotAvailableError) {
        throw serviceUnavailable('Top-ups for this game are temporarily unavailable');
      }
      throw err;
    }
  }

  /**
   * Create an order (idempotent per user + Idempotency-Key) and start its payment.
   * Re-sending the same request with the same key returns the original order.
   */
  async createOrder(userId: string, input: CheckoutInput, idempotencyKey: string | undefined, client: { ip?: string; userAgent?: string }) {
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw badRequest('A valid Idempotency-Key header (8-128 chars, [A-Za-z0-9_-]) is required');
    }
    const requestHash = sha256(stableStringify({ ...input, savePlayer: undefined }));

    const replay = await this.findReplay(userId, idempotencyKey, requestHash);
    if (replay) return replay;

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, isActive: true, deletedAt: null, game: { isActive: true, deletedAt: null } },
      include: { game: true, prices: { where: { isActive: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!product) throw notFound('Product');
    const price = product.prices[0];
    if (!price) throw unprocessable('This product is not currently for sale', 'NOT_FOR_SALE');

    checkPlayerIdFormat(product.game, input.playerId, input.serverId);
    const validation = await this.remoteValidate(product.game.slug, product.id, input.playerId, input.serverId);

    const promotion = input.promoCode ? await this.loadPromotion(input.promoCode, userId, product.gameId, product.id, price.priceMinor) : null;
    const subtotal = price.priceMinor;
    const discount = promotion ? this.discountFor(promotion, subtotal) : 0;
    const total = subtotal - discount;
    if (total <= 0) throw unprocessable('Order total must be greater than zero', 'INVALID_TOTAL');

    let orderId: string;
    try {
      orderId = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber: orderNumber(),
            userId,
            gameId: product.gameId,
            currency: price.currency,
            subtotalMinor: subtotal,
            discountMinor: discount,
            totalMinor: total,
            costMinor: price.costMinor,
            promotionId: promotion?.id,
            playerId: input.playerId,
            serverId: input.serverId,
            playerNickname: validation.nickname,
            idempotencyKey,
            requestHash,
            items: {
              create: {
                productId: product.id,
                productName: `${product.name}`,
                sku: product.sku,
                quantity: 1,
                unitPriceMinor: subtotal,
                unitCostMinor: price.costMinor,
                totalMinor: subtotal,
              },
            },
            events: { create: { toStatus: 'CREATED', message: 'Order created', actorId: userId } },
          },
        });
        if (promotion) await this.redeem(tx, promotion, userId, order.id);
        await this.orderState.transition(tx, order.id, 'AWAITING_PAYMENT', {
          message: 'Waiting for payment',
          data: { expiresAt: new Date(Date.now() + this.env.ORDER_PAYMENT_TTL_MINUTES * 60_000) },
        });
        if (input.savePlayer) {
          await tx.savedPlayer.upsert({
            where: {
              userId_gameId_playerId_serverId: { userId, gameId: product.gameId, playerId: input.playerId, serverId: input.serverId },
            },
            update: { nickname: validation.nickname },
            create: { userId, gameId: product.gameId, playerId: input.playerId, serverId: input.serverId, nickname: validation.nickname },
          });
        }
        await this.audit.log(
          { actorId: userId, action: 'order.created', entityType: 'Order', entityId: order.id, metadata: { totalMinor: total, sku: product.sku }, ...client },
          tx,
        );
        return order.id;
      });
    } catch (err) {
      // Two identical requests raced: the unique (userId, idempotencyKey) constraint picked a winner.
      if ((err as { code?: string }).code === 'P2002') {
        const raced = await this.findReplay(userId, idempotencyKey, requestHash);
        if (raced) return raced;
      }
      throw err;
    }

    const payment = await this.payments.createPaymentForOrder(orderId, userId);
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    return { order, payment, replayed: false };
  }

  private async findReplay(userId: string, idempotencyKey: string, requestHash: string) {
    const existing = await this.prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: { items: true },
    });
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw conflict('This Idempotency-Key was already used with a different request', 'IDEMPOTENCY_KEY_REUSED');
    }
    const payment = await this.prisma.payment.findFirst({ where: { orderId: existing.id }, orderBy: { createdAt: 'desc' } });
    return { order: existing, payment, replayed: true };
  }

  private async loadPromotion(code: string, userId: string, gameId: string, productId: string, subtotal: number) {
    const now = new Date();
    const promo = await this.prisma.promotion.findUnique({ where: { code } });
    const invalid = (msg: string) => unprocessable(msg, 'INVALID_PROMO');
    if (!promo || !promo.isActive) throw invalid('Promo code is not valid');
    if (promo.startsAt && promo.startsAt > now) throw invalid('Promo code is not active yet');
    if (promo.endsAt && promo.endsAt < now) throw invalid('Promo code has expired');
    if (promo.gameId && promo.gameId !== gameId) throw invalid('Promo code does not apply to this game');
    if (promo.productId && promo.productId !== productId) throw invalid('Promo code does not apply to this package');
    if (promo.minOrderMinor && subtotal < promo.minOrderMinor) throw invalid('Order total is below the promo minimum');
    if (promo.maxRedemptions !== null && promo.redemptionCount >= promo.maxRedemptions) throw invalid('Promo code has been fully redeemed');
    if (promo.perUserLimit !== null) {
      const used = await this.prisma.promotionRedemption.count({ where: { promotionId: promo.id, userId } });
      if (used >= promo.perUserLimit) throw invalid('You have already used this promo code');
    }
    return promo;
  }

  discountFor(promo: Promotion, subtotal: number): number {
    const raw = promo.type === 'PERCENT' ? applyBps(subtotal, promo.percentBps ?? 0, 'floor') : promo.amountMinor ?? 0;
    return Math.max(0, Math.min(raw, subtotal));
  }

  /** Atomic redemption: the conditional increment cannot exceed maxRedemptions under concurrency. */
  private async redeem(tx: Prisma.TransactionClient, promo: Promotion, userId: string, orderId: string) {
    const res = await tx.promotion.updateMany({
      where: {
        id: promo.id,
        isActive: true,
        ...(promo.maxRedemptions !== null ? { redemptionCount: { lt: promo.maxRedemptions } } : {}),
      },
      data: { redemptionCount: { increment: 1 } },
    });
    if (res.count !== 1) throw unprocessable('Promo code has been fully redeemed', 'INVALID_PROMO');
    if (promo.perUserLimit !== null) {
      // Serialise per-user checks on this promotion inside the transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promo:${promo.id}:${userId}`}))`;
      const used = await tx.promotionRedemption.count({ where: { promotionId: promo.id, userId } });
      if (used >= promo.perUserLimit) throw unprocessable('You have already used this promo code', 'INVALID_PROMO');
    }
    await tx.promotionRedemption.create({ data: { promotionId: promo.id, userId, orderId } });
  }
}
