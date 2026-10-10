'use client';

import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '@donat/shared';
import { useState } from 'react';
import { OrderList } from '@/components/order-list';
import { EmptyState, ErrorBox, Loading, PageHeader, Pagination } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import type { CustomerOrder, Paged } from '@/lib/types';

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, error, loading } = useApi<Paged<CustomerOrder>>(`/orders?page=${page}&pageSize=15${status ? `&status=${status}` : ''}`);

  return (
    <div>
      <PageHeader
        title="Order history"
        actions={
          <select
            className="input w-48"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        }
      />
      <ErrorBox message={error} />
      {loading && !data ? <Loading /> : data?.items.length ? <OrderList orders={data.items} /> : <EmptyState title="No orders found" />}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
