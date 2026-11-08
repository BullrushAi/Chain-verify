import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_LOGIN_CODE_EXPIRY_MS,
  CUSTOMER_LOGIN_CODE_MAX_ATTEMPTS,
  customerLoginCodeHashesMatch,
  generateCustomerLoginCode,
  hashCustomerLoginCode,
  normalizeLoginEmail,
  resolveCustomerLoginCodeSecret,
} from './customer-auth-code.js';

const SECRET = 'test-secret-123';

describe('customer login code helpers', () => {
  it('generates a 6-digit numeric code', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateCustomerLoginCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('hashes deterministically and binds the hash to the email', () => {
    const email = 'buyer@example.com';
    expect(hashCustomerLoginCode(SECRET, email, '482917')).toBe(
      hashCustomerLoginCode(SECRET, email, '482917'),
    );
    expect(hashCustomerLoginCode(SECRET, email, '482917')).not.toBe(
      hashCustomerLoginCode(SECRET, 'other@example.com', '482917'),
    );
    expect(hashCustomerLoginCode(SECRET, email, '482917')).not.toBe(
      hashCustomerLoginCode(SECRET, email, '482918'),
    );
    // A code is never stored or compared in the clear.
    expect(hashCustomerLoginCode(SECRET, email, '482917')).not.toContain('482917');
  });

  it('compares hashes in constant time and rejects malformed digests', () => {
    const hash = hashCustomerLoginCode(SECRET, 'buyer@example.com', '482917');
    expect(customerLoginCodeHashesMatch(hash, hash)).toBe(true);
    expect(customerLoginCodeHashesMatch(hashCustomerLoginCode(SECRET, 'buyer@example.com', '000000'), hash)).toBe(
      false,
    );
    expect(customerLoginCodeHashesMatch('', hash)).toBe(false);
    expect(customerLoginCodeHashesMatch('not-hex', hash)).toBe(false);
  });

  it('normalizes emails the way every lookup does', () => {
    expect(normalizeLoginEmail('  Buyer@Example.COM ')).toBe('buyer@example.com');
    expect(normalizeLoginEmail('not-an-email')).toBeNull();
    expect(normalizeLoginEmail('a@b')).toBeNull();
    expect(normalizeLoginEmail('')).toBeNull();
    expect(normalizeLoginEmail(undefined)).toBeNull();
    expect(normalizeLoginEmail('x'.repeat(250) + '@example.com')).toBeNull();
  });

  it('fails closed in production when no secret is configured', () => {
    expect(() => resolveCustomerLoginCodeSecret({ NODE_ENV: 'production' })).toThrow(
      'temporarily unavailable',
    );
    expect(resolveCustomerLoginCodeSecret({ NODE_ENV: 'production', CUSTOMER_LOGIN_CODE_SECRET: SECRET })).toBe(
      SECRET,
    );
  });

  it('uses the configured secret and the documented limits', () => {
    expect(resolveCustomerLoginCodeSecret({ CUSTOMER_LOGIN_CODE_SECRET: SECRET })).toBe(SECRET);
    expect(CUSTOMER_LOGIN_CODE_EXPIRY_MS).toBe(10 * 60 * 1000);
    expect(CUSTOMER_LOGIN_CODE_MAX_ATTEMPTS).toBe(5);
  });
});
