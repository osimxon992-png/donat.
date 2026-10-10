import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buyAndPay, checkout, createTestContext, idemKey, newClient, registerClient, resetDb, type Fixture, type TestContext } from './helpers';

let ctx: TestContext;
let fx: Fixture;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  fx = await resetDb(ctx.prisma);
});

describe('product catalogue', () => {
  it('lists active games with their starting price', async () => {
    const res = await (await newClient(ctx)).get('/api/catalog/games');
    expect(res.status).toBe(200);
    const game = res.body.games.find((g: { slug: string }) => g.slug === 'test-game');
    expect(game.productCount).toBe(2); // inactive product hidden
    expect(game.fromPriceMinor).toBe(999);
  });

  it('returns game details with priced, active products only', async () => {
    const res = await (await newClient(ctx)).get('/api/catalog/games/test-game');
    expect(res.status).toBe(200);
    expect(res.body.game.products.map((p: { sku: string }) => p.sku)).toEqual(['TG-100', 'TG-500']);
    expect(res.body.game.products[0]).not.toHaveProperty('costMinor');
  });

  it('hides disabled games', async () => {
    await ctx.prisma.game.update({ where: { id: fx.gameId }, data: { isActive: false } });
    const res = await (await newClient(ctx)).get('/api/catalog/games/test-game');
    expect(res.status).toBe(404);
  });
});

describe('player ID validation', () => {
  it('accepts a valid player and returns the nickname', async () => {
    const res = await (await newClient(ctx)).post('/api/catalog/games/test-game/validate-player', { playerId: '51234567' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true, nickname: 'Player_4567' });
  });

  it('rejects malformed IDs before calling the supplier', async () => {
    const client = await newClient(ctx);
    const bad = await client.post('/api/catalog/games/test-game/validate-player', { playerId: '12ab' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_PLAYER_ID');
    const injection = await client.post('/api/catalog/games/test-game/validate-player', { playerId: "1'; DROP TABLE x;--" });
    expect(injection.status).toBe(400);
  });

  it('rejects players the supplier does not know', async () => {
    const res = await (await newClient(ctx)).post('/api/catalog/games/test-game/validate-player', { playerId: '0001234' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PLAYER_NOT_FOUND');
  });

  it('enforces server selection for games that need it', async () => {
    const client = await newClient(ctx);
    const missing = await client.post(`/api/catalog/games/${fx.serverGameSlug}/validate-player`, { playerId: '123456789' });
    expect(missing.body.error.code).toBe('SERVER_REQUIRED');
    const wrong = await client.post(`/api/catalog/games/${fx.serverGameSlug}/validate-player`, { playerId: '123456789', serverId: 'MARS' });
    expect(wrong.body.error.code).toBe('INVALID_SERVER');
    const ok = await client.post(`/api/catalog/games/${fx.serverGameSlug}/validate-player`, { playerId: '123456789', serverId: 'EU' });
    expect(ok.status).toBe(200);
  });
});

describe('checkout', () => {
  it('requires authentication', async () => {
    const res = await checkout(await newClient(ctx), { productId: fx.productId, playerId: '51234567' });
    expect(res.status).toBe(401);
  });

  it('creates an order awaiting payment with server-side prices', async () => {
    const { client } = await registerClient(ctx);
    const res = await checkout(client, { productId: fx.productId, playerId: '51234567', priceMinor: 1 });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('AWAITING_PAYMENT');
    expect(res.body.order.totalMinor).toBe(999); // client-sent price ignored
    expect(res.body.payment.checkoutUrl).toContain('/checkout/');
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: res.body.order.id } });
    expect(order.costMinor).toBe(850);
  });

  it('requires an Idempotency-Key and replays the same order for the same key', async () => {
    const { client } = await registerClient(ctx);
    const missing = await client.post('/api/orders', { productId: fx.productId, playerId: '51234567' });
    expect(missing.status).toBe(400);

    const key = idemKey();
    const a = await checkout(client, { productId: fx.productId, playerId: '51234567' }, key);
    const b = await checkout(client, { productId: fx.productId, playerId: '51234567' }, key);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.replayed).toBe(true);
    expect(b.body.order.id).toBe(a.body.order.id);
    expect(await ctx.prisma.order.count()).toBe(1);

    const conflict = await checkout(client, { productId: fx.product2Id, playerId: '51234567' }, key);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects invalid player IDs, unknown players and inactive products', async () => {
    const { client } = await registerClient(ctx);
    expect((await checkout(client, { productId: fx.productId, playerId: 'abc' })).status).toBe(400);
    const unknown = await checkout(client, { productId: fx.productId, playerId: '0009999' });
    expect(unknown.body.error.code).toBe('PLAYER_NOT_FOUND');
    expect((await checkout(client, { productId: fx.inactiveProductId, playerId: '51234567' })).status).toBe(404);
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it('applies promo codes with integer math and per-user limits', async () => {
    await ctx.prisma.promotion.create({ data: { code: 'TEN', type: 'PERCENT', percentBps: 1000, perUserLimit: 1 } });
    const { client } = await registerClient(ctx);
    const res = await checkout(client, { productId: fx.productId, playerId: '51234567', promoCode: 'ten' });
    expect(res.status).toBe(201);
    expect(res.body.order.discountMinor).toBe(99); // floor(999 * 10%)
    expect(res.body.order.totalMinor).toBe(900);
    const again = await checkout(client, { productId: fx.productId, playerId: '51234567', promoCode: 'TEN' });
    expect(again.status).toBe(422);
    const invalid = await checkout(client, { productId: fx.productId, playerId: '51234567', promoCode: 'NOPE' });
    expect(invalid.body.error.code).toBe('INVALID_PROMO');
  });

  it('saves the player ID when requested', async () => {
    const { client } = await registerClient(ctx);
    await checkout(client, { productId: fx.productId, playerId: '51234567', savePlayer: true });
    const saved = await client.get('/api/account/saved-players');
    expect(saved.body.players).toHaveLength(1);
    expect(saved.body.players[0].nickname).toBe('Player_4567');
  });

  it('lets the customer cancel an unpaid order and frees the promo redemption', async () => {
    await ctx.prisma.promotion.create({ data: { code: 'ONCE', type: 'FIXED', amountMinor: 100, maxRedemptions: 1 } });
    const { client } = await registerClient(ctx);
    const res = await checkout(client, { productId: fx.productId, playerId: '51234567', promoCode: 'ONCE' });
    expect((await client.post(`/api/orders/${res.body.order.id}/cancel`)).status).toBe(200);
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: res.body.order.id } });
    expect(order.status).toBe('CANCELLED');
    expect((await ctx.prisma.promotion.findUniqueOrThrow({ where: { code: 'ONCE' } })).redemptionCount).toBe(0);
  });

  it('does not expose other users’ orders', async () => {
    const { client: alice } = await registerClient(ctx);
    const { client: bob } = await registerClient(ctx);
    const res = await checkout(alice, { productId: fx.productId, playerId: '51234567' });
    expect((await bob.get(`/api/orders/${res.body.order.id}`)).status).toBe(404);
    expect((await bob.post(`/api/payments/${res.body.payment.id}/mock-complete`, { outcome: 'success' })).status).toBe(404);
  });
});

