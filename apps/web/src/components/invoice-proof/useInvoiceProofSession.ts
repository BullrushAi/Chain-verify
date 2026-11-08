'use client';

import { createContext, useContext } from 'react';

export interface InvoiceProofSession {
  /** The customer's Chain Verify API key. Empty for email sessions, which authenticate via the session cookie. */
  apiKey: string;
  /** Signed-in email for email sessions; undefined for API-key sessions. */
  email?: string;
  /** How this session was established. */
  authKind?: 'api-key' | 'email';
  /** Clears the session and returns to the sign-in form, optionally explaining why. */
  signOut: (reason?: string) => void;
}

export const InvoiceProofSessionContext = createContext<InvoiceProofSession | null>(null);

export function useInvoiceProofSession(): InvoiceProofSession {
  const session = useContext(InvoiceProofSessionContext);
  if (!session) {
    throw new Error('useInvoiceProofSession must be used inside <InvoiceProofKeyGate>.');
  }
  return session;
}
