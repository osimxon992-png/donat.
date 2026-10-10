'use client';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

async function ensureCsrf(): Promise<string> {
  const existing = readCookie('csrf_token');
  if (existing) return existing;
  const res = await fetch('/api/auth/csrf', { credentials: 'include' });
  const body = (await res.json()) as { csrfToken: string };
  return body.csrfToken;
}

let refreshing: Promise<boolean> | null = null;

/** Rotate the refresh token once, shared by concurrent callers. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const csrf = await ensureCsrf();
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrf },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Internal: whether a 401 may trigger one token refresh + retry. */
  retry?: boolean;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['content-type'] = 'application/json';
  }
  if (method !== 'GET') headers['x-csrf-token'] = await ensureCsrf();

  const res = await fetch(`/api${path}`, { method, headers, body, credentials: 'include', cache: 'no-store' });

  if (res.status === 401 && opts.retry !== false && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    if (await refreshSession()) return api<T>(path, { ...opts, retry: false });
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return data as T;
}

/** Human-friendly error text, including field-level validation messages. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      return (err.details as { path: string; message: string }[])
        .map((d) => (d.path ? `${d.path}: ${d.message}` : d.message))
        .join('. ');
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}

export function newIdempotencyKey(): string {
  return `web-${crypto.randomUUID()}`;
}
