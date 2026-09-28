#!/usr/bin/env node
// ROUND 155.12 (Lead, 2026-09-28) — an OPEN, unsettled driver bill is not "finished money". It is
// raised AT DISPATCH (createDriverBillArtifacts runs inside createLoadWithFullSideEffects, the one
// shared booking path), so the previous canonicalActiveLoadNotFinishedByMoneyCte
// (`db.status <> 'void'`, with no check on settled_in_settlement_id) declared a load "finished"
// the instant it was booked — the opposite of active. Live-confirmed before the fix: 8
// status='dispatched' USMCA loads, each carrying exactly one open/unsettled driver bill and
// nothing else, were silently dropped off every board (16 counted instead of the real 24). Same
// failure mode on the settlement_lines half: an `is_active` line on a still-OPEN settlement is a
// settlement being prepared, not one that finished.
//
// This guard is a LIVE invariant check (real money data, not a static source scan — pairs with
// scripts/verify-one-canonical-active-load-set.mjs, which only checks that callers use the
// canonical module at all, not that the module's own predicate is correct). It:
//   (a) statically asserts the fixed SQL text is actually present in the canonical module (a
//       regression that reverts the WHERE clause back to the old shape fails loudly here even
//       before touching the database), and
//   (b) live-queries for any load whose ONLY qualifying money artifact is an open/unsettled
//       driver bill (or an active settlement line on a still-open settlement) and asserts that
//       load IS present in listCanonicalActiveLoadIds — the real, data-driven proof, not a
//       hardcoded expectation of which loads or how many.
//
// Loads the .ts module via tsx/esm/api register — plain `node` cannot import TypeScript.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";
import pg from "pg";

const LABEL = "verify-open-driver-bill-keeps-load-active";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_PATH = path.join(ROOT, "apps/backend/src/dispatch/canonical-active-load-set.ts");

function selftestStaticShape() {
  const src = fs.readFileSync(MODULE_PATH, "utf8");
  const failures = [];
  if (!/db\.settled_in_settlement_id\s+IS\s+NOT\s+NULL/i.test(src)) {
    failures.push(
      "canonical-active-load-set.ts no longer requires settled_in_settlement_id IS NOT NULL on " +
        "the driver_bills exclusion — an open/unsettled bill would again be treated as 'finished'."
    );
  }
  if (!/driver_settlements\s+ds\s+ON\s+ds\.id\s*=\s*sl\.settlement_id\s+AND\s+ds\.status\s*=\s*'closed'/i.test(src)) {
    failures.push(
      "canonical-active-load-set.ts no longer joins settlement_lines to a CLOSED driver_settlements " +
        "row — an active line on a still-open settlement would again be treated as 'finished'."
    );
  }
  return failures;
}

function selftest() {
  const failures = selftestStaticShape();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — fixed SQL shape present in the canonical module.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const staticFailures = selftestStaticShape();
  if (staticFailures.length) {
    console.error(`${LABEL}: FAIL —\n  - ${staticFailures.join("\n  - ")}`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (static shape check above still ran and passed; ` +
      "the live-data half is a live-money invariant by design and cannot be faked offline).");
    process.exit(0);
  }

  register();
  const { listCanonicalActiveLoadIds } = await import(MODULE_PATH);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

    const companiesRes = await client.query(
      `SELECT DISTINCT operating_company_id::text FROM mdata.loads WHERE soft_deleted_at IS NULL`
    );

    let checked = 0;
    let found = 0;
    for (const { operating_company_id } of companiesRes.rows) {
      const openBillOnlyRes = await client.query(
        `SELECT l.id::text AS id, l.load_number
           FROM mdata.loads l
           JOIN driver_finance.driver_bills db
             ON db.load_id = l.id AND db.status <> 'void' AND db.settled_in_settlement_id IS NULL
          WHERE l.operating_company_id = $1::uuid
            AND l.soft_deleted_at IS NULL
            AND l.status IN ('booked','planned','assigned','unassigned','assigned_not_dispatched',
                              'dispatched','at_pickup','in_transit','at_delivery','delivered',
                              'delivered_pending_docs','completed_docs_received','abandoned',
                              'driver_walkoff','driver_no_show')
            AND NOT EXISTS (
              SELECT 1 FROM driver_finance.settlement_lines sl
              JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id AND ds.status = 'closed'
               WHERE sl.load_id = l.id AND sl.is_active IS TRUE
            )
            AND NOT EXISTS (
              SELECT 1 FROM accounting.invoices i
               WHERE i.source_load_id = l.id AND i.status NOT IN ('draft', 'proforma', 'void')
            )`,
        [operating_company_id]
      );
      if (openBillOnlyRes.rows.length === 0) continue;

      const activeIds = new Set(await listCanonicalActiveLoadIds(client, operating_company_id));
      for (const row of openBillOnlyRes.rows) {
        checked++;
        if (!activeIds.has(row.id)) {
          console.error(
            `${LABEL}: FAIL — load ${row.load_number} (${row.id}) has ONLY an open/unsettled ` +
              "driver bill and is still excluded from the canonical active set — the fix regressed."
          );
          await client.query("ROLLBACK");
          process.exit(1);
        }
        found++;
      }
    }
    await client.query("ROLLBACK");

    if (checked === 0) {
      console.log(
        `${LABEL}: PASS (vacuous) — static shape correct, and no load currently exists whose only ` +
          "money artifact is an open/unsettled driver bill to positively exercise the live half. " +
          "Re-run once one exists (e.g. right after any load is dispatched) for a non-vacuous PASS."
      );
      return;
    }
    console.log(`${LABEL}: PASS — ${found}/${checked} open-bill-only load(s) correctly remain in the canonical active set.`);
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
