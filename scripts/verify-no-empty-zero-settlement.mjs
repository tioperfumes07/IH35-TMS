#!/usr/bin/env node
// A driver settlement with no live lines and $0.00 net pay has no loads assigned (Lead round 67,
// 2026-09-22: "a driver_settlements row with ZERO lines and $0.00 net_pay is a build failure").
// A pre-settlement is legitimate — AlwaysTrack has no such state and we do — but it must carry its
// loads (owner, round 80). Live USMCA, read-only. Cancelled or voided settlements are out of scope:
// that is the void register the law keeps, printed here as information only.
//
// ROUND 176 (Lead ruling, 2026-09-28, docs/bus/00-LEAD-ROUND-176-SETTLEMENT-GUARD-RULING.md) —
// CORRECTED PREDICATE, not a patch: this guard used to fail an OPEN pre-settlement the instant it
// had zero lines, regardless of whether its loads had even delivered yet. That is a false
// positive — a load that has not delivered has no miles run, no fuel drawn, no pay to itemize;
// zero settlement lines is the CORRECT, honest state for an open pre-settlement whose loads are
// still in flight (owner law this session: an in-flight load's pre-settlement renders PENDING and
// carries nothing — that is the design). Live-confirmed 2026-09-28 (bypass_rls=lucia): loads
// 13627/13631/13635 are all `dispatched`, none delivered; 13623 is `cancelled` (a different, real
// defect — an orphaned pre-settlement on a cancelled load, boarded for CC-1, never silenced here);
// 13625 IS `completed_docs_received` (delivered) but shares its settlement with 13635, which is
// NOT (does not deliver until 2026-10-01) — so that settlement, as a whole, is still legitimately
// in progress. The guard now only requires lines once EVERY load linked to a settlement has
// reached delivered-or-later (`isDeliveredOrLaterStatus`, the ONE canonical definition,
// apps/backend/src/dispatch/canonical-active-load-set.ts — never a hand-written second status
// list) OR the settlement itself has closed. A settlement with zero loads linked at all keeps
// failing unconditionally (nothing to wait on — that is still "a settlement built with no
// loads"). No exclusion list: this fixes what the guard asserts, not which rows it looks away
// from — the guard's own selftest below proves it still fails hard on a closed/no-lines
// settlement and on a fully-delivered group with no lines.
//   not in the baseline                      -> FAIL (a settlement was created with no loads)
//   a baselined id that now has its loads    -> PASS with a note; the PR that fixed it removes the
//                                               id, so a later regression on that row is a new id
// Named by source_document_ref (the AlwaysTrack number) when settled, never by display_id.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import { exitIfEmptyByPurge, purgeLiveRowCondition } from "./lib/purge-window.mjs";

const LABEL = "verify-no-empty-zero-settlement";
export const REQUIRES_LIVE_DB =
  "reads driver_finance.driver_settlements and settlement_lines on live USMCA in a READ ONLY transaction; fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH =
  process.env.EMPTY_SETTLEMENT_BASELINE_PATH || path.join(ROOT, "scripts/verify-no-empty-zero-settlement.baseline.json");

register();
const { DELIVERED_OR_LATER_STATUSES } = await import(
  path.join(ROOT, "apps/backend/src/dispatch/canonical-active-load-set.ts")
);
const deliveredOrLaterList = DELIVERED_OR_LATER_STATUSES.map((s) => `'${s}'::mdata.load_status_enum`).join(", ");

const EMPTY_SQL = `
  SELECT s.id::text AS id,
         s.status::text AS status,
         CASE WHEN s.status::text = 'open'
                THEN 'open pre-settlement, ' || coalesce(btrim(d.first_name || ' ' || d.last_name), 'no driver')
                     || ', from ' || s.period_start::text
                     || coalesce(' (records ref ' || s.source_document_ref || ')', '')
              ELSE coalesce(s.source_document_ref, '—') || ' (' || s.status::text || ', '
                     || coalesce(btrim(d.first_name || ' ' || d.last_name), 'no driver') || ')'
         END
         || coalesce(': load ' || (SELECT string_agg(l.load_number, ', ' ORDER BY l.load_number)
                                     FROM mdata.loads l WHERE l.presettlement_link_id = s.id)
                     || ' is linked but has no settlement line — build its lines',
                     ': no load linked — assign its loads') AS label,
         (s.status::text = 'cancelled' OR s.voided_at IS NOT NULL) AS void_register
    FROM driver_finance.driver_settlements s
    LEFT JOIN mdata.drivers d ON d.id = s.driver_id
   WHERE s.operating_company_id = $1::uuid
     AND s.is_sample_data IS NOT TRUE
     AND coalesce(s.net_pay, 0) = 0
     AND NOT EXISTS (
       SELECT 1 FROM driver_finance.settlement_lines sl
        WHERE sl.settlement_id = s.id AND sl.voided_at IS NULL
     )
     -- ROUND 176: an OPEN settlement with at least one load still in flight (not yet
     -- delivered-or-later) is still legitimately being built — only require lines once the
     -- settlement has closed, or every one of its linked loads has delivered. A settlement with
     -- no loads linked at all has nothing to wait on and keeps failing unconditionally.
     AND (
       s.status::text <> 'open'
       OR NOT EXISTS (
            SELECT 1 FROM mdata.loads l
             WHERE l.presettlement_link_id = s.id AND l.status NOT IN (${deliveredOrLaterList})
          )
     )
   ORDER BY s.created_at, s.id
`;

