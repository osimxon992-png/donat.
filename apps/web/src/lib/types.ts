import type { CatalogCategory, OrderStatus } from '@donat/shared';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: string;
  marketingOptIn: boolean;
  createdAt: string;
  role: string;
  permissions: string[];
}

export interface GameSummary {
  id: string;
  slug: string;
  name: string;
  publisher: string | null;
  category: CatalogCategory;
  description: string | null;
  imageUrl: string | null;
  currencyName: string;
  playerIdLabel: string;
  playerIdPattern: string;
  playerIdHelp: string | null;
  productCount: number;
  fromPriceMinor: number | null;
  currency: string | null;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  amount: number;
  bonusAmount: number;
  isFeatured: boolean;
  priceMinor: number;
  currency: string;
}

export interface GameDetail extends Omit<GameSummary, 'productCount' | 'fromPriceMinor' | 'currency'> {
  requiresServer: boolean;
  servers: string[];
  products: Product[];
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  playerId: string;
  serverId: string;
  playerNickname: string | null;
  game: { name: string; slug: string; imageUrl: string | null; currencyName: string; playerIdLabel: string };
  items: { productName: string; quantity: number; unitPriceMinor: number; totalMinor: number }[];
  timeline: { status: OrderStatus; label: string; message: string | null; at: string }[];
  payments: { id: string; provider: string; status: string; amountMinor: number; currency: string; createdAt: string; paidAt: string | null }[];
  refunds: { status: string; amountMinor: number; currency: string; createdAt: string }[];
  checkoutUrl: string | null;
  canPay: boolean;
  canCancel: boolean;
  expiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SavedPlayer {
  id: string;
  gameId: string;
  playerId: string;
  serverId: string;
  label: string | null;
  nickname: string | null;
  game: { name: string; slug: string; playerIdLabel: string };
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ProviderRow {
  id: string;
  code: string;
  name: string;
  type: 'MOCK' | 'AUTHORIZED_HTTP';
  isEnabled: boolean;
  isAuthorized: boolean;
  authorizationNote: string | null;
  priority: number;
  baseUrl: string | null;
  credentialsEnvPrefix: string | null;
  timeoutMs: number;
  health: string;
  lastHealthCheckAt: string | null;
  lastError: string | null;
  balanceMinor: number | null;
  balanceCurrency: string | null;
  blocker: string | null;
  _count: { products: number; attempts: number };
}
