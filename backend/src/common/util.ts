import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
export const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

/** Short random id with a type prefix, e.g. `run-3f9a1c0b7d2e`. */
export const shortId = (prefix: string, bytes = 6) => `${prefix}-${randomBytes(bytes).toString('hex')}`;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** `PHP 10,000.00` — matches the explanation strings shown in the UI. */
export const php = (n: number) =>
  `PHP ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * JSON.stringify with recursively sorted object keys, matching Python's
 * `json.dumps(obj, sort_keys=True, separators=(",", ":"))`. Used for hashes
 * that must be reproducible.
 */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/** Validate a request body/query with zod; 422 with a readable `detail` on failure. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    throw new UnprocessableEntityException(detail);
  }
  return result.data;
}

/** Prisma Decimal -> number for API responses (money columns are NUMERIC(14,2)). */
export function toPlain<T>(value: T): T {
  if (value instanceof Prisma.Decimal) return value.toNumber() as unknown as T;
  if (Array.isArray(value)) return value.map(toPlain) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as object).map(([k, v]) => [k, toPlain(v)]),
    ) as T;
  }
  return value;
}
