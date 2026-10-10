'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';

export interface ApiState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  reload: () => Promise<void>;
}

/** GET a resource. Pass null to skip. Optional polling interval in ms. */
export function useApi<T>(path: string | null, pollMs?: number): ApiState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path);
  pathRef.current = path;

  const load = useCallback(async () => {
    const current = pathRef.current;
    if (!current) return;
    try {
      const result = await api<T>(current);
      if (pathRef.current === current) {
        setData(result);
        setError(undefined);
      }
    } catch (err) {
      if (pathRef.current === current) setError(errorMessage(err));
    } finally {
      if (pathRef.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    void load();
    if (!pollMs) return;
    const timer = setInterval(() => void load(), pollMs);
    return () => clearInterval(timer);
  }, [path, pollMs, load]);

  return { data, error, loading, reload: load };
}

/** Wrap an async action with pending + error state. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setPending(true);
    setError(undefined);
    try {
      return await fn();
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, error, setError, run };
}
