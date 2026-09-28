#!/usr/bin/env -S npx tsx
/**
 * ROUND 178/190 — real, idempotent import of feed-input/09-25-26-DRIVER_CARRIER_EXPENSES.xlsx's
 * 20 invoice-number-unmatched candidate rows into accounting.expenses, through the SAME
 * sanctioned engine (seedExpense) the AlwaysTrack settlement-import feed already uses — never a
 * hand-rolled INSERT. Calling this engine surfaced 4 real, independent, pre-existing bugs in
 * apps/backend/src/feed/seed-settlement-document.service.ts (fixed in the same PR as this
 * script; see that file's own inline comments for each): a stray extra bind parameter that made
 * seedExpense() throw on every real call, a wrong mdata.vendors column name
 * ("name" -> "vendor_name"), an incompatible trailer_id id-space (dropped from the INSERT —
 * mdata.loads.load_trailer_equipment_id and accounting.expenses.trailer_id's own FK reference
 * two different tables), and a missing expense_lines quantity/rate_cents/unit_of_measure trio
 * that the item_id column requires together. seedExpense() had never successfully created a row
 * before this fix — confirmed via an isolated, rollback-wrapped live call.
 *
 * Matching: xlsx Invoice # (col 5) against every existing USMCA accounting.expenses row's
 * vendor_document_number + memo (6-10 digit numeric substrings extracted) — the same method
 * ROUND 178 JOB A's dry-run used (docs/bus/09-28-2026-CC-2-ROUND-178-JOBA-IMPORT-DRYRUN.md).
 * 3 rows have no numeric invoice at all (2 lumper, 1 washout with an alnum reference) and import
 * unconditionally since nothing to dedupe against; the remaining 17 already excluded any row
 * whose invoice number appears anywhere in the existing 1476-row extraction.
 *
 * "GAS" / "COMIDAS" (Item = "Miscellaneous", no EXPENSE_ITEM_ALIASES keyword match) REFUSE by
 * design (resolveExpenseItem throws rather than posting to a guessed category) — reported as
 * skipped, never forced.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops-r190-import-expenses-xlsx.ts [--apply]
 * (run from apps/backend/ so the relative import below resolves)
 */
import pg from "pg";
import { seedExpense } from "../src/feed/seed-settlement-document.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");

