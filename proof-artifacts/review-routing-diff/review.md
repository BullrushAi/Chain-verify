# Review: point web clients at the live Render API

📋 Summary

Overview: The uncommitted `apps/web` diff points user-dashboard proxies and public API defaults at `https://chain-verify-api-63eg.onrender.com`, on `/api/user-dashboard/overview` and the other five suffixes. `chain-verify-api.onrender.com` and `api.chainverify.org` are rewritten. An empty server base stays `http://localhost:3001`. The Authorization bearer forward is unchanged. Approve. No blocking findings.

Strengths: `dashboardUrl` and `resolveConfiguredApiBase` own the host swap, the `/api` prefix, and the local fallback. A stale base that still has `/api`, a port, userinfo, or mixed case still becomes `https://chain-verify-api-63eg.onrender.com/api/user-dashboard/overview`. `constants.ts` and `proof-api.ts` use the same rewrite. Development with `NEXT_PUBLIC_API_URL` unset stays on localhost.

BLOCKING_COUNT: 0

⚠️ Issues by Priority

High: None. The four blocking conditions were checked on all six proxy routes and by executing `dashboardUrl`:

- Dashboard traffic for either stale host is rewritten to `chain-verify-api-63eg.onrender.com`. No other `apps/web` runtime source calls those hosts. The only remaining mentions are the denylist and `dashboardUrl.test.ts`.
- Every proxy target is `${origin}/api/user-dashboard/<suffix>`. The old `API_BASE + '/user-dashboard/...'` join, which dropped `/api`, is gone. The overview path is `/api/user-dashboard/overview`.
- Each route still sends `Authorization: 'Bearer ' + apiKey` when `x-chain-verify-api-key` or `authorization` is present. The forward was not removed.
- `dashboardUrl('')`, `null`, and `http://localhost:3001/` stay on localhost. `http://127.0.0.1:3001` stays on `127.0.0.1`. Unset `NEXT_PUBLIC_API_URL` in development still resolves to `http://localhost:3001`. A 401 from the live dashboard route is passed through (`status: res.status`) and is not a defect.

Medium:

- `dashboardUrl` string-joins the configured base. A non-stale base that already includes a path, such as `https://chain-verify-api-63eg.onrender.com/api`, becomes `https://chain-verify-api-63eg.onrender.com/api/api/user-dashboard/overview`. Stale bases that include `/api` are safe, because the helper replaces them with the bare canonical origin. This matches an origin-only `API_BASE_URL` (the API itself appends `/api`). It does not drop the `/api` prefix and it does not call a stale host. Do not set a non-stale base that already ends in `/api` unless this join is changed.
- `resolveProofApiBase` rewrites `chainverify.org` and `www.chainverify.org` to the live API. `dashboardUrl` does not. If `API_BASE_URL` or `NEXT_PUBLIC_API_URL` is the marketing host, dashboard traffic goes there, not to the two known stale hosts.

Low:

- A trailing-dot host (`https://chain-verify-api.onrender.com.`) is not in the denylist, so it is not rewritten. A scheme-less value (`chain-verify-api.onrender.com`) is not a valid fetch URL and fails closed in the route `catch` (502). Neither form is used by this diff.
- Sample curls in `AgentGateSandbox.tsx` and `InvoiceProofClient.tsx` are hardcoded to `https://chain-verify-api-63eg.onrender.com/api/verify`. They are examples, not dashboard fetches, and they keep `/api`. `AccessReady.tsx` was not edited; its fallback now follows `resolveProofApiBase`. A server `endpoint` of `/api/verify` is still prefixed again by `buildQuickStartCurl`. That is pre-existing and is not dashboard traffic.
- Five proxy files still start with a UTF-8 BOM, and the routes still use `e: any`. The bearer strip is still a single case-sensitive `replace('Bearer ', '')`. All three are pre-existing.
- Docs links in the touched samples ("Read the Agent Gate docs", "View API docs") point at `/agent-gate/docs`. No text-href mismatch.

🧪 Testing & Quality

Coverage: Re-ran `node ..\..\node_modules\vitest\vitest.mjs run src/lib/dashboardUrl.test.ts` from `apps/web`. Vitest 4.1.11: 9 passed, 0 failed (329ms). A separate transpile of `dashboardUrl.ts` confirmed the stale-host rewrite, empty and localhost fallbacks, `127.0.0.1`, the scans query, and the non-stale `/api` double-join. No coverage percentage; this is one unit file.

Recs: None required to accept this diff. A later test could lock the origin-only join and state whether `chainverify.org` should be rewritten for dashboard proxies.

❓ Clarifications

- Is the deployed web `API_BASE_URL` / `NEXT_PUBLIC_API_URL` an origin (`https://host`), or an origin plus `/api`? The new join is correct for an origin. A stale value is rewritten either way.
- Should dashboard proxies treat `chainverify.org` the same way `resolveProofApiBase` does?
