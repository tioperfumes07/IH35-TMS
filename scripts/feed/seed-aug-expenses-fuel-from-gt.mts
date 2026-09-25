#!/usr/bin/env tsx
/**
 * Seed AlwaysTrack company expenses + diesel fuel for docs 5769–5815 from
 * settlements-truth ground truth (six-dimension parity).
 *
 * - EXPENSES: GT `expenses[]` (DEF, scale, toll, …) → accounting.expenses (not fuel).
 * - FUEL: GT `fuel_purchases[]` diesel only → fuel.fuel_transactions.
 * - 13524 LH stays $3800 (Faro/rate-con) — do not touch invoices.
 * - Never reopens SPAN — owner wants Aug+Sep fully closed.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/seed-aug-expenses-fuel-from-gt.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/seed-aug-expenses-fuel-from-gt.mts --apply
 *   ... --only 5770,5796
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerExpenseRoutes } from "../../apps/backend/src/accounting/expenses.routes.js";
import { registerVendorRoutes } from "../../apps/backend/src/mdata/vendors.routes.js";
import { reverseSettlementPayRunInClientTx } from "../../apps/backend/src/driver-finance/settlement-payrun-reverse.service.js";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.js";
import { searchVendorsForAutocomplete } from "../../apps/backend/src/mdata/vendor-autocomplete.shared.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const BANK = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3";
const EXPENSE_ACCT = "353fbd5b-d39c-4709-ac19-60cae52018f7";
const LOVES = "LOVES";
const GT_PATH = join(process.cwd(), "data/alwaystrack/settlements-truth-2026-09-13.json");

const APPLY = process.argv.includes("--apply");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(process.argv[onlyIdx + 1]!.split(",").map((s) => s.trim())) : null;

/** Pure-Aug through Sep AT docs in ground-truth scope (parity in-scope set). */
const ALL_DOCS = Array.from({ length: 47 }, (_, i) => String(5769 + i)); // 5769-5815

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (/-pooler\./.test(process.env.DATABASE_URL)) throw new Error("Refuse -pooler DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1" && !process.env.E11_AUTH_ID) {
  throw new Error("set E11_LEAD_AUTH=1 or E11_AUTH_ID");
}

function cents(n: number) {
  return Math.round(Number(n) * 100);
}

async function resolveVendor(client: pg.PoolClient, name: string): Promise<string> {
  const tryName = async (term: string) => {
    const rows = await searchVendorsForAutocomplete(client, {
      operating_company_id: USMCA,
      term,
      limit: 5,
      active_only: true,
    });
    const exact = rows.find((r) => r.display_name.toUpperCase() === term.toUpperCase());
    if (exact) return exact.id;
    if (rows[0]) return rows[0].id;
    return null;
  };
  // Prefer short token (LOVES, PILOT) over full street address vendor strings from AT.
  const short = name.split(/\s+/).slice(0, 2).join(" ");
  return (
    (await tryName(name)) ||
    (await tryName(short)) ||
    (await tryName(LOVES)) ||
    (() => {
      throw new Error(`vendor_not_found ${name}`);
    })()
  );
}

function invoiceFromExpenseRaw(raw: string | undefined, invoice: string | undefined): string {
  if (invoice && String(invoice).trim()) return String(invoice).trim();
  if (!raw) return "";
  // Prefer long numeric tokens (fuel invoice ids)
  const nums = [...String(raw).matchAll(/\b(\d{6,})\b/g)].map((m) => m[1]!);
  return nums[0] ?? "";
}

function vendorGuess(desc: string): string {
  if (/toll/i.test(desc)) return "INDIANA TOLL ROAD";
  if (/lumper/i.test(desc)) return "WAREHOUSE LUMPER";
  if (/washout/i.test(desc)) return "REEFER WASHOUT";
  if (/loves/i.test(desc)) return LOVES;
  return LOVES;
}

