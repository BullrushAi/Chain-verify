# Deploy record: web routing fix

Recorded: 2026-10-31T15:35:56Z

## Commit

- SHA: `ff3bed783de229ad10c5d1083ac64dc31d0580c8`
- Author: benstoneai <benstoneai@gmail.com>
- Committer: benstoneai <benstoneai@gmail.com>
- Parent: `c6b5b9058ffe406aae4984e6dfc3d8b2706a5cd5` (previous origin/main)
- Subject: fix(web): send dashboard and proof calls to the live Render API
- `apps/web/src/lib/dashboardUrl.ts` in this commit contains `https://chain-verify-api-63eg.onrender.com` and `/api/user-dashboard/`.

## Tests before commit

From `apps/web`:

`node ..\..\node_modules\vitest\vitest.mjs run src/lib/dashboardUrl.test.ts`

Vitest 4.1.11: 1 file, 9 tests passed, exit 0. Duration 462ms.

## Push

- Command: `git push origin HEAD:main`
- Result: fast-forward accepted. `c6b5b90..ff3bed7  HEAD -> main`
- No `--force`. No `--no-verify`. Render was not changed.
- `git ls-remote origin refs/heads/main`: `ff3bed783de229ad10c5d1083ac64dc31d0580c8`
- Remote main SHA equals the new commit SHA.

## Vercel production deployment

DONE_CRITERIA_MET: NO

No GitHub deployment and no commit status exist for `ff3bed783de229ad10c5d1083ac64dc31d0580c8`.

Polled `repos/BenStoneAI/Chain-verify/deployments?sha=<SHA>`, commit statuses, and check-runs from 2026-10-31T15:25:59Z through 2026-10-31T15:34:14Z (about 8 minutes, roughly every 20–40 seconds). Every read was:

- deployments: 0
- commit status: state `pending`, total_count 0, no contexts
- check-runs: 0

A last read finished before 2026-10-31T15:35:56Z and was still 0 deployments, status `pending` with total_count 0, and 0 check-runs.

Latest Production deployment on the repo is still the previous one:

- id: `7266866943`
- environment: Production
- state: success ("Deployment has completed")
- sha: `d78bb3e3cbc0b0fbd47d498d1e64e448047734ba`
- created: 2026-10-23T00:14:06Z
- creator: vercel[bot]

The parent commit `c6b5b9058ffe406aae4984e6dfc3d8b2706a5cd5` (2026-10-25) also has zero GitHub deployments. Its message says it was not deployed. `repos/BenStoneAI/Chain-verify/hooks` returned an empty list. `repos/BenStoneAI/Chain-verify/events` returned an empty list.

Vercel CLI 58.5.1 `vercel whoami` exited 1: no existing credentials. `vercel login` was not run. The Vercel list-deployments API for project `chain-verify-web`, filtered by this SHA and by production, returned 403 forbidden. No deployment id, environment, or READY/success state exists for this SHA.

Live site behavior was not checked at 15:35Z.

## Production publish after approval

Recorded after Ben approved the Vercel production deploy.

- Vercel project `chain-verify-web` (`prj_qks5n07UyxfmNhb6eVjIPdLCS17X`) has no Git link, so GitHub did not auto-build this SHA.
- Deployment `dpl_7SSYAmJkLJ3FeJ8ouZAHGo1hrc8d` was created from the file tree of `ff3bed783de229ad10c5d1083ac64dc31d0580c8`.
- Vercel reports `readyState=READY`, `target=production`, meta `githubCommitSha=ff3bed783de229ad10c5d1083ac64dc31d0580c8`, aliases `www.chainverify.org` and `chainverify.org`.
- Live check: `GET https://www.chainverify.org/api/proxy/user-dashboard/overview` returned `401` `{"message":"Valid Chain Verify API key required","error":"Unauthorized","statusCode":401}`.
- The same 401 body was returned for scans, billing, api-keys, organization, and settings.
