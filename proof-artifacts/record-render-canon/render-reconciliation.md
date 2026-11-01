# Render reconciliation — Chain Verify API

Checked at: 2026-10-31T15:04:13Z  
Method: read-only `render services --output json` and `render deploys list srv-dbfpdd6i0phs73eev8l0 --output json`. No deploy was created. No service, domain, or env change was made. Env var values were not read.

Local git HEAD at check time (not deployed live): `c6b5b9058ffe406aae4984e6dfc3d8b2706a5cd5`

## Canonical service

| Field | Value |
| --- | --- |
| Name | chain-verify-api |
| Service ID | srv-dbfpdd6i0phs73eev8l0 |
| Slug | chain-verify-api-63eg |
| Type | web_service |
| Canonical URL | https://chain-verify-api-63eg.onrender.com |
| Dashboard | https://dashboard.render.com/web/srv-dbfpdd6i0phs73eev8l0 |
| Repo | https://gitlab.com/swarmsync-group/chain-verify |
| Branch | main |
| autoDeploy | no |
| suspended | not_suspended |
| Region | oregon |
| Runtime | node |
| Plan | starter |
| Health check | /api/usage |

This is the only workspace service whose name, slug, or service URL matches Chain Verify. Among the 20 services listed, `https://chain-verify-api-63eg.onrender.com` is present. `https://chain-verify-api.onrender.com` is not a service URL in this workspace.

## Live deploy

| Field | Value |
| --- | --- |
| Deploy ID | dep-dbgpii8ae00c73d3jcng |
| Status | live |
| Trigger | manual |
| Deployed SHA | 73f21856473e4dc5316daf6a4fad1ef970feba8e |
| Subject | Security checks S6: unavailable GitHub compare reports WARNING, not PASS (v2) |
| Created | 2026-10-28T06:42:17.851699Z |
| Finished | 2026-10-28T06:43:30.549057Z |

`git cat-file -e 73f21856473e4dc5316daf6a4fad1ef970feba8e:apps/api/src/modules/user-dashboard/user-dashboard.controller.ts` succeeded. That path is in the live SHA.

The previous deploy of local HEAD is not live:

| Deploy ID | Status | Trigger | SHA |
| --- | --- | --- | --- |
| dep-dbglutoae00c73crdc3g | deactivated | manual | c6b5b9058ffe406aae4984e6dfc3d8b2706a5cd5 |
| dep-dbgj9mbbc2fs73c04o1g | deactivated | service_resumed | e5b79423b478f25fb4d1d1fd6093f6c97396625e |
| dep-dbfpdfmi0phs73eevecg | deactivated | manual | e5b79423b478f25fb4d1d1fd6093f6c97396625e |

## Fresh HTTP checks

GET, no API key, redirects not followed (`curl --max-redirs 0`). A 401 on the canonical dashboard route is the expected auth gate, not a failure to fix.

### Canonical — HTTP 401

GET https://chain-verify-api-63eg.onrender.com/api/user-dashboard/overview

- Status: `HTTP/1.1 401 Unauthorized`
- Content-Type: `application/json; charset=utf-8`
- Body (200-char cap): `{"message":"Valid Chain Verify API key required","error":"Unauthorized","statusCode":401}`

### Stale host — HTTP 404

GET https://chain-verify-api.onrender.com/api/user-dashboard/overview

- Status: `HTTP/1.1 404 Not Found`
- Content-Type: `application/json; charset=utf-8`
- Body (200-char cap): `{"message":"Cannot GET /api/user-dashboard/overview","error":"Not Found","statusCode":404}`

### Stale host — HTTP 404

GET https://api.chainverify.org/api/user-dashboard/overview

- Status: `HTTP/1.1 404 Not Found`
- Content-Type: `application/json; charset=utf-8`
- Body (200-char cap): `{"message":"Cannot GET /api/user-dashboard/overview","error":"Not Found","statusCode":404}`

The two 404 bodies are application JSON (`Cannot GET`), not a Render platform HTML 404. Those hosts answer, and they do not expose this route. They are not the service URL of `srv-dbfpdd6i0phs73eev8l0`.

## Decision

Canonical Chain Verify Render API is service `srv-dbfpdd6i0phs73eev8l0` at `https://chain-verify-api-63eg.onrender.com`, running deploy `dep-dbgpii8ae00c73d3jcng` at SHA `73f21856473e4dc5316daf6a4fad1ef970feba8e`.

`https://chain-verify-api.onrender.com` and `https://api.chainverify.org` are not this canonical service. Do not send user-dashboard traffic there.

Local `main` (`c6b5b9058ffe406aae4984e6dfc3d8b2706a5cd5`) is ahead of what Render is running. autoDeploy is `no`. This record does not deploy that commit.

## Rollback

No runtime change. Delete this file to reverse the only write. Do not run `render deploys create` to undo a record.