async function main() {
  const raw = JSON.parse(readFileSync(GT_PATH, "utf8")) as {
    company: Array<{
      settlement_no: number | string;
      loads: string[];
      expenses?: Array<{
        date?: string;
        vendor?: string;
        description?: string;
        invoice?: string;
        amount: number;
        raw?: string;
        load?: string;
      }>;
      fuel_purchases?: Array<{
        load: string;
        date?: string;
        vendor?: string;
        location?: string;
        invoice?: string;
        gallons?: number;
        actual: number;
      }>;
    }>;
  };

  const docs = raw.company.filter((c) => {
    const d = String(c.settlement_no);
    if (!ALL_DOCS.includes(d)) return false;
    if (ONLY && !ONLY.has(d)) return false;
    return true;
  });

  console.log(`seed-at-expenses-fuel apply=${APPLY} docs=${docs.length}`);

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = APPLY
    ? await createIntegrationApp(async (a) => {
        await registerExpenseRoutes(a);
        await registerVendorRoutes(a);
      })
    : null;
  const auth = {
    "x-test-auth": Buffer.from(
      JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }),
      "utf8"
    ).toString("base64url"),
    "content-type": "application/json",
  };

  for (const c of docs) {
    const doc = String(c.settlement_no);
    const loads = (c.loads ?? []).map(String);
    const expenses = c.expenses ?? [];
    const fuels = c.fuel_purchases ?? [];
    console.log(
      `\nDOC ${doc} loads=${loads.join(",")} exp=${expenses.length} fuel=${fuels.length}`
    );

    // Map invoice → load from fuel purchases for DEF attribution
    const invToLoad = new Map<string, string>();
    for (const f of fuels) {
      if (f.invoice) invToLoad.set(String(f.invoice), String(f.load));
    }

    await withCurrentUser(OWNER, async (client) => {
      await setScopedCompanyContext(client, OWNER, USMCA);
      const loadRows = await client.query<{
        id: string;
        load_number: string;
        assigned_primary_driver_id: string | null;
        assigned_unit_id: string | null;
      }>(
        `SELECT id::text, load_number, assigned_primary_driver_id::text, assigned_unit_id::text
           FROM mdata.loads
          WHERE operating_company_id=$1::uuid AND load_number = ANY($2::text[]) AND soft_deleted_at IS NULL`,
        [USMCA, loads]
      );
      const byLn = new Map(loadRows.rows.map((r) => [r.load_number, r]));
      for (const ln of loads) if (!byLn.has(ln)) console.log(`  WARN missing load ${ln}`);

      // ── FUEL (diesel GT rows only) ──────────────────────────────────────────
      let fi = 0;
      for (const f of fuels) {
        fi += 1;
        const lr = byLn.get(String(f.load));
        if (!lr) {
          console.log(`  SKIP fuel — load ${f.load} missing`);
          continue;
        }
        const inv = String(f.invoice || `nofuelinv-${doc}-${fi}`);
        const rowHash = `alwaystrack-gt-fuel:${USMCA}:${lr.id}:diesel:${inv}:${cents(f.actual)}`;
        const existing = await client.query(
          `SELECT id::text FROM fuel.fuel_transactions
            WHERE operating_company_id=$1::uuid AND source_row_hash=$2 LIMIT 1`,
          [USMCA, rowHash]
        );
        if (existing.rows[0]) {
          console.log(`  FUEL exists ${inv} $${f.actual}`);
          continue;
        }
        // Also match by invoice+amount on load
        const byInv = await client.query(
          `SELECT id::text FROM fuel.fuel_transactions
            WHERE operating_company_id=$1::uuid AND load_id=$2::uuid
              AND transaction_reference=$3 AND abs(total_cost - $4::numeric) < 0.02
              AND archived_at IS NULL LIMIT 1`,
          [USMCA, lr.id, inv, f.actual]
        );
        if (byInv.rows[0]) {
          console.log(`  FUEL match-inv ${inv} $${f.actual}`);
          continue;
        }
        console.log(`  FUEL need ${inv} $${f.actual} load ${f.load}`);
        if (!APPLY) continue;
        const vendorId = await resolveVendor(client as unknown as pg.PoolClient, f.vendor || LOVES);
        await client.query(
          `INSERT INTO fuel.fuel_transactions (
             operating_company_id, transaction_at, purchased_at, load_id, vendor_id, fuel_type,
             gallons, total_cost, location_city, transaction_reference, source, source_row_hash,
             created_by_user_id, updated_by_user_id, driver_id, unit_id
           ) VALUES ($1::uuid, $2::date, $2::date, $3::uuid, $4::uuid, 'diesel', $5, $6, $7, $8, 'import', $9,
                     $10::uuid, $10::uuid, $11::uuid, $12::uuid)
           ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING`,
          [
            USMCA,
            f.date || "2026-08-15",
            lr.id,
            vendorId,
            Number(f.gallons || 0),
            Number(f.actual),
            f.location || null,
            inv,
            rowHash,
            OWNER,
            lr.assigned_primary_driver_id,
            lr.assigned_unit_id,
          ]
        );
        console.log(`  FUEL inserted ${inv}`);
      }

      // ── EXPENSES ────────────────────────────────────────────────────────────
      let ei = 0;
      for (const e of expenses) {
        ei += 1;
        const inv = invoiceFromExpenseRaw(e.raw, e.invoice);
        let loadNumber = e.load ? String(e.load) : invToLoad.get(inv) ?? loads[0];
        if (!loadNumber || !byLn.has(loadNumber)) {
          console.log(`  SKIP exp $${e.amount} — no load`);
          continue;
        }
        const lr = byLn.get(loadNumber)!;
        const dedupe = `AT${doc}-${ei}-${cents(e.amount)}`.slice(0, 30);
        const exists = await client.query(
          `SELECT id::text FROM accounting.expenses
            WHERE operating_company_id=$1::uuid AND vendor_document_number=$2 AND voided_at IS NULL LIMIT 1`,
          [USMCA, dedupe]
        );
        if (exists.rows[0]) {
          console.log(`  EXP exists ${dedupe}`);
          continue;
        }
        // Amount+load near-match (any memo)
        const near = await client.query(
          `SELECT id::text FROM accounting.expenses
            WHERE operating_company_id=$1::uuid AND load_id=$2::uuid AND voided_at IS NULL
              AND source_fuel_transaction_id IS NULL
              AND total_amount_cents=$3 LIMIT 1`,
          [USMCA, lr.id, cents(Math.abs(e.amount))]
        );
        // Don't skip near-match blindly — multiple same-amount rows exist; use dedupe only
        console.log(
          `  EXP need ${dedupe} $${e.amount} load ${loadNumber} ${String(e.description || "").slice(0, 40)}`
        );
        if (!APPLY || !app) continue;

        const vendorName = e.vendor?.trim() || vendorGuess(e.description || "");
        let vendorId: string;
        try {
          vendorId = await resolveVendor(client as unknown as pg.PoolClient, vendorName);
        } catch {
          vendorId = await resolveVendor(client as unknown as pg.PoolClient, LOVES);
        }
        const memo = `AT settl ${doc} #${ei} $${Number(e.amount).toFixed(2)} load ${loadNumber} inv ${inv || "none"} — ${String(e.description || "expense").slice(0, 80)}`;
        const exp = await app.inject({
          method: "POST",
          url: "/api/v1/expenses",
          headers: auth,
          payload: {
            operating_company_id: USMCA,
            category_account_id: EXPENSE_ACCT,
            payment_account_uuid: BANK,
            expense_date: e.date || "2026-08-15",
            amount_cents: cents(Math.abs(e.amount)),
            vendor_uuid: vendorId,
            memo,
            vendor_document_number: dedupe,
            load_id: lr.id,
            unit_id: lr.assigned_unit_id,
            driver_id: lr.assigned_primary_driver_id,
            is_company_expense: true,
            is_sample_data: false,
          },
        });
        console.log(`  EXP POST ${exp.statusCode} ${exp.body.slice(0, 120)}`);
        if (
          exp.statusCode >= 300 &&
          !exp.body.includes("duplicate_vendor_document_number") &&
          !exp.body.includes("duplicate_expense_submission")
        ) {
          console.error(`  EXP WARN ${dedupe}: ${exp.body.slice(0, 300)}`);
          continue;
        }
      }
    });
  }

  if (app) await app.close();
  console.log("\nDONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
