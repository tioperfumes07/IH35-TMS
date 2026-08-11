/**
 * P38 (38 OF 50) — Accounting bills Wave-A linkage: prove the CANONICAL create path stamps
 * unit_id · vendor · load FK, and leave one real USMCA bill behind with those FKs NOT NULL.
 *
 * "Built" for this column is a write-path proof, not a row insert: the row is created through
 * createBill() — the same function the UI calls — so what is proven is the PATH. A row hand-inserted
 * with SQL would satisfy a Neon query and prove nothing about what the product does, which is the
 * whole failure mode the Built definition exists to prevent.
 *
 * FK SURFACE (verified against prod schema before writing this):
 *   accounting.bills.unit_id           uuid  — header, from CreateBillInput.unitId
 *   accounting.bills.mdata_vendor_id   uuid  — header, resolved from vendorId
 *   accounting.bill_lines.load_id      uuid  — LINE level, from CreateBillLineInput.loadId
 * There is NO bills.load_id column: the bill→load link is per LINE, because one bill can cover
 * several loads. Asserting a header load FK would be asserting a column that does not exist.
 *
 * ENTITY NOTE: mdata.units is NOT scoped by operating_company_id — it carries owner_company_id and
 * currently_leased_to_company_id (TRK owns the iron, USMCA leases it). USMCA has 0 owned and 40
 * leased units, so the smoke unit is selected by currently_leased_to_company_id. Selecting by
 * operating_company_id would have returned nothing and looked like "no units exist".
 *
 * The bill carries an explicit greppable memo marker so it can never rot into untagged test money the
 * way the 32 fake A/P bills did — the same discipline the owner accepted for the F-19 row.
 *
 * Usage: npx tsx scripts/run-p38-usmca-bill-fk-smoke-once.mts [--commit]
 */
import pg from "pg";
import { createBill } from "../apps/backend/src/accounting/bills.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const MARKER = "P38 WAVE-A FK SMOKE — owner-authorized 2026-08-11, unit+vendor+load FK proof";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);

  const pick = await client.query<{ unit_id: string; unit_label: string; vendor_id: string; vendor_name: string; load_id: string; load_number: string; account_id: string }>(
    `SELECT
       (SELECT id::text FROM mdata.units WHERE currently_leased_to_company_id=$1::uuid ORDER BY unit_number LIMIT 1) AS unit_id,
       (SELECT COALESCE(unit_number,'') FROM mdata.units WHERE currently_leased_to_company_id=$1::uuid ORDER BY unit_number LIMIT 1) AS unit_label,
       (SELECT id::text FROM mdata.vendors WHERE operating_company_id=$1::uuid ORDER BY created_at LIMIT 1) AS vendor_id,
       (SELECT vendor_name FROM mdata.vendors WHERE operating_company_id=$1::uuid ORDER BY created_at LIMIT 1) AS vendor_name,
       (SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid ORDER BY created_at DESC LIMIT 1) AS load_id,
       (SELECT COALESCE(load_number,'') FROM mdata.loads WHERE operating_company_id=$1::uuid ORDER BY created_at DESC LIMIT 1) AS load_number,
       (SELECT id::text FROM catalogs.accounts WHERE operating_company_id=$1::uuid AND account_number='5300' AND is_postable AND deactivated_at IS NULL LIMIT 1) AS account_id`,
    [USMCA]
  );
  const t = pick.rows[0];
  for (const [k, v] of Object.entries(t)) {
    if (!v) throw new Error(`no FK target resolved for ${k} — refusing to create a bill with a NULL linkage (that is the defect, not the fix)`);
  }
  console.log(`[P38] targets · unit=${t.unit_label} vendor=${t.vendor_name} load=${t.load_number}`);

  if (!COMMIT) {
    console.log("[P38] DRY RUN — targets resolved, no bill created. Re-run with --commit.");
    process.exit(0);
  }

  const bill = await createBill(
    {
      operatingCompanyId: USMCA,
      vendorId: t.vendor_id,
      billNumber: `P38-FK-SMOKE-${Date.now()}`,
      billDate: "2026-08-11",
      amountCents: 12345,
      memo: MARKER,
      unitId: t.unit_id,
      lines: [
        {
          accountId: t.account_id,
          amountCents: 12345,
          description: "P38 Wave-A FK smoke line",
          loadId: t.load_id,
        },
      ],
    },
    ACTOR_USER_ID
  );

  const billId = (bill as { id?: string })?.id;
  if (!billId) throw new Error("createBill returned no id");

  // Read the FKs back from the DATABASE, never from the function's return value.
  const check = await client.query<{ unit_id: string | null; mdata_vendor_id: string | null; line_load_id: string | null; lines: string }>(
    `SELECT b.unit_id::text, b.mdata_vendor_id::text,
            (SELECT bl.load_id::text FROM accounting.bill_lines bl WHERE bl.bill_id=b.id LIMIT 1) AS line_load_id,
            (SELECT count(*)::text FROM accounting.bill_lines bl WHERE bl.bill_id=b.id) AS lines
       FROM accounting.bills b WHERE b.id=$1::uuid AND b.operating_company_id=$2::uuid`,
    [billId, USMCA]
  );
  const r = check.rows[0];
  if (!r) throw new Error("bill not readable back under USMCA scope");
  console.log(`[P38] bill=${billId}`);
  console.log(`[P38] unit_id=${r.unit_id} · mdata_vendor_id=${r.mdata_vendor_id} · line.load_id=${r.line_load_id} · lines=${r.lines}`);

  const missing = [];
  if (!r.unit_id) missing.push("bills.unit_id");
  if (!r.mdata_vendor_id) missing.push("bills.mdata_vendor_id");
  if (!r.line_load_id) missing.push("bill_lines.load_id");
  if (missing.length) throw new Error(`WRITE PATH DOES NOT STAMP: ${missing.join(", ")} — P38 is NOT built`);

  console.log("[P38] BUILT — canonical create path stamps unit + vendor + load FKs, all NOT NULL.");
} catch (err) {
  console.error(`[P38] FAILED: ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
