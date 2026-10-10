import { Prisma, type PrismaClient } from '@prisma/client';

interface SeriesRow {
  bucket: Date;
  orders: bigint;
  revenue: bigint | null;
  profit: bigint | null;
}

const toNum = (v: bigint | number | null | undefined) => Number(v ?? 0);

export class StatsService {
  constructor(private readonly prisma: PrismaClient) {}

  async overview() {
    const [byStatus, fulfilledAgg, refundsAgg, providers] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order.aggregate({ where: { status: 'FULFILLED' }, _sum: { totalMinor: true, costMinor: true }, _count: { _all: true } }),
      this.prisma.refund.aggregate({ where: { status: 'SUCCEEDED' }, _sum: { amountMinor: true } }),
      this.prisma.topUpProvider.findMany({ select: { code: true, name: true, health: true, isEnabled: true, balanceMinor: true, balanceCurrency: true } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>;
    const total = byStatus.reduce((a, s) => a + s._count._all, 0);
    const revenue = toNum(fulfilledAgg._sum.totalMinor);
    const cost = toNum(fulfilledAgg._sum.costMinor);
    const pendingStatuses = ['CREATED', 'AWAITING_PAYMENT', 'PAID', 'QUEUED', 'PROCESSING'];
    return {
      currency: (await this.prisma.productPrice.findFirst({ select: { currency: true } }))?.currency ?? 'USD',
      totalOrders: total,
      completedOrders: counts.FULFILLED ?? 0,
      pendingOrders: pendingStatuses.reduce((a, s) => a + (counts[s] ?? 0), 0),
      failedOrders: counts.FAILED ?? 0,
      manualReviewOrders: counts.MANUAL_REVIEW ?? 0,
      refundedOrders: counts.REFUNDED ?? 0,
      totalRevenueMinor: revenue,
      grossProfitMinor: revenue - cost,
      refundedMinor: toNum(refundsAgg._sum.amountMinor),
      byStatus: counts,
      providers,
    };
  }

  /** Revenue/profit series from FULFILLED orders, bucketed by day or month (UTC). */
  async series(granularity: 'day' | 'month', periods: number) {
    const unit = granularity === 'day' ? Prisma.sql`'day'` : Prisma.sql`'month'`;
    const interval = granularity === 'day' ? `${periods - 1} days` : `${periods - 1} months`;
    const rows = await this.prisma.$queryRaw<SeriesRow[]>`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${unit}, (now() AT TIME ZONE 'UTC')) - ${interval}::interval,
          date_trunc(${unit}, (now() AT TIME ZONE 'UTC')),
          ('1 ' || ${unit})::interval
        ) AS bucket
      )
      SELECT b.bucket,
             COUNT(o.id)::bigint AS orders,
             COALESCE(SUM(o."totalMinor"), 0)::bigint AS revenue,
             COALESCE(SUM(o."totalMinor" - o."costMinor"), 0)::bigint AS profit
      FROM buckets b
      LEFT JOIN "Order" o
        ON o.status = 'FULFILLED'
       AND date_trunc(${unit}, o."fulfilledAt") = b.bucket
      GROUP BY b.bucket
      ORDER BY b.bucket ASC`;
    return rows.map((r) => ({
      bucket: r.bucket.toISOString().slice(0, granularity === 'day' ? 10 : 7),
      orders: toNum(r.orders),
      revenueMinor: toNum(r.revenue),
      profitMinor: toNum(r.profit),
    }));
  }
}