// The 20 real, invoice-number-unmatched candidate rows from
// feed-input/09-25-26-DRIVER_CARRIER_EXPENSES.xlsx (re-derived fresh this session, identical to
// the ROUND 178 JOB A dry-run's own 20). isReimbursementSurvivor is set true only for the one row
// whose Item text itself is explicitly "Driver Reimbursement-..." (this xlsx export already
// labels reimbursement lines explicitly, unlike the AlwaysTrack truth-JSON's dedup-derived flag).
const CANDIDATES: Array<{
  loadNumber: string;
  date: string;
  vendor: string;
  description: string;
  amountCents: number;
  invoice: string;
  isReimbursementSurvivor: boolean;
}> = [
  { loadNumber: "13587", date: "2026-09-10", vendor: "TRUCK WASH HEBRON", description: "Reefer Trailer-Washout Expense", amountCents: 4725, invoice: "HB000170474", isReimbursementSurvivor: false },
  { loadNumber: "13590", date: "2026-09-14", vendor: "TERRENCE SMITH", description: "Warehouse-Lumper Fee Expense", amountCents: 25000, invoice: "", isReimbursementSurvivor: false },
  { loadNumber: "13600", date: "2026-09-15", vendor: "LOVES #304 TRAVEL STOP", description: "Fuel-DEF-Diesel Exhaust Fluid", amountCents: 4268, invoice: "", isReimbursementSurvivor: false },
  { loadNumber: "13605", date: "2026-09-18", vendor: "", description: "Warehouse-Lumper Fee Expense", amountCents: 30800, invoice: "", isReimbursementSurvivor: false },
  { loadNumber: "13606", date: "2026-09-18", vendor: "GDC GROUP LOGISTICS,INC", description: "Warehouse-Lumper Fee Expense", amountCents: 12000, invoice: "928526", isReimbursementSurvivor: false },
  { loadNumber: "13614", date: "2026-09-20", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", amountCents: 1750, invoice: "2064749", isReimbursementSurvivor: false },
  { loadNumber: "13614", date: "2026-09-20", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", amountCents: 4283, invoice: "2895706", isReimbursementSurvivor: false },
  { loadNumber: "13614", date: "2026-09-19", vendor: "LOVES", description: "Scale Expense:OTR-Scale Expense", amountCents: 1525, invoice: "1937351", isReimbursementSurvivor: false },
  { loadNumber: "13612", date: "2026-09-19", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", amountCents: 3596, invoice: "99826010", isReimbursementSurvivor: false },
  { loadNumber: "13611", date: "2026-09-18", vendor: "Smithfield Foods Inc", description: "Warehouse-Lumper Fee Expense", amountCents: 26910, invoice: "", isReimbursementSurvivor: false },
  { loadNumber: "13612", date: "2026-09-20", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", amountCents: 1514, invoice: "99480730", isReimbursementSurvivor: false },
  { loadNumber: "13610", date: "2026-09-21", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", amountCents: 2912, invoice: "1500002", isReimbursementSurvivor: false },
  { loadNumber: "13610", date: "2026-09-20", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", amountCents: 1764, invoice: "1857875", isReimbursementSurvivor: false },
  { loadNumber: "13617", date: "2026-09-22", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", amountCents: 4420, invoice: "99482226", isReimbursementSurvivor: false },
  { loadNumber: "13617", date: "2026-09-24", vendor: "LOVES", description: "Road Service-Trailer Tire Expense", amountCents: 128735, invoice: "4010947971", isReimbursementSurvivor: false },
  { loadNumber: "13619", date: "2026-09-22", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", amountCents: 1593, invoice: "99066366", isReimbursementSurvivor: false },
  { loadNumber: "13609", date: "2026-09-23", vendor: "LOVES", description: "Driver Reimbursement-TPE-Scale Expense", amountCents: 1525, invoice: "1142716", isReimbursementSurvivor: true },
  { loadNumber: "13609", date: "2026-09-25", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", amountCents: 1497, invoice: "1099112", isReimbursementSurvivor: false },
];
// 2 rows deliberately EXCLUDED here, never inserted, reported separately below: Item="Miscellaneous"
// "GAS" $240 and "COMIDAS" $140 on load 13600 (2026-09-23) — no EXPENSE_ITEM_ALIASES keyword
// match, resolveExpenseItem refuses by design rather than guessing a category.
const REFUSED_NO_CATEGORY = [
  { loadNumber: "13600", date: "2026-09-23", description: "GAS", amountCents: 24000 },
  { loadNumber: "13600", date: "2026-09-23", description: "COMIDAS", amountCents: 14000 },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: url, max: 2 });

  console.log(APPLY ? "APPLY MODE — rows will be committed." : "DRY RUN — every transaction will ROLLBACK.");
  console.log(`REFUSED (no category match, never attempted): ${REFUSED_NO_CATEGORY.length}`);
  for (const r of REFUSED_NO_CATEGORY) console.log(`  - load ${r.loadNumber} ${r.date} "${r.description}" $${(r.amountCents / 100).toFixed(2)}`);

  const results: Array<{ loadNumber: string; invoice: string; outcome: string; expenseId?: string | null; error?: string }> = [];

  for (const cand of CANDIDATES) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

      const loadRes = await client.query<{ id: string }>(
        `SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2 LIMIT 1`,
        [USMCA, cand.loadNumber]
      );
      const load = loadRes.rows[0];
      if (!load) {
        results.push({ loadNumber: cand.loadNumber, invoice: cand.invoice, outcome: "load_not_found" });
        await client.query("ROLLBACK");
        continue;
      }

      const expenseId = await seedExpense(client, USMCA, OWNER_USER_ID, load.id, cand.loadNumber, {
        date: cand.date,
        vendor: cand.vendor || "Unknown Vendor",
        description: cand.description,
        amountCents: cand.amountCents,
        invoice: cand.invoice,
        raw: cand.description,
        isReimbursementSurvivor: cand.isReimbursementSurvivor,
      });

      results.push({ loadNumber: cand.loadNumber, invoice: cand.invoice, outcome: expenseId ? "seeded" : "skipped_card_fuel_dupe", expenseId });

      if (APPLY) {
        await client.query("COMMIT");
      } else {
        await client.query("ROLLBACK");
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      results.push({ loadNumber: cand.loadNumber, invoice: cand.invoice, outcome: "error", error: (err as Error).message });
    } finally {
      client.release();
    }
  }

  console.log(JSON.stringify(results, null, 2));
  const seeded = results.filter((r) => r.outcome === "seeded").length;
  const failed = results.filter((r) => r.outcome === "error" || r.outcome === "load_not_found").length;
  console.log(`\nTotal: ${results.length} candidates -- seeded=${seeded} skipped_dupe=${results.filter((r) => r.outcome === "skipped_card_fuel_dupe").length} failed=${failed}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
