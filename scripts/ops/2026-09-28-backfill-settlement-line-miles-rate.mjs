#!/usr/bin/env node
// AUTH-091 — ROUND 155.12 FIX 2(b): re-parse the ALREADY-PARSED AlwaysTrack settlement truth file
// (feed-input/settlement-truth-from-pdfs.json — 61 signed settlement PDFs, driver+company, already
// committed) and backfill driver_finance.settlement_lines.quantity/rate_cents/unit_of_measure for
// every REAL, signed, closed settlement's earnings/deadhead_pay lines. These columns are NULL on
// all 312 active lines today even though the source document prints miles and rate-per-mile on
// every line -- the seeder that wrote these lines from the same document threw that half away.
//
// HARD RULE (owner order): amount must equal quantity x rate_cents. If it does not (within 1 cent
// rounding), the line is NOT written -- reported as a mismatch instead. Never invent a number to
// make it balance.
//
// Scope: only settlements the DB itself marks status='closed' with a source_document_ref matching
// the JSON's own settlement key (confirmed live: display_id/source_document_ref both equal the
// settlement number, e.g. "5769") -- never touches the open, $0, no-source-document settlements
// that some of the 24 currently-dispatched loads sit in (those have no real settlement document to
// backfill from at all; ROUND 155.12's DONE LINE reports that gap honestly rather than inventing a
// source for them).
//
// AUTH-091 (docs/bus/OWNER-AUTHORIZATIONS.md).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const LABEL = "backfill-settlement-line-miles-rate";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TRUTH_PATH = path.join(ROOT, "feed-input/settlement-truth-from-pdfs.json");
const APPLY = process.argv.includes("--apply");

// ROUND 133 (owner law, P0) retrofit: this script writes driver_finance.settlement_lines under
// AUTH-091 (see docs/bus/OWNER-AUTHORIZATIONS.md) -- verify-no-unauthorized-production-write.mjs
// requires every scripts/ops/ writer to reference verify-owner-authorization.mjs before an --apply
// run. Added after the fact (this script already executed under a valid AUTH-091 at the time) so
// static compliance matches what actually happened and any future re-run stays gated the same way.
if (APPLY) {
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error(`${LABEL}: OWNER_AUTH_ID required (ROUND 133 P0)`);
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], { stdio: "inherit" });
}

// settlement_lines_item_qty_rate_amount_check requires item_id whenever quantity/rate_cents/
// unit_of_measure are set. catalogs.items already carries the real per-driver-type mileage items
// (verified live 2026-09-28, zero settlement_lines rows have ever set item_id before this backfill
// -- there is no prior convention to match, so this picks the item by the driver's own visa type,
// same B1-vs-CDL distinction mdata.drivers.has_b1_visa already carries).
const ITEM_IDS = {
  b1_loaded: "673270bf-3a76-4fdd-934c-b5119840e053", // Driver Pay-Mexico-B1 Driver-Loaded Miles
  b1_empty: "ca4de9f2-fccc-47f9-9abe-6f930ca7d38d", // Driver Pay-Mexico-B1 Driver-Empty Miles
  cdl_loaded: "a9a03f7a-5783-4615-a4f2-81b7b41973a8", // Driver Pay-CDL-Loaded Miles
  cdl_empty: "2a1414eb-b95d-4762-a9af-712f40f654ab", // Driver Pay-CDL-Empty Miles
};

function centsFromDollarRate(rate) {
  // Rates are printed to the cent (e.g. 0.50, 0.48) -- round to the nearest cent, never truncate.
  return Math.round(Number(rate) * 100);
}

// Postgres's `round(quantity * rate_cents)` runs on exact `numeric` arithmetic -- IEEE-754 doubles
// do not reproduce that exactly at half-cent boundaries (1303.1 * 45 can land on
// 58639.499999999996 instead of 58639.5, rounding the wrong way). Every quantity in the truth file
// carries at most 1 decimal place, so multiplying by 10 first makes it an exact integer and the
// whole computation exact-integer arithmetic end to end, matching Postgres's numeric round() bit
// for bit instead of approximating it.
function computedCentsExact(quantity, rateCents) {
  const tenthsOfAMile = Math.round(Number(quantity) * 10);
  return Math.round((tenthsOfAMile * rateCents) / 10);
}

// Mirrors the DB's own CHECK constraint EXACTLY (settlement_lines_item_qty_rate_amount_check:
// round(quantity * rate_cents) = round(amount * 100)) -- must match against the row's real,
// already-seeded `amount` column, never the JSON's own amount: a genuine mismatch here (as opposed
// to float noise, fixed above) means the DB's "earnings"/"deadhead_pay" line amount already bundles
// something beyond pure mileage pay (extra-stop bonus, tarp, lumper -- all folded into the same
// bucket by the original seeder) and must NOT be force-matched.
function amountsMatch(quantity, rateCents, dbAmountDollars) {
  const dbCents = Math.round(Number(dbAmountDollars) * 100);
  return computedCentsExact(quantity, rateCents) === dbCents;
}

