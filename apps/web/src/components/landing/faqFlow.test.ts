import { describe, expect, it } from 'vitest';

import { faqEntries } from './faqFlow';

/**
 * The home-page FAQ used to promise an account that did not exist
 * ("You can create or connect your ChainVerify account after purchase").
 * Task 1 built email sign-up / sign-in, so the answer must now describe the
 * real flow: sign in with the email used at checkout.
 */
describe('faq entries', () => {
  it('never promises an account that cannot be created', () => {
    const text = faqEntries.map((entry) => `${entry.question} ${entry.answer}`).join('\n');
    expect(text).not.toContain('create or connect your ChainVerify account');
    expect(text).not.toContain('create or connect your account');
  });

  it('tells buyers to sign in with the email they used at checkout', () => {
    const checkout = faqEntries.find((entry) => entry.question === 'Do I need an account before checkout?');
    expect(checkout).toBeDefined();
    expect(checkout?.answer).toContain('sign in');
    expect(checkout?.answer).toContain('email');
    expect(checkout?.answer).toContain('checkout');
  });
});
