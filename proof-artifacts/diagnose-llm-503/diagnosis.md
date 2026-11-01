# LLM 503 diagnosis — chain-verify-api

Service: `srv-dbfpdd6i0phs73eev8l0` (`chain-verify-api`). Live SHA `73f21856473e4dc5316daf6a4fad1ef970feba8e`. No deploy, no env change, no further demo POST.

The labeled non-audit demo (`task=o2o-probe`) is not `audit_proof`, so it does not take the proof_core degraded path.

## 1. Function and condition

`AiAnalysisService.analyze` (`apps/api/src/modules/verification/ai-analysis.service.ts`) returns the `AI_UNAVAILABLE` sentinel (`llm_unavailable: true`) when either:

- `ANTHROPIC_API_KEY` is missing or blank after trim (`isConfigured()` is false), or
- `callAnthropic` does not return `ok` (HTTP not ok, or the fetch throws).

`callAnthropic` sets `ok: false` when `POST https://api.anthropic.com/v1/messages` responds with `!res.ok`.

`VerifyApiController` (`verify-api.controller.ts` around 3289–3332) then throws HTTP 503 with `status: needs_review` when `aiResult.llm_unavailable` is set and the task is not an `audit_proof` run that already has a proof_core report.

## 2–3. Environment names read by that path

Read on the service instance used by `analyze` / `callAnthropic`. Presence is on `srv-dbfpdd6i0phs73eev8l0` only. PRESENT means the name exists and the value is non-whitespace. ABSENT means the name is not in the service env list. No linked env groups. Values are not recorded.

`render services --output json` (CLI v2.22.0) does not include env var values (`serviceDetails.env` is the runtime `node`). Names below were read from the read-only Render API `GET /v1/services/srv-dbfpdd6i0phs73eev8l0/env-vars`.

| Name | On service |
| --- | --- |
| `ANTHROPIC_API_KEY` | PRESENT |
| `ANTHROPIC_WORKSPACE_ID` | PRESENT |
| `ANTHROPIC_MODEL` | ABSENT |

`ANTHROPIC_MODEL` absent only selects the code default `claude-sonnet-4-5-20250929`. It is not the failure in the logs.

## 4. Log line

From `render logs` for `srv-dbfpdd6i0phs73eev8l0` at `2026-10-31T15:06:13.265151582Z` (same second as the first 503). ANSI stripped. The 15:11:12 retry logged the same provider error.

`[AiAnalysisService] ERROR anthropic-direct AI analysis error 400: {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CgaXFfR9tsCYnT7oL6Wnh"}`

The next line was `AI analysis failed — returning AI_UNAVAILABLE (fail-closed)`. The missing-key log line was not present.

## 5. Cause

The 503 is fail-closed: Anthropic accepted the configured key and rejected the Messages call with HTTP 400 because the account credit balance is too low, so `analyze` returned `llm_unavailable`.

No env key needs to be set. Do not rotate or print `ANTHROPIC_API_KEY`. Restore Anthropic credits (or billing) on the account that key uses.
