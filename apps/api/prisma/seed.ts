/**
 * Idempotent seed: roles, an admin + demo customer, the MOCK supplier and a demo catalogue.
 * Game names are used only as catalogue labels; this project has no affiliation with,
 * and no API access to, any game publisher.
 */
import { PrismaClient } from '@prisma/client';
import { SYSTEM_ROLES, type CatalogCategory, type SystemRoleName } from '@donat/shared';
import { loadEnv } from '../src/config/env';
import { hashPassword } from '../src/lib/crypto';

interface SeedProduct {
  sku: string;
  name: string;
  amount: number;
  bonus?: number;
  costMinor: number;
  priceMinor: number;
  featured?: boolean;
}

interface SeedGame {
  slug: string;
  name: string;
  publisher: string;
  category: CatalogCategory;
  description: string;
  currencyName: string;
  playerIdLabel: string;
  playerIdPattern: string;
  playerIdHelp: string;
  requiresServer?: boolean;
  servers?: string[];
  sortOrder: number;
  products: SeedProduct[];
}

const UZ_PHONE_HELP = 'All 12 digits starting with 998, e.g. 998901234567 — no plus sign or spaces.';

/** Mobile balance packages in so'm. Prices are the USD equivalent plus a small fee. */
function mobilePackages(prefix: string): SeedProduct[] {
  return [
    { sku: `${prefix}-5K`, name: "5 000 so'm", amount: 5_000, costMinor: 40, priceMinor: 45 },
    { sku: `${prefix}-10K`, name: "10 000 so'm", amount: 10_000, costMinor: 80, priceMinor: 89, featured: true },
    { sku: `${prefix}-20K`, name: "20 000 so'm", amount: 20_000, costMinor: 158, priceMinor: 169 },
    { sku: `${prefix}-50K`, name: "50 000 so'm", amount: 50_000, costMinor: 395, priceMinor: 419, featured: true },
    { sku: `${prefix}-100K`, name: "100 000 so'm", amount: 100_000, costMinor: 790, priceMinor: 829 },
  ];
}

