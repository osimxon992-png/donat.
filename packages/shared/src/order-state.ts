export const ORDER_STATUSES = [
  'CREATED',
  'AWAITING_PAYMENT',
  'PAID',
  'QUEUED',
  'PROCESSING',
  'FULFILLED',
  'FAILED',
  'MANUAL_REVIEW',
  'REFUND_PENDING',
  'REFUNDED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Allowed order state transitions. Payment and fulfillment are separate concerns:
 * payment moves an order up to PAID; fulfillment moves it from QUEUED onward.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  CREATED: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAID', 'CANCELLED', 'MANUAL_REVIEW'],
  PAID: ['QUEUED', 'MANUAL_REVIEW', 'REFUND_PENDING'],
  QUEUED: ['PROCESSING', 'MANUAL_REVIEW', 'REFUND_PENDING'],
  // PROCESSING -> QUEUED is a retry. It is only taken after the supplier confirmed the
  // previous attempt failed or never arrived (see OrderReconciliationService).
  PROCESSING: ['FULFILLED', 'FAILED', 'MANUAL_REVIEW', 'QUEUED'],
  FAILED: ['QUEUED', 'REFUND_PENDING', 'MANUAL_REVIEW'],
  MANUAL_REVIEW: ['QUEUED', 'FULFILLED', 'FAILED', 'REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED', 'MANUAL_REVIEW'],
  FULFILLED: [],
  REFUNDED: [],
  CANCELLED: [],
};

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['FULFILLED', 'REFUNDED', 'CANCELLED'];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  CREATED: 'Created',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  QUEUED: 'Queued for delivery',
  PROCESSING: 'Delivering',
  FULFILLED: 'Delivered',
  FAILED: 'Delivery failed',
  MANUAL_REVIEW: 'Under review',
  REFUND_PENDING: 'Refund pending',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
};

/** Customer-facing progress steps used by the live order tracker. */
export const ORDER_PROGRESS_STEPS: readonly { key: string; label: string; statuses: readonly OrderStatus[] }[] = [
  { key: 'created', label: 'Order placed', statuses: ['CREATED', 'AWAITING_PAYMENT'] },
  { key: 'paid', label: 'Payment confirmed', statuses: ['PAID'] },
  { key: 'queued', label: 'Queued', statuses: ['QUEUED'] },
  { key: 'processing', label: 'Delivering', statuses: ['PROCESSING', 'MANUAL_REVIEW', 'FAILED'] },
  { key: 'done', label: 'Delivered', statuses: ['FULFILLED'] },
];
