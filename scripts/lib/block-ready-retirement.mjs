/**
 * Shared .block-ready retirement detection for reconcile + tracker guards.
 *
 * ROOT BUG (false retirement): a case-insensitive `/[_-](STALE|DUPLICATE)/`
 * filename rule retired ordinary live defect IDs whose names end in descriptive
 * hyphen suffixes (`…-stale`, `…-duplicate`) even when status was live
 * (PARTIAL/PENDING) and no superseded_by/duplicate_of was set.
 *
 * LAW: filename retirement requires an explicit unambiguous underscore marker
 * (`_DUP`, `_DUPLICATE`, `_STALE`, `_LIKELY-STALE`, `_SUPERSEDED`). Hyphenated
 * descriptive tails are NEVER retirement markers by themselves. Status /
 * superseded_by / duplicate_of remain explicit retirement signals.
 */
export const RETIRE_FILENAME = /_(DUP|DUPLICATE|LIKELY-STALE|STALE|SUPERSEDED)$/i;
export const RETIRE_STATUS = /^(superseded|duplicate|dup|stale)$/i;

/** Confirmed live defect IDs that must never be retired by filename alone. */
export const CONFIRMED_LIVE_HYPHEN_DEFECT_IDS = Object.freeze([
  "0270-no-auto-equipment-log-update-duplicate",
  "0518-r10-qbo-sync-workers-off-mirror-stale",
  "phase13-audit220-manufacturing-duplicate",
  "phase13-audit228-energy-duplicate",
  "threewayaudit-biz02-qbo-sync-workers-stale",
]);

/**
 * @param {string} filename registry filename (with or without .json)
 * @param {Record<string, unknown> | null | undefined} json parsed manifest
 * @returns {boolean} true when the registry row is retired/excluded
 */
export function isRetiredBlockFile(filename, json) {
  const base = String(filename ?? "").replace(/\.json$/i, "");
  if (RETIRE_FILENAME.test(base)) return true;
  const j = json && typeof json === "object" ? json : {};
  if (typeof j.status === "string" && RETIRE_STATUS.test(j.status.trim())) return true;
  if (j.superseded_by != null || j.duplicate_of != null) return true;
  return false;
}
