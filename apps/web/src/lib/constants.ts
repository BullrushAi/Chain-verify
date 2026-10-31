import { resolvePublicApiBase } from './dashboardUrl';

export const DEFAULT_API_BASE = resolvePublicApiBase(
  process.env.NEXT_PUBLIC_CHAIN_VERIFY_API_BASE,
);

export const AUTH_TOKEN_KEY = 'agent-market-token';
