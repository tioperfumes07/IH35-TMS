#!/usr/bin/env tsx
/**
 * Owner plan (HANDOFF + Excel IH35-USMCA-AUGUST-LOAD-BUILD):
 * Create the DOCUMENTS from AlwaysTrack settlements so banking can match later.
 *   - fuel → accounting.expenses via createExpenseFromFuelTransaction (FUEL-EXPENSE-DOC-01)
 *   - company expense lines from feed_input → POST /api/v1/expenses
 *   - cash advances → createDriverCashAdvanceCore (bill payment on driver bill) via completer
 *
 * Does NOT touch banking.*. Does NOT invent GL. Does NOT reopen/reverse SPAN.
 *
 * Excel USMCA load set = 31 loads on Desktop LOAD-BUILD (13556 absent in app + feed —
 * Faro inv 36 is live load 13565 Hummingbird; do not invent 13556).
 *
 *   E11_LEAD_AUTH=1 IH35_TEST_AUTH_BYPASS=1 npx tsx scripts/feed/create-excel-usmca-expense-docs.mts
 *   ... --apply
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createExpenseFromFuelTransaction } from "../../apps/backend/src/fuel/fuel-expense-document.service.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import expensesPlugin from "../../apps/backend/src/accounting/expenses.routes.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DL = "/Users/jorgemunoz/Downloads/IH35-RECONCILIATION-AND-FEED";
/** Same constants as feed-settlement-day.mts — proven live. */
const BANK = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3";
const EXPENSE_ACCT = "353fbd5b-d39c-4709-ac19-60cae52018f7";

/** From Desktop/IH35-USMCA-AUGUST-LOAD-BUILD.xlsx tab 04 LOADS — USMCA only.
 *  Excel also lists 13556 — not in feed_input/app (Faro inv 36 → live 13565). Do not invent. */
const EXCEL_LOADS = [
  "13508", "13510", "13511", "13512", "13513", "13514", "13516", "13518", "13519", "13520",
  "13521", "13523", "13526", "13528", "13529", "13532", "13534", "13535", "13536", "13537",
  "13538", "13542", "13543", "13544", "13545", "13546", "13547", "13548", "13549", "13550",
];


if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1" && !process.env.E11_AUTH_ID) {
  throw new Error("set E11_LEAD_AUTH=1");
}

const auth = {
  "x-test-auth": Buffer.from(
    JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }),
    "utf8"
  ).toString("base64url"),
  "content-type": "application/json",
};

function cents(n: number) {
  return Math.round(Math.abs(Number(n)) * 100);
}

function feedInputPath() {
  const a = join(DL, "01-ENGINES/feed_input.json");
  const b = join(DL, "02-CONTROLS-AND-GATES/feed_input.json");
  if (existsSync(a)) return a;
  if (existsSync(b)) return b;
  return join(ROOT, "scripts/feed/settlement_control.json"); // never used for records
}