describe('complete mock purchase flow', () => {
  it('goes from checkout to delivered and notifies the customer', async () => {
    const { client } = await registerClient(ctx);
    const { orderId, order } = await buyAndPay(ctx, client, fx.productId, '51234567');
    expect(order.status).toBe('FULFILLED');
    expect(order.attempts).toHaveLength(1);
    expect(order.attempts[0]!.status).toBe('SUCCEEDED');
    expect(ctx.mockSupplier().deliveries.get(order.orderNumber)).toBe(1);

    const view = await client.get(`/api/orders/${orderId}`);
    expect(view.body.order.status).toBe('FULFILLED');
    expect(view.body.order.timeline.map((t: { status: string }) => t.status)).toEqual([
      'CREATED',
      'AWAITING_PAYMENT',
      'PAID',
      'QUEUED',
      'PROCESSING',
      'FULFILLED',
    ]);
    const payments = await client.get('/api/payments');
    expect(payments.body.items[0].status).toBe('SUCCEEDED');
    const notes = await client.get('/api/account/notifications');
    expect(notes.body.items.map((n: { type: string }) => n.type)).toEqual(expect.arrayContaining(['payment.succeeded', 'order.fulfilled']));
  });
});

describe('concurrent purchases', () => {
  it('creates exactly one order for parallel requests with the same idempotency key', async () => {
    const { client } = await registerClient(ctx);
    const key = idemKey();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkout(client, { productId: fx.productId, playerId: '51234567' }, key)),
    );
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.order.id)).size).toBe(1);
    expect(await ctx.prisma.order.count()).toBe(1);
  });

  it('never exceeds a promotion’s redemption limit under concurrency', async () => {
    await ctx.prisma.promotion.create({ data: { code: 'LIMITED', type: 'FIXED', amountMinor: 100, maxRedemptions: 2 } });
    const clients = await Promise.all(Array.from({ length: 6 }, () => registerClient(ctx)));
    const results = await Promise.all(
      clients.map(({ client }) => checkout(client, { productId: fx.productId, playerId: '51234567', promoCode: 'LIMITED' })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect((await ctx.prisma.promotion.findUniqueOrThrow({ where: { code: 'LIMITED' } })).redemptionCount).toBe(2);
  });

  it('fulfills many customers buying at the same time, each exactly once', async () => {
    const clients = await Promise.all(Array.from({ length: 5 }, () => registerClient(ctx)));
    const created = await Promise.all(clients.map(({ client }) => checkout(client, { productId: fx.productId, playerId: '51234567' })));
    await Promise.all(
      created.map((r, i) => clients[i]!.client.post(`/api/payments/${r.body.payment.id}/mock-complete`, { outcome: 'success' })),
    );
    await ctx.queue.drain();
    const orders = await ctx.prisma.order.findMany();
    expect(orders).toHaveLength(5);
    expect(orders.every((o) => o.status === 'FULFILLED')).toBe(true);
    for (const o of orders) expect(ctx.mockSupplier().deliveries.get(o.orderNumber)).toBe(1);
  });
});
