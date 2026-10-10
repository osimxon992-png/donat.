export const PERMISSIONS = [
  'admin:access',
  'dashboard:read',
  'games:write',
  'orders:read',
  'orders:manage',
  'orders:refund',
  'pricing:write',
  'promotions:write',
  'providers:read',
  'providers:write',
  'users:read',
  'users:write',
  'roles:write',
  'audit:read',
  'support:manage',
  'webhooks:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const SYSTEM_ROLES: Readonly<Record<'CUSTOMER' | 'SUPPORT' | 'ADMIN' | 'SUPER_ADMIN', readonly Permission[]>> = {
  CUSTOMER: [],
  SUPPORT: ['admin:access', 'dashboard:read', 'orders:read', 'users:read', 'support:manage'],
  ADMIN: PERMISSIONS.filter((p) => p !== 'roles:write'),
  SUPER_ADMIN: [...PERMISSIONS],
};

export type SystemRoleName = keyof typeof SYSTEM_ROLES;

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