const GAMES: SeedGame[] = [
  {
    slug: 'pubg-mobile',
    name: 'PUBG Mobile',
    publisher: 'Demo catalogue entry',
    category: 'games',
    description: 'Unknown Cash (UC) top-up. Enter your numeric Character ID from your in-game profile.',
    currencyName: 'UC',
    playerIdLabel: 'Character ID',
    playerIdPattern: '^[0-9]{6,15}$',
    playerIdHelp: 'Open your profile in-game; the numeric ID is under your nickname.',
    sortOrder: 1,
    products: [
      { sku: 'PUBGM-60', name: '60 UC', amount: 60, costMinor: 85, priceMinor: 99 },
      { sku: 'PUBGM-325', name: '325 UC', amount: 300, bonus: 25, costMinor: 430, priceMinor: 499, featured: true },
      { sku: 'PUBGM-660', name: '660 UC', amount: 600, bonus: 60, costMinor: 860, priceMinor: 999 },
      { sku: 'PUBGM-1800', name: '1800 UC', amount: 1500, bonus: 300, costMinor: 2150, priceMinor: 2499, featured: true },
      { sku: 'PUBGM-3850', name: '3850 UC', amount: 3000, bonus: 850, costMinor: 4300, priceMinor: 4999 },
      { sku: 'PUBGM-8100', name: '8100 UC', amount: 6000, bonus: 2100, costMinor: 8600, priceMinor: 9999 },
    ],
  },
  {
    slug: 'free-fire',
    name: 'Free Fire',
    publisher: 'Demo catalogue entry',
    category: 'games',
    description: 'Diamonds top-up delivered to your player ID.',
    currencyName: 'Diamonds',
    playerIdLabel: 'Player ID',
    playerIdPattern: '^[0-9]{6,12}$',
    playerIdHelp: 'Tap your avatar in the lobby to find your numeric Player ID.',
    sortOrder: 2,
    products: [
      { sku: 'FF-100', name: '100 Diamonds', amount: 100, costMinor: 82, priceMinor: 99 },
      { sku: 'FF-310', name: '310 Diamonds', amount: 310, costMinor: 250, priceMinor: 299, featured: true },
      { sku: 'FF-520', name: '520 Diamonds', amount: 520, costMinor: 410, priceMinor: 499 },
      { sku: 'FF-1060', name: '1060 Diamonds', amount: 1060, costMinor: 830, priceMinor: 999 },
      { sku: 'FF-2180', name: '2180 Diamonds', amount: 2180, costMinor: 1650, priceMinor: 1999 },
    ],
  },
  {
    slug: 'mobile-legends',
    name: 'Mobile Legends',
    publisher: 'Demo catalogue entry',
    category: 'games',
    description: 'Diamonds top-up. Requires your User ID and Zone ID.',
    currencyName: 'Diamonds',
    playerIdLabel: 'User ID',
    playerIdPattern: '^[0-9]{6,12}$',
    playerIdHelp: 'Your User ID and Zone ID are shown on your profile, e.g. 12345678 (1234).',
    requiresServer: true,
    servers: [],
    sortOrder: 3,
    products: [
      { sku: 'MLBB-86', name: '86 Diamonds', amount: 78, bonus: 8, costMinor: 130, priceMinor: 159 },
      { sku: 'MLBB-172', name: '172 Diamonds', amount: 156, bonus: 16, costMinor: 260, priceMinor: 319, featured: true },
      { sku: 'MLBB-257', name: '257 Diamonds', amount: 234, bonus: 23, costMinor: 390, priceMinor: 469 },
      { sku: 'MLBB-706', name: '706 Diamonds', amount: 625, bonus: 81, costMinor: 1050, priceMinor: 1249 },
    ],
  },
  {
    slug: 'genshin-impact',
    name: 'Genshin Impact',
    publisher: 'Demo catalogue entry',
    category: 'games',
    description: 'Genesis Crystals top-up. Choose your server and enter your UID.',
    currencyName: 'Genesis Crystals',
    playerIdLabel: 'UID',
    playerIdPattern: '^[0-9]{9,10}$',
    playerIdHelp: 'Your UID is shown in the bottom-right corner of the game screen.',
    requiresServer: true,
    servers: ['America', 'Europe', 'Asia', 'TW-HK-MO'],
    sortOrder: 4,
    products: [
      { sku: 'GI-60', name: '60 Genesis Crystals', amount: 60, costMinor: 82, priceMinor: 99 },
      { sku: 'GI-330', name: '300 + 30 Genesis Crystals', amount: 300, bonus: 30, costMinor: 410, priceMinor: 499, featured: true },
      { sku: 'GI-1090', name: '980 + 110 Genesis Crystals', amount: 980, bonus: 110, costMinor: 1250, priceMinor: 1499 },
      { sku: 'GI-2240', name: '1980 + 260 Genesis Crystals', amount: 1980, bonus: 260, costMinor: 2500, priceMinor: 2999 },
    ],
  },
  {
    slug: 'cod-mobile',
    name: 'Call of Duty: Mobile',
    publisher: 'Demo catalogue entry',
    category: 'games',
    description: 'COD Points top-up delivered to your Player UID.',
    currencyName: 'CP',
    playerIdLabel: 'Player UID',
    playerIdPattern: '^[0-9]{8,20}$',
    playerIdHelp: 'Find your UID in Settings > Legal and Privacy.',
    sortOrder: 5,
    products: [
      { sku: 'CODM-80', name: '80 CP', amount: 80, costMinor: 82, priceMinor: 99 },
      { sku: 'CODM-420', name: '400 + 20 CP', amount: 400, bonus: 20, costMinor: 410, priceMinor: 499, featured: true },
      { sku: 'CODM-880', name: '800 + 80 CP', amount: 800, bonus: 80, costMinor: 830, priceMinor: 999 },
    ],
  },
  {
    slug: 'brawl-stars',
    name: 'Brawl Stars',
    publisher: 'Demo catalogue entry',
    category: 'games',
    description: 'Gems top-up delivered to your player tag.',
    currencyName: 'Gems',
    playerIdLabel: 'Player tag',
    playerIdPattern: '^[0289PYLQGRJCUV]{3,12}$',
    playerIdHelp: 'Tap your profile picture — the tag is under your name. Type it in capitals, without the #.',
    sortOrder: 6,
    products: [
      { sku: 'BS-30', name: '30 Gems', amount: 30, costMinor: 165, priceMinor: 189 },
      { sku: 'BS-80', name: '80 Gems', amount: 80, costMinor: 410, priceMinor: 469, featured: true },
      { sku: 'BS-170', name: '170 Gems', amount: 170, costMinor: 830, priceMinor: 949 },
      { sku: 'BS-360', name: '360 Gems', amount: 360, costMinor: 1650, priceMinor: 1899 },
      { sku: 'BS-950', name: '950 Gems', amount: 950, costMinor: 4150, priceMinor: 4699 },
    ],
  },
  {
    slug: 'clash-of-clans',
    name: 'Clash of Clans',
    publisher: 'Demo catalogue entry',
    category: 'games',
    description: 'Gems top-up delivered to your village by player tag.',
    currencyName: 'Gems',
    playerIdLabel: 'Player tag',
    playerIdPattern: '^[0289PYLQGRJCUV]{3,12}$',
    playerIdHelp: 'Tap your XP badge in the top-left corner — the tag is under your name. Type it without the #.',
    sortOrder: 7,
    products: [
      { sku: 'COC-500', name: '500 Gems', amount: 500, costMinor: 410, priceMinor: 469 },
      { sku: 'COC-1200', name: '1200 Gems', amount: 1200, costMinor: 830, priceMinor: 949, featured: true },
      { sku: 'COC-2500', name: '2500 Gems', amount: 2500, costMinor: 1650, priceMinor: 1899 },
      { sku: 'COC-6500', name: '6500 Gems', amount: 6500, costMinor: 4150, priceMinor: 4699 },
    ],
  },
  {
    slug: 'roblox',
    name: 'Roblox',
    publisher: 'Demo catalogue entry',
    category: 'games',
    description: 'Robux added to your Roblox account by username.',
    currencyName: 'Robux',
    playerIdLabel: 'Roblox username',
    playerIdPattern: '^[A-Za-z0-9_]{3,20}$',
    playerIdHelp: 'Use your username (shown after the @ on your profile), not your display name.',
    sortOrder: 8,
    products: [
      { sku: 'RBX-400', name: '400 Robux', amount: 400, costMinor: 430, priceMinor: 499 },
      { sku: 'RBX-800', name: '800 Robux', amount: 800, costMinor: 860, priceMinor: 979, featured: true },
      { sku: 'RBX-1700', name: '1700 Robux', amount: 1700, costMinor: 1720, priceMinor: 1949 },
      { sku: 'RBX-4500', name: '4500 Robux', amount: 4500, costMinor: 4300, priceMinor: 4849 },
    ],
  },
  {
    slug: 'standoff-2',
    name: 'Standoff 2',
    publisher: 'Demo catalogue entry',
    category: 'games',
    description: 'Gold top-up delivered to your player ID.',
    currencyName: 'Gold',
    playerIdLabel: 'Player ID',
    playerIdPattern: '^[0-9]{8,10}$',
    playerIdHelp: 'Open your profile from the main menu; the numeric ID is under your nickname.',
    sortOrder: 9,
    products: [
      { sku: 'SO2-100', name: '100 Gold', amount: 100, costMinor: 82, priceMinor: 99 },
      { sku: 'SO2-500', name: '500 Gold', amount: 500, costMinor: 390, priceMinor: 449, featured: true },
      { sku: 'SO2-1000', name: '1000 Gold', amount: 1000, costMinor: 760, priceMinor: 869 },
      { sku: 'SO2-3000', name: '3000 Gold', amount: 3000, costMinor: 2150, priceMinor: 2449 },
    ],
  },
  {
    slug: 'honkai-star-rail',
    name: 'Honkai: Star Rail',
    publisher: 'Demo catalogue entry',
    category: 'games',
    description: 'Oneiric Shards top-up. Choose your server and enter your UID.',
    currencyName: 'Oneiric Shards',
    playerIdLabel: 'UID',
    playerIdPattern: '^[0-9]{9,10}$',
    playerIdHelp: 'Your UID is in the bottom-left corner of the phone menu (Esc on PC).',
    requiresServer: true,
    servers: ['America', 'Europe', 'Asia', 'TW-HK-MO'],
    sortOrder: 10,
    products: [
      { sku: 'HSR-60', name: '60 Oneiric Shards', amount: 60, costMinor: 82, priceMinor: 99 },
      { sku: 'HSR-330', name: '300 + 30 Oneiric Shards', amount: 300, bonus: 30, costMinor: 410, priceMinor: 499, featured: true },
      { sku: 'HSR-1090', name: '980 + 110 Oneiric Shards', amount: 980, bonus: 110, costMinor: 1250, priceMinor: 1499 },
    ],
  },

  // Apps & wallets
  {
    slug: 'telegram-premium',
    name: 'Telegram Premium',
    publisher: 'Demo catalogue entry',
    category: 'services',
    description: 'Premium subscription gifted to any Telegram account — yours or a friend’s.',
    currencyName: 'months',
    playerIdLabel: 'Telegram username',
    playerIdPattern: '^[A-Za-z][A-Za-z0-9_]{4,31}$',
    playerIdHelp: 'Settings > tap your name > Username. Type it without the @.',
    sortOrder: 20,
    products: [
      { sku: 'TGP-3M', name: '3 months', amount: 3, costMinor: 1080, priceMinor: 1199 },
      { sku: 'TGP-6M', name: '6 months', amount: 6, costMinor: 1440, priceMinor: 1599, featured: true },
      { sku: 'TGP-12M', name: '12 months', amount: 12, costMinor: 2610, priceMinor: 2899 },
    ],
  },
  {
    slug: 'telegram-stars',
    name: 'Telegram Stars',
    publisher: 'Demo catalogue entry',
    category: 'services',
    description: 'Stars for bots, mini-apps, paid posts and gifts, sent to a Telegram username.',
    currencyName: 'Stars',
    playerIdLabel: 'Telegram username',
    playerIdPattern: '^[A-Za-z][A-Za-z0-9_]{4,31}$',
    playerIdHelp: 'Settings > tap your name > Username. Type it without the @.',
    sortOrder: 21,
    products: [
      { sku: 'TGS-50', name: '50 Stars', amount: 50, costMinor: 85, priceMinor: 99 },
      { sku: 'TGS-100', name: '100 Stars', amount: 100, costMinor: 170, priceMinor: 199 },
      { sku: 'TGS-250', name: '250 Stars', amount: 250, costMinor: 410, priceMinor: 469, featured: true },
      { sku: 'TGS-500', name: '500 Stars', amount: 500, costMinor: 820, priceMinor: 929 },
      { sku: 'TGS-1000', name: '1000 Stars', amount: 1000, costMinor: 1620, priceMinor: 1829 },
    ],
  },
  {
    slug: 'steam-wallet',
    name: 'Steam Wallet',
    publisher: 'Demo catalogue entry',
    category: 'services',
    description: 'Add funds to a Steam account for games, DLC and the Community Market.',
    currencyName: 'USD',
    playerIdLabel: 'Steam login',
    playerIdPattern: '^[A-Za-z0-9_]{3,32}$',
    playerIdHelp: 'The account name you sign in with — not your profile nickname. It is shown under Account details.',
    sortOrder: 22,
    products: [
      { sku: 'STEAM-5', name: '$5 Steam Wallet', amount: 5, costMinor: 505, priceMinor: 549 },
      { sku: 'STEAM-10', name: '$10 Steam Wallet', amount: 10, costMinor: 1005, priceMinor: 1079, featured: true },
      { sku: 'STEAM-20', name: '$20 Steam Wallet', amount: 20, costMinor: 2005, priceMinor: 2129 },
      { sku: 'STEAM-50', name: '$50 Steam Wallet', amount: 50, costMinor: 5005, priceMinor: 5279 },
    ],
  },
  {
    slug: 'playstation-store',
    name: 'PlayStation Store',
    publisher: 'Demo catalogue entry',
    category: 'services',
    description: 'Wallet funds for a PlayStation Network account (US region).',
    currencyName: 'USD',
    playerIdLabel: 'PSN Online ID',
    playerIdPattern: '^[A-Za-z][A-Za-z0-9_-]{2,15}$',
    playerIdHelp: 'Settings > Users and Accounts > Account > Profile > Online ID.',
    sortOrder: 23,
    products: [
      { sku: 'PSN-10', name: '$10 PSN Wallet', amount: 10, costMinor: 1005, priceMinor: 1079 },
      { sku: 'PSN-25', name: '$25 PSN Wallet', amount: 25, costMinor: 2505, priceMinor: 2649, featured: true },
      { sku: 'PSN-50', name: '$50 PSN Wallet', amount: 50, costMinor: 5005, priceMinor: 5249 },
    ],
  },

  // Mobile balance (Uzbekistan)
  {
    slug: 'beeline-uz',
    name: 'Beeline',
    publisher: 'Demo catalogue entry',
    category: 'mobile',
    description: 'Mobile balance for Beeline Uzbekistan numbers (90, 91).',
    currencyName: "so'm",
    playerIdLabel: 'Phone number',
    playerIdPattern: '^998(90|91)[0-9]{7}$',
    playerIdHelp: UZ_PHONE_HELP,
    sortOrder: 30,
    products: mobilePackages('BEE'),
  },
  {
    slug: 'ucell',
    name: 'Ucell',
    publisher: 'Demo catalogue entry',
    category: 'mobile',
    description: 'Mobile balance for Ucell numbers (93, 94, 50).',
    currencyName: "so'm",
    playerIdLabel: 'Phone number',
    playerIdPattern: '^998(93|94|50)[0-9]{7}$',
    playerIdHelp: UZ_PHONE_HELP,
    sortOrder: 31,
    products: mobilePackages('UCELL'),
  },
  {
    slug: 'mobiuz',
    name: 'Mobiuz',
    publisher: 'Demo catalogue entry',
    category: 'mobile',
    description: 'Mobile balance for Mobiuz numbers (97, 88).',
    currencyName: "so'm",
    playerIdLabel: 'Phone number',
    playerIdPattern: '^998(97|88)[0-9]{7}$',
    playerIdHelp: UZ_PHONE_HELP,
    sortOrder: 32,
    products: mobilePackages('MOBIUZ'),
  },
  {
    slug: 'uzmobile',
    name: 'Uzmobile',
    publisher: 'Demo catalogue entry',
    category: 'mobile',
    description: 'Mobile balance for Uzmobile numbers (95, 99, 77).',
    currencyName: "so'm",
    playerIdLabel: 'Phone number',
    playerIdPattern: '^998(95|99|77)[0-9]{7}$',
    playerIdHelp: UZ_PHONE_HELP,
    sortOrder: 33,
    products: mobilePackages('UZMOBILE'),
  },
];