async function main() {
  const truth = JSON.parse(fs.readFileSync(TRUTH_PATH, "utf8"));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  const report = { updated: [], mismatched: [], no_source_data: [], settlement_not_found: [], load_not_found: [] };

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

    for (const [settlementNumber, entry] of Object.entries(truth)) {
      const dsRes = await client.query(
        `SELECT ds.id::text, ds.operating_company_id::text, ds.status,
                COALESCE(d.has_b1_visa, true) AS has_b1_visa
           FROM driver_finance.driver_settlements ds
           LEFT JOIN mdata.drivers d ON d.id = ds.driver_id
          WHERE (ds.display_id = $1 OR ds.source_document_ref = $1) AND ds.voided_at IS NULL
          LIMIT 1`,
        [settlementNumber]
      );
      const settlement = dsRes.rows[0];
      if (!settlement || settlement.status !== "closed") {
        report.settlement_not_found.push({ settlementNumber, found: Boolean(settlement), status: settlement?.status ?? null });
        continue;
      }
      const loadedItemId = settlement.has_b1_visa ? ITEM_IDS.b1_loaded : ITEM_IDS.cdl_loaded;
      const emptyItemId = settlement.has_b1_visa ? ITEM_IDS.b1_empty : ITEM_IDS.cdl_empty;

      for (const [loadNumber, loadEntry] of Object.entries(entry.loads ?? {})) {
        const loadRes = await client.query(
          `SELECT id::text FROM mdata.loads WHERE load_number = $1 AND operating_company_id = $2::uuid LIMIT 1`,
          [loadNumber, settlement.operating_company_id]
        );
        const loadRow = loadRes.rows[0];
        if (!loadRow) {
          report.load_not_found.push({ settlementNumber, loadNumber });
          continue;
        }

        const linesRes = await client.query(
          `SELECT id::text, line_type, amount, quantity, rate_cents
             FROM driver_finance.settlement_lines
            WHERE settlement_id = $1::uuid AND load_id = $2::uuid AND is_active IS TRUE
              AND line_type IN ('earnings', 'deadhead_pay')`,
          [settlement.id, loadRow.id]
        );

        for (const line of linesRes.rows) {
          if (line.quantity !== null || line.rate_cents !== null) continue; // already backfilled, never overwrite

          const isDeadhead = line.line_type === "deadhead_pay";
          const quantity = isDeadhead ? loadEntry.empty_miles : loadEntry.loaded_miles;
          const rate = isDeadhead ? loadEntry.empty_rate : loadEntry.loaded_rate;
          const expectedAmount = isDeadhead ? loadEntry.empty_amount : loadEntry.loaded_amount;

          if (quantity == null || rate == null) {
            report.no_source_data.push({ settlementNumber, loadNumber, lineId: line.id, lineType: line.line_type, dbAmount: line.amount });
            continue;
          }

          const rateCents = centsFromDollarRate(rate);
          if (!amountsMatch(quantity, rateCents, line.amount)) {
            report.mismatched.push({
              settlementNumber, loadNumber, lineId: line.id, lineType: line.line_type,
              quantity, rateCents, computedDollars: computedCentsExact(quantity, rateCents) / 100,
              dbAmount: line.amount, jsonExpectedAmount: expectedAmount,
            });
            continue;
          }

          const itemId = isDeadhead ? emptyItemId : loadedItemId;
          report.updated.push({ settlementNumber, loadNumber, lineId: line.id, lineType: line.line_type, quantity, rateCents, itemId });
          if (APPLY) {
            await client.query(
              `UPDATE driver_finance.settlement_lines
                  SET quantity = $1, rate_cents = $2, unit_of_measure = 'mi', item_id = $3::uuid
                WHERE id = $4::uuid AND quantity IS NULL AND rate_cents IS NULL AND item_id IS NULL`,
              [quantity, rateCents, itemId, line.id]
            );
          }
        }
      }
    }

    if (APPLY) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`${LABEL}: ${APPLY ? "APPLIED" : "DRY RUN"}`);
  console.log(`  updated:              ${report.updated.length}`);
  console.log(`  mismatched (SKIPPED): ${report.mismatched.length}`);
  console.log(`  no source data:       ${report.no_source_data.length}`);
  console.log(`  settlement not found/not closed: ${report.settlement_not_found.length}`);
  console.log(`  load not found:       ${report.load_not_found.length}`);
  if (report.mismatched.length) {
    console.log("\nMISMATCHES (not written):");
    for (const m of report.mismatched) console.log(`  - ${JSON.stringify(m)}`);
  }
  fs.writeFileSync(
    path.join(ROOT, "scripts/ops/2026-09-28-backfill-settlement-line-miles-rate.report.json"),
    JSON.stringify(report, null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
