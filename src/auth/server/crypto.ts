import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/** 256 random bits as base64url (43 characters): invite tokens and recovery grants. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** The SHA-256 of a token as 64 hex characters: what the database stores. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function newOperationId(): string {
  return randomUUID();
}

/** Trim and lower-case: the canonical email for limits and pseudonyms (standard section 7). */
export function canonicalEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** A deliberately loose shape check: one @, something either side, a dot in the domain. */
export function looksLikeEmail(value: string): boolean {
  return value.length >= 3 && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export interface HmacKey {
  version: string;
  secret: string;
}

/** Splits `v1:<secret>`. Throws on any other shape, never echoing the value. */
export function parseHmacKey(value: string): HmacKey {
  const match = /^(v[0-9]+):([A-Za-z0-9+/=_-]{32,})$/.exec(value);
  if (!match) throw new Error('AUDIT_HMAC_KEY must be a version, a colon, then at least 32 random characters.');
  return { version: match[1], secret: match[2] };
}

/**
 * The HMAC-SHA-256 pseudonym of a canonical email, `v1:<64 hex>`. Pre-auth
 * audit events store this, never the address (standard section 11).
 */
export function emailPseudonym(email: string, key: HmacKey): string {
  const digest = createHmac('sha256', key.secret).update(canonicalEmail(email), 'utf8').digest('hex');
  return `${key.version}:${digest}`;
}

/** Constant-time string equality. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