async function main() {
  const env = loadEnv();
  const prisma = new PrismaClient();
  try {
    // Roles
    for (const [name, permissions] of Object.entries(SYSTEM_ROLES) as [SystemRoleName, readonly string[]][]) {
      await prisma.role.upsert({
        where: { name },
        update: { permissions: [...permissions], isSystem: true },
        create: { name, permissions: [...permissions], isSystem: true, description: `${name.replace('_', ' ').toLowerCase()} (system role)` },
      });
    }
    const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.name, r.id]));

    // Users
    // Empty values (`KEY=` in .env) count as unset.
    const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@donat.local').toLowerCase();
    const customPassword = process.env.SEED_ADMIN_PASSWORD || undefined;
    const adminPassword = customPassword ?? 'ChangeMe-Admin-2026';
    if (env.NODE_ENV === 'production' && (!customPassword || customPassword.length < 12)) {
      throw new Error('Set SEED_ADMIN_PASSWORD (12+ characters) when seeding a production database.');
    }
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { roleId: roles.SUPER_ADMIN! },
      create: { email: adminEmail, name: 'Store Admin', passwordHash: await hashPassword(adminPassword), roleId: roles.SUPER_ADMIN! },
    });
    if (env.NODE_ENV !== 'production') {
      await prisma.user.upsert({
        where: { email: 'customer@donat.local' },
        update: {},
        create: {
          email: 'customer@donat.local',
          name: 'Demo Customer',
          passwordHash: await hashPassword('Customer-2026'),
          roleId: roles.CUSTOMER!,
        },
      });
      await prisma.user.upsert({
        where: { email: 'support@donat.local' },
        update: { roleId: roles.SUPPORT! },
        create: {
          email: 'support@donat.local',
          name: 'Support Agent',
          passwordHash: await hashPassword('Support-2026'),
          roleId: roles.SUPPORT!,
        },
      });
    }

    // Mock supplier (the only usable provider out of the box)
    const mock = await prisma.topUpProvider.upsert({
      where: { code: 'mock-supplier' },
      update: {},
      create: {
        code: 'mock-supplier',
        name: 'Mock Supplier (simulated, no real delivery)',
        type: 'MOCK',
        isEnabled: true,
        priority: 100,
        timeoutMs: 10_000,
      },
    });

    // Catalogue
    for (const g of GAMES) {
      const { products, ...gameData } = g;
      const game = await prisma.game.upsert({
        where: { slug: g.slug },
        // Only the section is synced on re-seed, so admin edits to existing entries survive.
        update: { category: g.category },
        create: { ...gameData, requiresServer: g.requiresServer ?? false, servers: g.servers ?? [] },
      });
      for (const [i, p] of products.entries()) {
        const product = await prisma.product.upsert({
          where: { sku: p.sku },
          update: {},
          create: {
            gameId: game.id,
            sku: p.sku,
            name: p.name,
            amount: p.amount,
            bonusAmount: p.bonus ?? 0,
            isFeatured: p.featured ?? false,
            sortOrder: i,
          },
        });
        const hasPrice = await prisma.productPrice.count({ where: { productId: product.id, isActive: true } });
        if (!hasPrice) {
          await prisma.productPrice.create({
            data: { productId: product.id, currency: env.STORE_CURRENCY, costMinor: p.costMinor, priceMinor: p.priceMinor },
          });
        }
        await prisma.providerProduct.upsert({
          where: { providerId_productId: { providerId: mock.id, productId: product.id } },
          update: {},
          create: { providerId: mock.id, productId: product.id, providerSku: p.sku, costMinor: p.costMinor, currency: env.STORE_CURRENCY },
        });
      }
    }

    // Promotions
    await prisma.promotion.upsert({
      where: { code: 'WELCOME10' },
      update: {},
      create: { code: 'WELCOME10', description: '10% off your first order', type: 'PERCENT', percentBps: 1000, perUserLimit: 1, currency: env.STORE_CURRENCY },
    });
    await prisma.promotion.upsert({
      where: { code: 'SAVE1' },
      update: {},
      create: {
        code: 'SAVE1',
        description: '$1 off orders of $9.99 or more',
        type: 'FIXED',
        amountMinor: 100,
        minOrderMinor: 999,
        maxRedemptions: 500,
        currency: env.STORE_CURRENCY,
      },
    });

    console.log('Seed complete.');
    console.log(`  Admin:    ${adminEmail} / ${customPassword ? '(from SEED_ADMIN_PASSWORD)' : adminPassword}`);
    if (env.NODE_ENV !== 'production') {
      console.log('  Customer: customer@donat.local / Customer-2026');
      console.log('  Support:  support@donat.local / Support-2026');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
