#!/usr/bin/env node
// ROUND 155.12 FIX 2(b)/(d) — "an earnings or deadhead_pay line with NULL quantity or rate_cents
// fails the gate." The seeder that wrote driver_finance.settlement_lines from the AlwaysTrack
// settlement documents threw the miles/rate half away; AUTH-091
// (scripts/ops/2026-09-28-backfill-settlement-line-miles-rate.mjs) backfilled 110 of 312 active
// lines from the real, already-parsed truth file (feed-input/settlement-truth-from-pdfs.json),
// verifying quantity x rate_cents = the line's own real amount for every one it touched.
//
// The other 202 could NOT be backfilled without inventing a number, for three real, distinct
// reasons (never blur these together into one "known debt" blob without saying which is which):
//   (a) 30 lines whose amount does not decompose into document-miles x document-rate at all -- the
//       seeder folded extra-stop/tarp/lumper pay into the same "earnings" bucket as mileage pay, so
//       forcing quantity/rate onto it would violate the DB's own
//       settlement_lines_item_qty_rate_amount_check (exact equality), not satisfy it.
//   (b) 31 deadhead_pay lines genuinely at $0.00 with no empty_miles/empty_rate in the source
//       document at all -- there were no deadhead miles on that leg. Zero is the correct real
//       answer; there is nothing to seed.
//   (c) 141 lines that are not earnings/deadhead_pay at all (deductions, reimbursements, escrow,
//       bonuses) -- never mileage-based, out of this guard's scope entirely.
//   (d) lines on settlements the DB does not (yet) mark status='closed' with a matching
//       source_document_ref -- an open, in-progress, or unsettled cycle has no signed document to
//       backfill from yet (this is exactly the 24-currently-dispatched-loads gap ROUND 155.12's own
//       DONE LINE reports).
//
// SHRINK-ONLY RATCHET (same shape as every other guard this session): a single live count of
// earnings/deadhead_pay lines belonging to a CLOSED settlement with NULL quantity or rate_cents,
// checked against a baseline ceiling. New rot (a newly-closed settlement whose lines still carry no
// miles/rate) fails outright; existing, already-investigated debt (categories a/b above) is
// tolerated up to the baseline and never silently grows. Category (d) — open settlements — is
// EXCLUDED from the count entirely (checked separately, informationally) because it is not debt,
// it is a real "not settled yet" state that will resolve itself when the settlement closes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlement-line-carries-miles-and-rate";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = path.join(ROOT, "scripts/verify-settlement-line-carries-miles-and-rate.baseline.json");
export const REQUIRES_LIVE_DB =
  "live-money ratchet on closed settlement earnings/deadhead_pay miles+rate; fails closed via requireLiveDbOrExit";

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

export function evaluate(liveCount, baseline) {
  if (!baseline) return { ok: liveCount === 0, message: liveCount === 0 ? "clean, no baseline needed" : `${liveCount} deficient line(s), no baseline on file` };
  if (liveCount > baseline.max_known_deficient_lines) {
    return { ok: false, message: `${liveCount} > baseline ceiling ${baseline.max_known_deficient_lines} — new rot` };
  }
  if (liveCount === 0 && baseline.max_known_deficient_lines > 0) {
    return { ok: true, message: `0 deficient lines — baseline ceiling ${baseline.max_known_deficient_lines} may be lowered/removed (shrink the ratchet whenever it's convenient, not required)` };
  }
  return { ok: true, message: `${liveCount} known deficient line(s) (baseline ceiling ${baseline.max_known_deficient_lines}, established ${baseline.established})` };
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  t("no baseline, 0 live -> ok", evaluate(0, null).ok === true);
  t("no baseline, >0 live -> fail", evaluate(5, null).ok === false);
  t("baseline 30, live 30 -> ok (unchanged debt)", evaluate(30, { max_known_deficient_lines: 30, established: "x" }).ok === true);
  t("baseline 30, live 31 -> FAIL (new rot)", evaluate(31, { max_known_deficient_lines: 30, established: "x" }).ok === false);
  t("baseline 30, live 20 -> ok (shrunk, still passes)", evaluate(20, { max_known_deficient_lines: 30, established: "x" }).ok === true);
  t("baseline 30, live 0 -> ok (fully clean)", evaluate(0, { max_known_deficient_lines: 30, established: "x" }).ok === true);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 6 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

    const res = await client.query(`
      SELECT count(*)::int AS deficient
        FROM driver_finance.settlement_lines sl
        JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
       WHERE sl.is_active IS TRUE
         AND sl.line_type IN ('earnings', 'deadhead_pay')
         AND ds.status = 'closed'
         AND ds.source_document_ref IS NOT NULL
         AND (sl.quantity IS NULL OR sl.rate_cents IS NULL)
    `);
    const openRes = await client.query(`
      SELECT count(*)::int AS open_scope_excluded
        FROM driver_finance.settlement_lines sl
        JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
       WHERE sl.is_active IS TRUE
         AND sl.line_type IN ('earnings', 'deadhead_pay')
         AND (ds.status <> 'closed' OR ds.source_document_ref IS NULL)
         AND (sl.quantity IS NULL OR sl.rate_cents IS NULL)
    `);
    await client.query("ROLLBACK");

    const liveCount = res.rows[0].deficient;
    const baseline = loadBaseline();
    const verdict = evaluate(liveCount, baseline);
    console.log(`${LABEL}: ${verdict.message} (informational: ${openRes.rows[0].open_scope_excluded} line(s) excluded — belong to a not-yet-closed settlement, not debt)`);
    if (!verdict.ok) process.exit(1);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
