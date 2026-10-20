import { badRequest } from './http';

type Source = Record<string, unknown> | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const requireString = (source: Source, key: string, opts: { min?: number; max?: number } = {}): string => {
  const value = source?.[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`${key} is required`);
  }
  const trimmed = value.trim();
  if (opts.min !== undefined && trimmed.length < opts.min) {
    throw badRequest(`${key} must be at least ${opts.min} characters`);
  }
  if (opts.max !== undefined && trimmed.length > opts.max) {
    throw badRequest(`${key} must be at most ${opts.max} characters`);
  }
  return trimmed;
};

export const optionalString = (source: Source, key: string, opts: { max?: number } = {}): string | undefined => {
  const value = source?.[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw badRequest(`${key} must be a string`);
  const trimmed = value.trim();
  if (opts.max !== undefined && trimmed.length > opts.max) {
    throw badRequest(`${key} must be at most ${opts.max} characters`);
  }
  return trimmed;
};

export const requireEmail = (source: Source, key = 'email'): string => {
  const value = requireString(source, key, { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(value)) throw badRequest(`${key} must be a valid email address`);
  return value;
};

export const requirePositiveNumber = (source: Source, key: string): number => {
  const raw = source?.[key];
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw badRequest(`${key} must be a positive number`);
  }
  return value;
};

export const optionalNumber = (source: Source, key: string): number | undefined => {
  const raw = source?.[key];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw badRequest(`${key} must be a number`);
  return value;
};

export const optionalBoolean = (source: Source, key: string): boolean | undefined => {
  const raw = source?.[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'boolean') throw badRequest(`${key} must be a boolean`);
  return raw;
};

/** Reads a query parameter that may be repeated or comma-separated (?brand=Apple,Sony or ?brand=Apple&brand=Sony). */
export const queryList = (value: unknown): string[] => {
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .filter((part): part is string => typeof part === 'string')
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter(Boolean);
};

export const queryString = (value: unknown): string | undefined => {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.trim() !== '' ? first.trim() : undefined;
};

export const queryInt = (
  value: unknown,
  fallback: number,
  options: { min?: number; max?: number } = {},
): number => {
  const raw = queryString(value);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw badRequest(`Expected an integer, received "${raw}"`);
  const min = options.min ?? -Infinity;
  const max = options.max ?? Infinity;
  return Math.min(max, Math.max(min, parsed));
};

export const queryNumber = (value: unknown): number | undefined => {
  const raw = queryString(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw badRequest(`Expected a number, received "${raw}"`);
  return parsed;
};
