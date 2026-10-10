import type { PrismaClient } from '@prisma/client';
import { notFound } from '../../lib/errors';

const activePrice = { where: { isActive: true }, orderBy: { createdAt: 'desc' as const }, take: 1 };

export function presentProduct(p: {
  id: string;
  sku: string;
  name: string;
  amount: number;
  bonusAmount: number;
  isFeatured: boolean;
  prices: { priceMinor: number; currency: string }[];
}) {
  const price = p.prices[0];
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    amount: p.amount,
    bonusAmount: p.bonusAmount,
    isFeatured: p.isFeatured,
    priceMinor: price?.priceMinor ?? null,
    currency: price?.currency ?? null,
  };
}

export class CatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  async listGames(search?: string) {
    const games = await this.prisma.game.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        products: {
          where: { isActive: true, deletedAt: null },
          include: { prices: activePrice },
        },
      },
    });
    return games.map((g) => {
      const priced = g.products.map(presentProduct).filter((p) => p.priceMinor !== null);
      const min = priced.reduce<(typeof priced)[number] | undefined>(
        (acc, p) => (!acc || (p.priceMinor ?? 0) < (acc.priceMinor ?? 0) ? p : acc),
        undefined,
      );
      return {
        id: g.id,
        slug: g.slug,
        name: g.name,
        publisher: g.publisher,
        category: g.category,
        description: g.description,
        imageUrl: g.imageUrl,
        currencyName: g.currencyName,
        playerIdLabel: g.playerIdLabel,
        playerIdPattern: g.playerIdPattern,
        playerIdHelp: g.playerIdHelp,
        productCount: priced.length,
        fromPriceMinor: min?.priceMinor ?? null,
        currency: min?.currency ?? null,
      };
    });
  }

  async getGame(slug: string) {
    const game = await this.prisma.game.findFirst({
      where: { slug, isActive: true, deletedAt: null },
      include: {
        products: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { amount: 'asc' }],
          include: { prices: activePrice },
        },
      },
    });
    if (!game) throw notFound('Game');
    return {
      id: game.id,
      slug: game.slug,
      name: game.name,
      publisher: game.publisher,
      category: game.category,
      description: game.description,
      imageUrl: game.imageUrl,
      currencyName: game.currencyName,
      playerIdLabel: game.playerIdLabel,
      playerIdPattern: game.playerIdPattern,
      playerIdHelp: game.playerIdHelp,
      requiresServer: game.requiresServer,
      servers: game.servers,
      products: game.products.map(presentProduct).filter((p) => p.priceMinor !== null),
    };
  }
}
