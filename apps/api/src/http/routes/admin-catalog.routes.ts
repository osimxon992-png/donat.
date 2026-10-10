import { CATALOG_CATEGORIES, marginBps, priceFromMarkup } from '@donat/shared';
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { param, parse, str } from '../../lib/validate';
import { clientInfo, type AuthMiddleware } from '../auth-middleware';
import { imageUpload, saveImage } from '../uploads';

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers and dashes').max(60);
const minor = z.number().int().min(0).max(1_000_000_000);
const currency = z.string().trim().toUpperCase().length(3);

const regexString = z
  .string()
  .max(200)
  .refine((v) => {
    try {
      new RegExp(v);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid regular expression');

const gameSchema = z.object({
  slug,
  name: z.string().trim().min(2).max(80),
  publisher: z.string().trim().max(80).optional().nullable(),
  category: z.enum(CATALOG_CATEGORIES).default('games'),
  description: z.string().trim().max(2000).optional().nullable(),
  currencyName: z.string().trim().min(1).max(40).default('Credits'),
  playerIdLabel: z.string().trim().min(1).max(40).default('Player ID'),
  playerIdPattern: regexString.default('^[0-9]{5,15}$'),
  playerIdHelp: z.string().trim().max(300).optional().nullable(),
  requiresServer: z.boolean().default(false),
  servers: z.array(z.string().trim().min(1).max(32)).max(50).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

const productSchema = z.object({
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,40}$/, 'SKU must be A-Z, 0-9, _ or -'),
  name: z.string().trim().min(1).max(80),
  amount: z.number().int().min(1).max(10_000_000),
  bonusAmount: z.number().int().min(0).max(10_000_000).default(0),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

const priceSchema = z
  .object({
    currency: currency.default('USD'),
    costMinor: minor,
    pricingMode: z.enum(['FIXED', 'MARKUP']).default('FIXED'),
    priceMinor: minor.optional(),
    markupBps: z.number().int().min(0).max(100_000).optional(),
  })
  .refine((v) => (v.pricingMode === 'FIXED' ? v.priceMinor !== undefined : v.markupBps !== undefined), {
    message: 'FIXED pricing needs priceMinor; MARKUP pricing needs markupBps',
  });

const promotionSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/),
    description: z.string().trim().max(200).optional().nullable(),
    type: z.enum(['PERCENT', 'FIXED']),
    percentBps: z.number().int().min(1).max(10_000).optional().nullable(),
    amountMinor: minor.optional().nullable(),
    currency: currency.default('USD'),
    minOrderMinor: minor.optional().nullable(),
    maxRedemptions: z.number().int().min(1).optional().nullable(),
    perUserLimit: z.number().int().min(1).optional().nullable(),
    gameId: z.string().optional().nullable(),
    productId: z.string().optional().nullable(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => (v.type === 'PERCENT' ? !!v.percentBps : !!v.amountMinor), {
    message: 'PERCENT promotions need percentBps; FIXED promotions need amountMinor',
  });

function uniqueViolation(err: unknown, what: string): never {
  if ((err as { code?: string }).code === 'P2002') throw conflict(`${what} already exists`, 'DUPLICATE');
  throw err;
}

export function adminCatalogRoutes(c: Container, mw: AuthMiddleware) {
  const r = Router();
  const canGames = mw.requirePermission('games:write');
  const canPricing = mw.requirePermission('pricing:write');
  const canPromos = mw.requirePermission('promotions:write');
  const audit = (req: Parameters<typeof clientInfo>[0], action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>) =>
    c.audit.log({ actorId: req.auth!.userId, action, entityType, entityId, metadata, ...clientInfo(req) });

  // ── Overview ──
  r.get('/overview', mw.requirePermission('dashboard:read'), async (_req, res) => {
    const [overview, daily, monthly] = await Promise.all([c.stats.overview(), c.stats.series('day', 30), c.stats.series('month', 12)]);
    res.json({ overview, daily, monthly });
  });

  // ── Games ──
  r.get('/games', async (req, res) => {
    const includeDeleted = req.query.includeDeleted === 'true';
    const games = await c.prisma.game.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { deletedAt: null } }, orders: true } } },
    });
    res.json({ games });
  });

  r.post('/games', canGames, async (req, res) => {
    const input = parse(gameSchema, req.body);
    const game = await c.prisma.game.create({ data: input }).catch((e) => uniqueViolation(e, 'A game with this slug'));
    await audit(req, 'game.created', 'Game', game.id, { slug: game.slug });
    res.status(201).json({ game });
  });

  r.get('/games/:id', async (req, res) => {
    const game = await c.prisma.game.findUnique({
      where: { id: param(req, 'id') },
      include: {
        products: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { amount: 'asc' }],
          include: {
            prices: { where: { isActive: true }, take: 1, orderBy: { createdAt: 'desc' } },
            providerProducts: { include: { provider: { select: { code: true, name: true } } } },
          },
        },
      },
    });
    if (!game) throw notFound('Game');
    res.json({ game });
  });

  r.patch('/games/:id', canGames, async (req, res) => {
    const input = parse(gameSchema.partial(), req.body);
    const game = await c.prisma.game.update({ where: { id: param(req, 'id') }, data: input }).catch((e) => uniqueViolation(e, 'A game with this slug'));
    await audit(req, 'game.updated', 'Game', game.id, input);
    res.json({ game });
  });

  r.delete('/games/:id', canGames, async (req, res) => {
    const game = await c.prisma.game.update({ where: { id: param(req, 'id') }, data: { deletedAt: new Date(), isActive: false } });
    await audit(req, 'game.deleted', 'Game', game.id);
    res.json({ ok: true });
  });

  r.post('/games/:id/image', canGames, imageUpload(c.env.MAX_UPLOAD_BYTES), async (req, res) => {
    const exists = await c.prisma.game.findUnique({ where: { id: param(req, 'id') } });
    if (!exists) throw notFound('Game');
    const imageUrl = await saveImage(req.file, c.env.UPLOAD_DIR);
    const game = await c.prisma.game.update({ where: { id: param(req, 'id') }, data: { imageUrl } });
    await audit(req, 'game.image_uploaded', 'Game', game.id, { imageUrl });
    res.json({ game });
  });

  // ── Products ──
  r.post('/games/:id/products', canGames, async (req, res) => {
    const input = parse(productSchema.extend({ price: priceSchema.optional() }), req.body);
    const { price, ...data } = input;
    const product = await c.prisma
      .$transaction(async (tx) => {
        const p = await tx.product.create({ data: { ...data, gameId: param(req, 'id') } });
        if (price) await createPrice(tx, p.id, price, req.auth!.userId);
        return p;
      })
      .catch((e) => uniqueViolation(e, 'A product with this SKU'));
    await audit(req, 'product.created', 'Product', product.id, { sku: product.sku });
    res.status(201).json({ product });
  });

  r.patch('/products/:id', canGames, async (req, res) => {
    const input = parse(productSchema.partial(), req.body);
    const product = await c.prisma.product.update({ where: { id: param(req, 'id') }, data: input }).catch((e) => uniqueViolation(e, 'A product with this SKU'));
    await audit(req, 'product.updated', 'Product', product.id, input);
    res.json({ product });
  });

  r.delete('/products/:id', canGames, async (req, res) => {
    await c.prisma.product.update({ where: { id: param(req, 'id') }, data: { deletedAt: new Date(), isActive: false } });
    await audit(req, 'product.deleted', 'Product', param(req, 'id'));
    res.json({ ok: true });
  });

  // ── Pricing ──
  r.get('/pricing', async (req, res) => {
    const gameId = str(req.query.gameId);
    const products = await c.prisma.product.findMany({
      where: { deletedAt: null, ...(gameId ? { gameId } : {}) },
      orderBy: [{ game: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { amount: 'asc' }],
      include: {
        game: { select: { id: true, name: true } },
        prices: { where: { isActive: true }, take: 1, orderBy: { createdAt: 'desc' } },
        providerProducts: { where: { isActive: true }, select: { costMinor: true, currency: true, provider: { select: { code: true } } } },
      },
    });
    res.json({
      products: products.map((p) => {
        const price = p.prices[0];
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          isActive: p.isActive,
          game: p.game,
          price: price ?? null,
          marginBps: price ? marginBps(price.priceMinor, price.costMinor) : null,
          profitMinor: price ? price.priceMinor - price.costMinor : null,
          supplierCosts: p.providerProducts,
        };
      }),
    });
  });

  r.put('/products/:id/price', canPricing, async (req, res) => {
    const input = parse(priceSchema, req.body);
    const product = await c.prisma.product.findUnique({ where: { id: param(req, 'id') } });
    if (!product) throw notFound('Product');
    const price = await c.prisma.$transaction((tx) => createPrice(tx, product.id, input, req.auth!.userId));
    await audit(req, 'price.updated', 'Product', product.id, { ...input, priceMinor: price.priceMinor });
    res.json({ price });
  });

  r.get('/products/:id/price-history', async (req, res) => {
    const prices = await c.prisma.productPrice.findMany({ where: { productId: param(req, 'id') }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ prices });
  });

  /** Dynamic pricing: re-apply a markup to every product (optionally one game) from its current cost. */
  r.post('/pricing/apply-markup', canPricing, async (req, res) => {
    const input = parse(z.object({ markupBps: z.number().int().min(0).max(100_000), gameId: z.string().optional() }), req.body);
    const products = await c.prisma.product.findMany({
      where: { deletedAt: null, ...(input.gameId ? { gameId: input.gameId } : {}) },
      include: { prices: { where: { isActive: true }, take: 1, orderBy: { createdAt: 'desc' } } },
    });
    let updated = 0;
    await c.prisma.$transaction(async (tx) => {
      for (const p of products) {
        const current = p.prices[0];
        if (!current) continue;
        await createPrice(tx, p.id, { currency: current.currency, costMinor: current.costMinor, pricingMode: 'MARKUP', markupBps: input.markupBps }, req.auth!.userId);
        updated++;
      }
    });
    await c.audit.log({ actorId: req.auth!.userId, action: 'price.bulk_markup', entityType: 'Product', metadata: { ...input, updated }, ...clientInfo(req) });
    res.json({ updated });
  });

  // ── Promotions ──
  r.get('/promotions', async (_req, res) => {
    const promotions = await c.prisma.promotion.findMany({
      orderBy: { createdAt: 'desc' },
      include: { game: { select: { name: true } }, product: { select: { name: true, sku: true } } },
    });
    res.json({ promotions });
  });

  r.post('/promotions', canPromos, async (req, res) => {
    const input = parse(promotionSchema, req.body);
    const promotion = await c.prisma.promotion.create({ data: input }).catch((e) => uniqueViolation(e, 'A promotion with this code'));
    await audit(req, 'promotion.created', 'Promotion', promotion.id, { code: promotion.code });
    res.status(201).json({ promotion });
  });

  r.patch('/promotions/:id', canPromos, async (req, res) => {
    const input = parse(
      z.object({
        description: z.string().trim().max(200).nullable().optional(),
        isActive: z.boolean().optional(),
        maxRedemptions: z.number().int().min(1).nullable().optional(),
        perUserLimit: z.number().int().min(1).nullable().optional(),
        endsAt: z.coerce.date().nullable().optional(),
        startsAt: z.coerce.date().nullable().optional(),
      }),
      req.body,
    );
    const promotion = await c.prisma.promotion.update({ where: { id: param(req, 'id') }, data: input });
    await audit(req, 'promotion.updated', 'Promotion', promotion.id, input);
    res.json({ promotion });
  });

  r.delete('/promotions/:id', canPromos, async (req, res) => {
    const used = await c.prisma.promotionRedemption.count({ where: { promotionId: param(req, 'id') } });
    if (used > 0) {
      await c.prisma.promotion.update({ where: { id: param(req, 'id') }, data: { isActive: false } });
    } else {
      await c.prisma.promotion.delete({ where: { id: param(req, 'id') } });
    }
    await audit(req, used > 0 ? 'promotion.deactivated' : 'promotion.deleted', 'Promotion', param(req, 'id'));
    res.json({ ok: true, deactivated: used > 0 });
  });

  return r;
}

async function createPrice(
  tx: Prisma.TransactionClient,
  productId: string,
  input: { currency: string; costMinor: number; pricingMode: 'FIXED' | 'MARKUP'; priceMinor?: number; markupBps?: number },
  actorId: string,
) {
  const priceMinor = input.pricingMode === 'MARKUP' ? priceFromMarkup(input.costMinor, input.markupBps ?? 0) : input.priceMinor!;
  if (priceMinor <= 0) throw badRequest('Price must be greater than zero');
  await tx.productPrice.updateMany({ where: { productId, isActive: true }, data: { isActive: false } });
  return tx.productPrice.create({
    data: {
      productId,
      currency: input.currency,
      costMinor: input.costMinor,
      priceMinor,
      pricingMode: input.pricingMode,
      markupBps: input.pricingMode === 'MARKUP' ? input.markupBps : null,
      createdById: actorId,
    },
  });
}
