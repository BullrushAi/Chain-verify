import { randomBytes } from 'node:crypto';

import { sha256Hex } from './api-key-hash.js';

// Marks keys minted for customers as customer-facing, org-scoped ApiIdentity
// keys — distinct from the cv_admin_ prefix used for AdminIdentity keys
// (see apps/api/scripts/create-admin-key.ts). Shared by the admin panel and
// the customer dashboard so both mint keys the same way: same prefix, same
// hash, same one-time reveal. The plaintext key is returned exactly once, in
// this response — only its hash is ever persisted, so it cannot be recovered
// or displayed again after this call returns.
export const ORG_API_KEY_PREFIX = 'cv_live_';

export const API_KEY_REVEAL_WARNING = 'This key will not be shown again. Store it securely now.';

export interface MintedApiIdentity {
  id: string;
  organizationId: string;
  label: string | null;
  active: boolean;
  createdAt: Date;
}

/**
 * Minimal Prisma surface minting needs — satisfied by PrismaService and by a
 * transaction client, so the admin flow can mint inside its audit-log
 * transaction while the customer flow mints with a plain create.
 */
export interface ApiKeyMintClient {
  apiIdentity: {
    create(args: {
      data: { organizationId: string; label: string | null; apiKeyHash: string };
    }): Promise<MintedApiIdentity & Record<string, unknown>>;
  };
}

export async function mintOrgApiKey(
  client: ApiKeyMintClient,
  organizationId: string,
  label: string,
): Promise<{ identity: MintedApiIdentity; apiKey: string }> {
  const trimmedLabel = (label ?? '').trim() || null;
  const apiKey = `${ORG_API_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
  const created = await client.apiIdentity.create({
    data: { organizationId, label: trimmedLabel, apiKeyHash: sha256Hex(apiKey) },
  });
  // Return only the safe fields — the stored hash never leaves the server,
  // even as a hash (it is the sole credential check).
  const { id, organizationId: orgId, label: storedLabel, active, createdAt } = created;
  return { identity: { id, organizationId: orgId, label: storedLabel, active, createdAt }, apiKey };
}