async function main() {
  const fiPath = join(DL, existsSync(join(DL, "01-ENGINES/feed_input.json")) ? "01-ENGINES/feed_input.json" : "02-CONTROLS-AND-GATES/feed_input.json");
  const fi = JSON.parse(readFileSync(fiPath, "utf8")) as {
    records: Array<{
      load_number: string;
      settlement_doc_no: string;
      lines: Array<{
        kind?: string;
        posts_to?: string;
        amount?: number;
        description?: string;
        item_name?: string;
      }>;
      delivery_departure_date?: string;
      stops?: Array<{ stop_date?: string; stop_type?: string }>;
    }>;
  };
  const byLoad = new Map(fi.records.map((r) => [String(r.load_number), r]));

  // 1) Fuel → expense documents
  console.log("\n=== 1. Fuel expense documents (Excel USMCA loads) ===");
  const fuelMissing = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string; load_number: string; total_cost: string; fuel_type: string }>(
      `SELECT ft.id::text, l.load_number, ft.total_cost::text, ft.fuel_type
         FROM fuel.fuel_transactions ft
         JOIN mdata.loads l ON l.id = ft.load_id
         LEFT JOIN accounting.expenses e
           ON e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL
        WHERE ft.operating_company_id = $1::uuid
          AND ft.voided_at IS NULL
          AND e.id IS NULL
          AND l.load_number = ANY($2::text[])
        ORDER BY l.load_number::int, ft.purchased_at, ft.id`,
      [USMCA, EXCEL_LOADS]
    );
    return r.rows;
  });
  console.log(`fuel_tx missing expense doc: ${fuelMissing.length} ($${fuelMissing.reduce((s, r) => s + Number(r.total_cost), 0).toFixed(2)})`);

  let fuelCreated = 0;
  let fuelAlready = 0;
  let fuelRefused = 0;
  if (APPLY) {
    for (const row of fuelMissing) {
      const out = await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        return createExpenseFromFuelTransaction(c as never, {
          operating_company_id: USMCA,
          fuel_transaction_id: row.id,
          requesting_user_uuid: OWNER,
        });
      });
      if (out.outcome === "created") fuelCreated += 1;
      else if (out.outcome === "already_exists") fuelAlready += 1;
      else {
        fuelRefused += 1;
        console.error(`  REFUSED ${row.load_number} ${row.fuel_type} $${row.total_cost}: ${"reason" in out ? out.reason : out.outcome}`);
      }
    }
  } else {
    console.log("DRY — pass --apply to createExpenseFromFuelTransaction");
  }
  console.log(`fuel docs created=${fuelCreated} already=${fuelAlready} refused=${fuelRefused}`);

  // 2) Company expense lines from feed_input (non-fuel) missing by vendor_document_number dedupe
  console.log("\n=== 2. Company expense documents from feed_input ===");
  const app = await createIntegrationApp(async (a) => {
    await a.register(expensesPlugin);
  });

  // Resolve LOVES vendor (or any active vendor) for company expense POST
  const lovesVendor = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string }>(
      `SELECT id::text FROM mdata.vendors
        WHERE operating_company_id=$1::uuid
          AND vendor_name ILIKE 'LOVES%'
        LIMIT 1`,
      [USMCA]
    );
    if (r.rows[0]) return r.rows[0].id;
    const any = await c.query<{ id: string }>(
      `SELECT id::text FROM mdata.vendors
        WHERE operating_company_id=$1::uuid LIMIT 1`,
      [USMCA]
    );
    return any.rows[0]?.id ?? null;
  });
  if (!lovesVendor) throw new Error("no vendor available for company expense create");

  let ceCreated = 0;
  let ceSkip = 0;
  let ceFail = 0;
  for (const ln of EXCEL_LOADS) {
    const rec = byLoad.get(ln);
    if (!rec) continue;
    const companyExp = (rec.lines || []).filter(
      (l) => l.posts_to === "expense" && !["diesel", "def", "reefer"].includes(String(l.kind || ""))
    );
    if (!companyExp.length) continue;

    const loadMeta = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const r = await c.query<{ id: string; driver_id: string | null; unit_id: string | null }>(
        `SELECT id::text, assigned_primary_driver_id::text AS driver_id, assigned_unit_id::text AS unit_id
           FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2 LIMIT 1`,
        [USMCA, ln]
      );
      return r.rows[0] ?? null;
    });
    if (!loadMeta) continue;

    const delivery =
      rec.delivery_departure_date ||
      [...(rec.stops || [])].reverse().find((s) => s.stop_date)?.stop_date ||
      "2026-08-15";

    let ei = 0;
    for (const e of companyExp) {
      ei += 1;
      const dedupe = `AT${rec.settlement_doc_no}-${ln}-${ei}-${cents(Number(e.amount))}`.slice(0, 30);
      const exists = await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        const r = await c.query<{ id: string }>(
          `SELECT id::text FROM accounting.expenses
            WHERE operating_company_id=$1::uuid AND vendor_document_number=$2 AND voided_at IS NULL LIMIT 1`,
          [USMCA, dedupe]
        );
        return r.rows[0]?.id ?? null;
      });
      if (exists) {
        ceSkip += 1;
        continue;
      }
      if (!APPLY) {
        console.log(`DRY CE load ${ln} $${Number(e.amount).toFixed(2)} ${e.description || e.item_name}`);
        continue;
      }
      const exp = await app.inject({
        method: "POST",
        url: "/api/v1/expenses",
        headers: auth,
        payload: {
          operating_company_id: USMCA,
          category_account_id: EXPENSE_ACCT,
          payment_account_uuid: BANK,
          expense_date: delivery,
          amount_cents: cents(Number(e.amount)),
          vendor_uuid: lovesVendor,
          memo: `${e.description || e.item_name} — #${ei} $${Number(e.amount).toFixed(2)} load ${ln} settl ${rec.settlement_doc_no}`,
          vendor_document_number: dedupe,
          load_id: loadMeta.id,
          unit_id: loadMeta.unit_id,
          driver_id: loadMeta.driver_id,
          is_company_expense: true,
          is_sample_data: false,
        },
      });
      if (
        exp.statusCode >= 300 &&
        !exp.body.includes("duplicate_vendor_document_number") &&
        !exp.body.includes("duplicate_expense_submission")
      ) {
        ceFail += 1;
        console.error(`CE FAIL ${ln}: ${exp.statusCode} ${exp.body.slice(0, 200)}`);
      } else {
        ceCreated += 1;
      }
    }
  }
  console.log(`company expenses created=${ceCreated} skipped_existing=${ceSkip} failed=${ceFail}`);

  // 3) Point caller at CA completer (already exists — bill payment path)
  console.log("\n=== 3. Cash advances (bill payments) ===");
  console.log(
    "Run existing: E11_LEAD_AUTH=1 npx tsx scripts/feed/complete-aug-settlement-deductions.mts --apply --only 5769,5771,5772,5773,5774,5775,5776,5777,5779,5780,5781,5782,5783,5784,5785,5786,5787"
  );
  console.log(APPLY ? "\nDONE apply (fuel docs + CE)" : "\nDRY done — pass --apply");
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
