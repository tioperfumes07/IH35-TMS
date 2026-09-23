// The purge window (Lead ruling, docs/bus/09-23-2026-LEAD-RULING-CURSOR-PURGE-WINDOW-GUARD-STATE.md).
// Between a verified purge and the close of feed day 1, the transaction tables are empty on purpose.
// Seven live guards treat an empty table as a broken instrument and fail; inside the window, and only
// for those seven, an empty table is a NAMED skip instead. The state lives in ONE committed file,
// purge_state.json at the repo root:
//   purged_at        written by whoever runs the purge
//   verified_at      written by verify-purge.mjs, only on a PASS
//   day1_closed_at   written by feed_cursor.py when day 1 closes on proof
// The window is open while verified_at is set, day1_closed_at is not, and less than 72 hours have
// passed since verified_at. After 72 hours it closes whatever the feed has done; reopening it means
// re-stamping verified_at in a commit someone has to justify.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PURGE_STATE_PATH = process.env.PURGE_STATE_PATH || path.join(ROOT, "purge_state.json");
export const PURGE_WINDOW_HOURS = 72;
/** Exit code a guard uses for "EMPTY BY PURGE". money-pr-local-gate accepts it only from these nine. */
export const EMPTY_BY_PURGE_EXIT = 75;
// verify-control-totals is the eighth (Lead ruling, same day): its settlement control asserts a
// fixed figure (5804-5815 net 20,191.07) that is transaction data the purge deletes, so after the
// purge the true answer is 0. Only that control skips; its banking controls keep running for real.
// verify-void-is-whole is the ninth (Lead ROUND 117): Direction 1 only may EMPTY BY PURGE while the
// window is open; Direction 2 stays hard always.
// Nine arms (Lead ROUND 117): the original eight empty-table arms, plus verify-void-is-whole for
// Direction 1 only (ledger dead / header still live) while the window is open. Direction 2
// (header stamped VOIDED over live postings) is NEVER window-exempt — that is the dangerous
// direction. Do not widen the void-is-whole baseline to absorb Direction 1; re-price once after feed.
// Tenth arm (ROUND E12.1-R2, TASK 27): verify-settled-load-carries-settled-status. Its whole
// population (settled driver_bill x finalized driver_settlement x advanced invoice) is legitimately
// empty right now — no driver_settlements have been finalized since the AUTH-001 purge — so an
// empty result is the purge window, not a broken join.
export const PURGE_WINDOW_GUARDS = Object.freeze([
  "verify-alwaystrack-parity",
  "verify-faro-invoice-lines-load-linkage",
  "verify-dispute-window-unified",
  "verify-driver-bill-settlement-link",
  "verify-load-to-cash-chain",
  "verify-fuel-transactions-per-load",
  "verify-no-empty-zero-settlement",
  "verify-control-totals",
  "verify-void-is-whole",
  "verify-settled-load-carries-settled-status",
]);

export const EXPECTED_ZERO_PATH = path.join(ROOT, "scripts/purge/usmca-purge-expected-zero.generated.json");

/**
 * The purge's own liveness rule for one table, read from the file the purge SQL is generated with.
 * After a mass void the rows stay, so an arm's "empty" must mean no LIVE row. A table whose
 * live_predicate is null carries no void flag: its liveness is answered by its parent document (or,
 * for a correction reversal, only by the account netting to zero), so an arm must not call it empty
 * or non-empty by itself — it fails and says why.
 */
export function purgeLiveRowCondition(label, table, file = EXPECTED_ZERO_PATH) {
  const spec = JSON.parse(fs.readFileSync(file, "utf8"));
  const entry = (spec.must_be_zero_after_purge ?? []).find((e) => e.table === table);
  if (!entry) {
    console.error(`${label}: FAIL — ${table} is not in ${path.basename(file)}; this arm has no liveness rule for it.`);
    process.exit(1);
  }
  if (!entry.live_predicate) {
    console.error(
      `${label}: FAIL — ${table} has no live_predicate in ${path.basename(file)}: it carries no void flag, so its ` +
        `liveness is answered by its parent document. This arm cannot call it empty or non-empty by itself.`,
    );
    process.exit(1);
  }
  return `(${entry.where}) AND (${entry.live_predicate})`;
}

export function readPurgeState(file = PURGE_STATE_PATH) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** @returns {{ open: boolean, verifiedAt: string | null, expiresAt: string | null, reason: string }} */
export function purgeWindow(state = readPurgeState(), now = new Date()) {
  const verifiedAt = state.verified_at ?? null;
  if (!verifiedAt) return { open: false, verifiedAt: null, expiresAt: null, reason: "no verified purge" };
  const verified = new Date(verifiedAt);
  if (Number.isNaN(verified.getTime())) return { open: false, verifiedAt, expiresAt: null, reason: `verified_at is not a timestamp: ${verifiedAt}` };
  const expiresAt = new Date(verified.getTime() + PURGE_WINDOW_HOURS * 3_600_000).toISOString();
  if (state.day1_closed_at) return { open: false, verifiedAt, expiresAt, reason: `day 1 closed at ${state.day1_closed_at}` };
  if (now.getTime() >= new Date(expiresAt).getTime()) return { open: false, verifiedAt, expiresAt, reason: `expired at ${expiresAt}` };
  return { open: true, verifiedAt, expiresAt, reason: "open" };
}

/**
 * Called by a guard at its empty-table arm, just before it fails. Inside the window, and only for one
 * of the seven, it prints the named skip and exits EMPTY_BY_PURGE_EXIT. Otherwise it returns and the
 * guard fails as before. A guard outside the seven calling this is refused outright.
 */
export function exitIfEmptyByPurge(label, what) {
  const w = purgeWindowFor(label);
  if (!w.open) return;
  console.log(`${label}: EMPTY BY PURGE (verified ${w.verifiedAt}, expires ${w.expiresAt}) — ${what} is empty; named skip, not a pass.`);
  process.exit(EMPTY_BY_PURGE_EXIT);
}

/** The window as seen by one allowlisted guard, for a guard that must finish its other checks before
 *  it may exit EMPTY_BY_PURGE_EXIT. A guard outside the allowlist is refused outright. */
export function purgeWindowFor(label) {
  if (!PURGE_WINDOW_GUARDS.includes(label)) {
    console.error(`${label}: FAIL — not one of the ${PURGE_WINDOW_GUARDS.length} purge-window guards; it cannot inherit the EMPTY BY PURGE exemption.`);
    process.exit(1);
  }
  return purgeWindow();
}
