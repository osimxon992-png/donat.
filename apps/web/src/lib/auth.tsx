'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<User | null>;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: User }>('/auth/me');
      setUser(res.user);
      return res.user;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status === 401 || err.status === 403) setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const can = useCallback((p: string) => !!user?.permissions.includes(p), [user]);

  return <AuthContext.Provider value={{ user, loading, refresh, setUser, logout, can }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Client-side guard for UX only — every API route is protected server-side. */
export function useRequireAuth(permission?: string) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (permission && !auth.can(permission)) router.replace('/');
  }, [auth, permission, pathname, router]);
  const allowed = !!auth.user && (!permission || auth.can(permission));
  return { ...auth, allowed };
}
