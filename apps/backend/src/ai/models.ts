// Central Anthropic model registry — THE ONLY place a Claude model ID string may appear in apps/backend/src.
// Every AI feature imports its model from here; no inline model strings anywhere else (enforced by
// scripts/verify-anthropic-model-ids.mjs). This turns a vendor model retirement into a one-line change here
// plus the lifecycle monitor's early warning, instead of a silent multi-feature outage.
//
// Retirement history (why this file exists):
//   claude-sonnet-4-20250514 was RETIRED from the Claude API on 2026-06-15 (announced 2026-04-14, no grace
//   period). It was hardcoded in the rate-con extractor and the safety photo-comparison client, so every
//   call in both features began failing. Replacement = claude-sonnet-4-6 (the current API Sonnet; supports
//   PDF document input + image/vision, which both features require).

/** Current Claude Sonnet on the Claude API. Replaces the retired claude-sonnet-4-20250514. */
export const CLAUDE_SONNET_4_6 = "claude-sonnet-4-6";

/** Rate-con PDF extraction (dispatch/ratecon-extract.service.ts). Needs PDF document input. */
export const RATECON_EXTRACTION_MODEL = CLAUDE_SONNET_4_6;

/** Safety photo-comparison (safety/photo-comparison/anthropic-client.ts). Needs image/vision input. */
export const SAFETY_VISION_MODEL = CLAUDE_SONNET_4_6;

/** Known-retired model IDs — the guard fails if any of these reappears anywhere in apps/backend/src. */
export const RETIRED_MODEL_IDS: readonly string[] = ["claude-sonnet-4-20250514", "claude-opus-4-20250514"];

/** Every model ID the backend actively depends on. The lifecycle monitor checks each against the live
 *  GET /v1/models list and alerts if any is missing or marked deprecated (Anthropic gives 60 days' notice). */
export const REGISTERED_MODEL_IDS: readonly string[] = Array.from(
  new Set([RATECON_EXTRACTION_MODEL, SAFETY_VISION_MODEL]),
);
