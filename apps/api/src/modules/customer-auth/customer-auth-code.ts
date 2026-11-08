import { ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/**
 * Email-login codes for customer sign-up / sign-in (Task 1).
 *
 * Same pattern as the vendor-portal OTP (invoice-proof/vendor-portal-otp.ts):
 * a 6-digit code from the OS CSPRNG, valid 10 minutes, at most 5 comparisons,
 * only the HMAC of the code is ever persisted. The HMAC is bound to the
 * lower-cased email so a hash cannot be replayed against another address.
 * No passwords exist anywhere in this flow.
 */

/** A code is valid for 10 minutes from issue. */
export const CUSTOMER_LOGIN_CODE_EXPIRY_MS = 10 * 60 * 1000;
/** Comparisons allowed per code. The 5th failed comparison locks the code. */
export const CUSTOMER_LOGIN_CODE_MAX_ATTEMPTS = 5;
/** Longest candidate we will hash; anything longer can never be a valid code. */
const MAX_CANDIDATE_LENGTH = 64;
/** A login session (cookie) lasts 30 days. */
export const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let processLocalDevSecret: Buffer | undefined;

/**
 * Server-side HMAC key for login codes. Fails CLOSED in production when
 * `CUSTOMER_LOGIN_CODE_SECRET` is unset. Outside production an unset secret
 * falls back to a random per-process key (codes survive only for the process
 * lifetime, which is acceptable for dev/test and never a shared constant).
 */
export function resolveCustomerLoginCodeSecret(env: NodeJS.ProcessEnv = process.env): string | Buffer {
  const configured = env.CUSTOMER_LOGIN_CODE_SECRET?.trim();
  if (configured) return configured;
  if (env.NODE_ENV === 'production') {
    throw new ServiceUnavailableException('Email sign-in is temporarily unavailable.');
  }
  processLocalDevSecret ??= randomBytes(32);
  return processLocalDevSecret;
}

/** HMAC-SHA256 of the code, bound to the login email. */
export function hashCustomerLoginCode(secret: string | Buffer, email: string, code: string): string {
  const candidate = code.length <= MAX_CANDIDATE_LENGTH ? code : '';
  return createHmac('sha256', secret).update(`customer-login:v1:${email}:${candidate}`).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function customerLoginCodeHashesMatch(suppliedHash: string, storedHash: string): boolean {
  const a = Buffer.from(suppliedHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/** 6-digit numeric code from the OS CSPRNG. */
export function generateCustomerLoginCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

/** Normalize an email the way every lookup in this module does. */
export function normalizeLoginEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}
