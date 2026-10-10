import type { z } from 'zod';
import { badRequest, validationError } from './errors';

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationError(
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function pagination(query: Record<string, unknown>, maxPageSize = 100): Pagination {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number.parseInt(String(query.pageSize ?? '20'), 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paged<T>(items: T[], total: number, p: Pagination) {
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

/** Route parameter as a plain string (Express 5 types allow string[] for wildcard params). */
export function param(req: { params: Record<string, string | string[] | undefined> }, name: string): string {
  const v = req.params[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join('/');
  throw badRequest(`Missing route parameter: ${name}`);
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