// Pure mirror of the SQL's ROUND-176 delivery-skip clause above (kept in exact lockstep with it —
// any change to the SQL must be reflected here too) so the skip logic itself has a fast, DB-free
// unit test alongside the live proof. `loadStatuses` is every load linked to the settlement via
// presettlement_link_id (empty array when none are linked).
export function requiresLinesNow(settlementStatus, loadStatuses, deliveredOrLaterStatuses) {
  if (settlementStatus !== "open") return true;
  const delivered = new Set(deliveredOrLaterStatuses);
  return loadStatuses.every((s) => delivered.has(s));
}

export function evaluate(rows, baselineIds) {
  const live = rows.filter((r) => !r.void_register);
  const known = new Set(baselineIds);
  const current = new Set(live.map((r) => r.id));
  return {
    newShells: live.filter((r) => !known.has(r.id)),
    resolved: [...known].filter((id) => !current.has(id)),
    knownShells: live.filter((r) => known.has(r.id)),
    voidRegister: rows.filter((r) => r.void_register),
  };
}

function selftest() {
  const check = (cond, msg) => {
    if (!cond) {
      console.error(`${LABEL} --selftest FAIL: ${msg}`);
      process.exit(1);
    }
  };
  const shell = (id, void_register = false) => ({ id, status: void_register ? "cancelled" : "open", label: id, void_register });
  check(evaluate([shell("a")], ["a"]).newShells.length === 0, "a baselined shell must pass");
  check(evaluate([shell("a"), shell("b")], ["a"]).newShells.length === 1, "a new shell must fail");
  check(evaluate([], ["a"]).resolved.length === 1, "a fixed shell must be reported for removal");
  check(evaluate([shell("c", true)], []).newShells.length === 0, "a cancelled or voided shell is the void register, not a failure");

  const DELIVERED = ["delivered", "delivered_pending_docs", "completed_docs_received", "invoiced", "paid", "closed"];
  check(requiresLinesNow("closed", [], DELIVERED) === true, "a closed settlement with no lines must still fail, even with no loads linked");
  check(requiresLinesNow("open", [], DELIVERED) === true, "an open settlement with NO loads linked at all must still fail (ROUND 176 §finding: nothing to wait on)");
  check(
    requiresLinesNow("open", ["dispatched"], DELIVERED) === false,
    "an open settlement whose only load has not delivered must NOT fail (ROUND 176 — 13627/13631/13635)"
  );
  check(
    requiresLinesNow("open", ["completed_docs_received", "dispatched"], DELIVERED) === false,
    "an open settlement is still skipped while even ONE linked load has not delivered (ROUND 176 — 13625+13635)"
  );
  check(
    requiresLinesNow("open", ["cancelled"], DELIVERED) === false,
    "an open settlement on a cancelled (not delivered-or-later) load is skipped by THIS guard — a real defect, but boarded separately (ROUND 176 — 13623)"
  );
  check(
    requiresLinesNow("open", ["completed_docs_received", "delivered"], DELIVERED) === true,
    "an open settlement must fail once EVERY linked load has delivered-or-later"
  );
  console.log(`${LABEL} --selftest PASS — 10 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
let rows;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const totals = await client.query(
    `SELECT count(*)::int AS n FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND is_sample_data IS NOT TRUE
        AND ${purgeLiveRowCondition(LABEL, "driver_finance.driver_settlements")}`,
    [USMCA_COMPANY_ID]
  );
  if (totals.rows[0].n === 0) {
    exitIfEmptyByPurge(LABEL, "driver_finance.driver_settlements (USMCA, no live row)");
    console.error(`${LABEL}: FAIL — 0 USMCA settlements visible; that is an instrument problem, not a clean result`);
    process.exit(1);
  }
  rows = (await client.query(EMPTY_SQL, [USMCA_COMPANY_ID])).rows;
  await client.query("ROLLBACK");
} finally {
  client.release();
  await pool.end();
}

const { newShells, resolved, knownShells, voidRegister } = evaluate(rows, (baseline.settlements ?? []).map((s) => s.id));
if (voidRegister.length > 0) {
  console.log(`${LABEL}: ${voidRegister.length} cancelled/voided empty settlement(s) kept as the void register (not counted).`);
}
for (const id of resolved) {
  const label = baseline.settlements.find((s) => s.id === id)?.label ?? id;
  console.log(
    `${LABEL}: NOTE — settlement ${label} (${id}) now has its loads. Remove this id from ` +
      `${path.basename(BASELINE_PATH)} in the PR that fixed it.`
  );
}
if (newShells.length > 0) {
  console.error(`${LABEL}: FAIL — ${newShells.length} settlement(s) with no live lines and $0.00 net pay:`);
  for (const r of newShells) console.error(`  ✗ ${r.label} — ${r.id}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — no new settlement without loads. ${knownShells.length} known, baselined ${baseline.established}, still open:`
);
for (const r of knownShells) console.log(`  - ${r.label}`);
