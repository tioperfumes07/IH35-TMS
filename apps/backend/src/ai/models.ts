// Central Anthropic model registry — THE ONLY place a Claude model ID string may appear in apps/backend/src.
// Every AI feature imports its model from here; no inline model strings anywhere else (enforced by
// scripts/verify-anthropic-model-ids.mjs). This turns a vendor model retirement into a one-line change here
// plus the lifecycle monitor's early warning, instead of a silent multi-feature outage.
//
// Retirement history (why this file exists):
//   claude-sonnet-4-20250514 was RETIRED from the Claude API on 2026-06-15 (announced 2026-04-14, no grace
//   period). It was hardcoded in the rate-con extractor and the safety photo-comparison client, so every
//   call in both features began failing. Replacement was claude-sonnet-4-6.
//   claude-sonnet-4-6 was in turn SUPERSEDED by Claude Sonnet 5 (claude-sonnet-5, GA 2026-06-30) and began
//   returning HTTP 404 (model_not_found) for this account on 2026-07-04 — the rate-con extractor surfaced it
//   as "API request failed with status 404". Replacement = claude-sonnet-5 (the current API Sonnet; supports
//   PDF document input + image/vision, which both features require). Verified against docs.anthropic.com.

/** Current Claude Sonnet on the Claude API. Replaces the superseded claude-sonnet-4-6 (404) and the earlier
 *  retired claude-sonnet-4-20250514. Supports PDF document input + vision. */
export const CLAUDE_SONNET_5 = "claude-sonnet-5";

/** Rate-con PDF extraction (dispatch/ratecon-extract.service.ts). Needs PDF document input. */
export const RATECON_EXTRACTION_MODEL = CLAUDE_SONNET_5;

/** Safety photo-comparison (safety/photo-comparison/anthropic-client.ts). Needs image/vision input. */
export const SAFETY_VISION_MODEL = CLAUDE_SONNET_5;

/** Known-retired/superseded model IDs — kept for documentation. (The static guard's hard-fail regex only
 *  matches dated snapshots like claude-*-2025xxxx; claude-sonnet-4-6 is listed here as an intentional record
 *  of the 2026-07-04 404 supersession.) */
export const RETIRED_MODEL_IDS: readonly string[] = ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-sonnet-4-6"];

/** Every model ID the backend actively depends on. The lifecycle monitor checks each against the live
 *  GET /v1/models list and alerts if any is missing or marked deprecated (Anthropic gives 60 days' notice). */
export const REGISTERED_MODEL_IDS: readonly string[] = Array.from(
  new Set([RATECON_EXTRACTION_MODEL, SAFETY_VISION_MODEL]),
);
