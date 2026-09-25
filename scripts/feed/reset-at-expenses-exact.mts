#!/usr/bin/env tsx
/**
 * Exact-reset AlwaysTrack EXPENSES for docs 5769–5803 (parity scope):
 * void live non-fuel expenses on those loads (batched, no long tx), then seed
 * exactly once from settlements-truth. Stamps missing unit_id from settlement_control.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/reset-at-expenses-exact.mts --apply
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerExpenseRoutes } from "../../apps/backend/src/accounting/expenses.routes.js";
import { registerVendorRoutes } from "../../apps/backend/src/mdata/vendors.routes.js";
import { searchVendorsForAutocomplete } from "../../apps/backend/src/mdata/vendor-autocomplete.shared.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const BANK = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3";
const EXPENSE_ACCT = "353fbd5b-d39c-4709-ac19-60cae52018f7";
const LOVES = "LOVES";
const APPLY = process.argv.includes("--apply");
const SEED_ONLY = process.argv.includes("--seed-only");
const GT_PATH = join(process.cwd(), "data/alwaystrack/settlements-truth-2026-09-13.json");
const CTRL_PATH = join(process.cwd(), "scripts/feed/settlement_control.json");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

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
    return rows[0]?.id ?? null;
  };
  const short = name.split(/\s+/).slice(0, 2).join(" ");
  return (await tryName(name)) || (await tryName(short)) || (await tryName(LOVES))!;
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
      fuel_purchases?: Array<{ load: string; invoice?: string }>;
    }>;
  };
  const ctrl = JSON.parse(readFileSync(CTRL_PATH, "utf8")) as {
    loads: Record<string, { truck?: string }>;
  };
  const docs = raw.company.filter((c) => {
    const n = Number(c.settlement_no);
    return n >= 5769 && n <= 5803;
  });
  const allLoads = [...new Set(docs.flatMap((d) => d.loads.map(String)))];
  console.log(`reset-at-expenses docs=${docs.length} loads=${allLoads.length} apply=${APPLY} seed_only=${SEED_ONLY}`);

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerExpenseRoutes(a);
    await registerVendorRoutes(a);
  });
  const auth = {
    "x-test-auth": Buffer.from(
      JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }),
      "utf8"
    ).toString("base64url"),
    "content-type": "application/json",
  };

  // 1) Stamp units + list expenses to void (short DB tx)
  const { loadIds, byLn } = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    for (const ln of allLoads) {
      const truck = ctrl.loads[ln]?.truck;
      if (!truck) continue;
      const u2 = (
        await c.query<{ id: string }>(
          `SELECT id::text FROM mdata.units
            WHERE unit_number=$1 AND deactivated_at IS NULL
            ORDER BY CASE WHEN currently_leased_to_company_id=$2::uuid THEN 0 ELSE 1 END
            LIMIT 1`,
          [truck, USMCA]
        )
      ).rows[0];
      if (!u2) continue;
      if (APPLY) {
        await c.query(
          `UPDATE mdata.loads SET assigned_unit_id=$2::uuid, updated_at=now()
            WHERE operating_company_id=$1::uuid AND load_number=$3 AND assigned_unit_id IS NULL`,
          [USMCA, u2.id, ln]
        );
      }
    }
    const loadRows = await c.query<{
      id: string;
      load_number: string;
      unit_id: string | null;
      driver_id: string | null;
    }>(
      `SELECT id::text, load_number, assigned_unit_id::text AS unit_id, assigned_primary_driver_id::text AS driver_id
         FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=ANY($2::text[])`,
      [USMCA, allLoads]
    );
    return {
      loadIds: loadRows.rows.map((r) => r.id),
      byLn: new Map(loadRows.rows.map((r) => [r.load_number, r])),
    };
  });

  const toVoid = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    return (
      await c.query<{ id: string }>(
        `SELECT id::text FROM accounting.expenses
          WHERE operating_company_id=$1::uuid AND voided_at IS NULL
            AND source_fuel_transaction_id IS NULL
            AND load_id = ANY($2::uuid[])`,
        [USMCA, loadIds]
      )
    ).rows;
  });
  console.log(`void candidates: ${toVoid.length}`);

  if (APPLY && !SEED_ONLY) {
    let n = 0;
    for (const e of toVoid) {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/expenses/${e.id}/void`,
        headers: auth,
        payload: {
          operating_company_id: USMCA,
          reason: "ACCT-F20260925 reset AT expenses to ground-truth exact (void-not-delete)",
        },
      });
      if (res.statusCode >= 300 && !res.body.includes("expense_already_void")) {
        console.error(`void FAIL ${e.id} ${res.statusCode} ${res.body.slice(0, 120)}`);
      } else {
        n++;
        if (n % 25 === 0) console.log(`  voided ${n}/${toVoid.length}`);
      }
    }
    console.log(`voided ${n}`);
  }

  // 2) Seed exact GT (each POST is its own tx)
  let seeded = 0;
  let skipped = 0;
  for (const doc of docs) {
    const d = String(doc.settlement_no);
    const fuels = doc.fuel_purchases ?? [];
    const invToLoad = new Map(fuels.filter((f) => f.invoice).map((f) => [String(f.invoice), String(f.load)]));
    let ei = 0;
    for (const e of doc.expenses ?? []) {
      ei += 1;
      const inv =
        (e.invoice && String(e.invoice).trim()) ||
        ([...(String(e.raw || "").matchAll(/\b(\d{6,})\b/g))].map((m) => m[1]!)[0] ?? "");
      const ln = e.load ? String(e.load) : invToLoad.get(inv) ?? String(doc.loads[0]);
      const lr = byLn.get(ln);
      if (!lr?.unit_id) {
        console.log(`SKIP ${d}#${ei} load=${ln} unit=${lr?.unit_id ?? "missing"}`);
        skipped++;
        continue;
      }
      const dedupe = `ATGTx${d}-${ei}-${cents(e.amount)}`.slice(0, 30);
      const already = await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        const r = await c.query(
          `SELECT 1 FROM accounting.expenses
            WHERE operating_company_id=$1::uuid AND vendor_document_number=$2 AND voided_at IS NULL LIMIT 1`,
          [USMCA, dedupe]
        );
        return r.rows.length > 0;
      });
      if (already) continue;
      if (!APPLY) {
        console.log(`DRY ${dedupe}`);
        continue;
      }
      const vendorId = await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        return resolveVendor(c as unknown as pg.PoolClient, e.vendor || LOVES);
      });
      const res = await app.inject({
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
          memo: `ATGTx settl ${d} #${ei} $${Number(e.amount).toFixed(2)} load ${ln} inv ${inv || "none"}`,
          vendor_document_number: dedupe,
          load_id: lr.id,
          unit_id: lr.unit_id,
          driver_id: lr.driver_id,
          is_company_expense: true,
          is_sample_data: false,
        },
      });
      if (res.statusCode >= 300 && !res.body.includes("duplicate")) {
        console.error(`SEED FAIL ${dedupe} ${res.statusCode} ${res.body.slice(0, 160)}`);
      } else {
        seeded++;
        if (seeded % 20 === 0) console.log(`  seeded ${seeded}`);
      }
    }
  }
  console.log(`DONE seeded=${seeded} skipped=${skipped}`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
