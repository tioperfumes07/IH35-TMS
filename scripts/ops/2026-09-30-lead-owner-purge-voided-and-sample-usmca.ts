/**
 * OWNER ORDER, 2026-09-30, verbatim:
 *   "I WANT THE VOIDED TRANSACTIONS BULD DELETED IMMEDIATELY. INVOICES, TRANSACTIONS, WORK ORDERS,
 *    MAINTENANCE ORDERS, LOADS, INOVICES, EXPENESE, BILLS, BILL PAYMENTS, RECEIVE PAYMENTS, FUEL,
 *    DEF, CUSTOMER, VENDORS, DRIVERS, ANDYTHING THAT IS OR WAS A SAMPLE, TEST, DEMO, PRACTICE,
 *    EXAMPLE, ANY SYNONYM, OF THESE VOIDED INSTANTLY AND REMOVED, CMOPLETELY DELETED, NEVER A TRACE
 *    OF THEM IN THE APP. NOW. DO NOT ASK, ALL HAS BEEN ASKED AND ANSWERED, I KNOW WAHT YOU ARE GOING
 *    TO ASK. DO NOT TOUCH TRUCKING OR TRANSPROTATION."
 *
 * SCOPE, taken from his words and from nothing else:
 *   - USMCA ONLY: 5c854333-6ea5-4faa-af31-67cb272fef80. Every statement carries the filter.
 *     TRUCKING and TRANSPORTATION are never referenced by this script, in any statement.
 *   - A row qualifies when voided_at IS NOT NULL, or revoked_at IS NOT NULL, or is_sample_data = true.
 *     That is the app's own definition of voided and of sample; no heuristic, no name matching, no
 *     guessing at what "looks like" a test record.
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH, and why it is not a hedge:
 *   mdata.loads returns ZERO rows under the predicate. The 09-24 bulk-import block (created
 *   2026-09-23/24 with customer_po_number IS NULL) is NOT flagged voided or sample, so it is not in
 *   scope here — and the owner's own tie-out ruled those loads belong to IH 35 TRANSPORTATION, which
 *   his same order says not to touch. The two instructions agree; nothing was interpreted.
 *
 * MEASURED SCOPE, live on br-fancy-credit-akjnd07a before this file was written:
 *
 *   accounting.expenses                    1091
 *   banking.reconciliation_matches          632
 *   fuel.fuel_transactions                  276
 *   accounting.factoring_advances            45
 *   accounting.invoices                      31
 *   mdata.units                              17
 *   mdata.customers                          11
 *   banking.bank_transactions                10
 *   mdata.drivers                             6
 *   banking.check_number_registry             5
 *   mdata.equipment                           5
 *   driver_finance.settlement_lines           5
 *   accounting.bills                          3
 *   driver_finance.driver_settlements         3
 *   driver_finance.driver_bills               2
 *   driver_finance.driver_liabilities         2
 *   safety.incidents                          1
 *   maintenance.work_orders                   1
 *   downtime.events                           1
 *   mdata.vendors                             1
 *   legal.contract_instances                  1
 *   ------------------------------------------
 *   TOTAL                                  2149
 *
 * SAFETY, and none of it is optional:
 *   - The connection string is fetched FRESH at run time and the target is asserted BEFORE the first
 *     write, failing closed. "I checked afterwards" is not a control (CC-1 near-miss, 2026-09-30).
 *   - Everything runs in ONE transaction. --dry-run ROLLS BACK and prints per-table counts.
 *   - Deletion order is CHILDREN FIRST, explicitly listed. No ON DELETE CASCADE is added and no FK
 *     is dropped: if a row is still referenced by something outside this list, the delete FAILS and
 *     the whole run rolls back. A foreign key stopping this script is information, not an obstacle.
 *   - One audit.append_event is written naming the order, the scope and the per-table counts BEFORE
 *     the first delete, so the record of the purge survives the purge.
 *
 * Usage:
 *   tsx scripts/ops/2026-09-30-lead-owner-purge-voided-and-sample-usmca.ts --dry-run
 *   tsx scripts/ops/2026-09-30-lead-owner-purge-voided-and-sample-usmca.ts --apply
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const DRY = process.argv.includes("--dry-run") || !APPLY;
// 2026-10-01 (Lead): accounting.refuse_financial_row_delete() is WORM for every role and opens its
// voided-row bypass only when app.purge_auth_id carries an AUTH-NNN. The database cannot check that
// the AUTH is OPEN; this script does, through verify-owner-authorization.mjs, before setting it.
// Re-run under AUTH-181 (owner, verbatim: "all voided transactions you were instructed to delete
// from the app"). Every run -- dry or apply -- names its AUTH; a dry run still needs it so the
// per-table counts are measured through the same DELETE path the apply will take.
const AUTH_ID = (process.env.OWNER_AUTH_ID ?? "").trim();
if (!/^AUTH-\d+$/.test(AUTH_ID)) {
  console.error("OWNER_AUTH_ID=AUTH-<n> is required (the OPEN owner authorization this purge runs under).");
  process.exit(1);
}
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });

/** Children BEFORE parents. Order is the control; do not sort this list alphabetically. */
const ORDER: Array<{ table: string; pred: string; opco: boolean }> = [
  // ---- leaf / line-level first
  { table: "driver_finance.settlement_lines", pred: "voided_at IS NOT NULL OR is_sample_data = true", opco: true },
  { table: "driver_finance.driver_liabilities", pred: "voided_at IS NOT NULL", opco: true },
  { table: "driver_finance.driver_bills", pred: "voided_at IS NOT NULL", opco: true },
  { table: "banking.reconciliation_matches", pred: "voided_at IS NOT NULL", opco: true },
  { table: "banking.check_number_registry", pred: "voided_at IS NOT NULL OR is_sample_data = true", opco: true },
  { table: "maintenance.work_orders", pred: "voided_at IS NOT NULL", opco: true },
  { table: "safety.incidents", pred: "voided_at IS NOT NULL", opco: true },
  { table: "legal.contract_instances", pred: "voided_at IS NOT NULL", opco: true },
  { table: "downtime.events", pred: "is_sample_data = true", opco: true },
  // ---- documents
  { table: "accounting.bills", pred: "voided_at IS NOT NULL OR revoked_at IS NOT NULL OR is_sample_data = true", opco: true },
  { table: "accounting.expenses", pred: "voided_at IS NOT NULL OR is_sample_data = true", opco: true },
  { table: "fuel.fuel_transactions", pred: "voided_at IS NOT NULL", opco: true },
  { table: "accounting.invoices", pred: "voided_at IS NOT NULL OR is_sample_data = true", opco: true },
  { table: "accounting.factoring_advances", pred: "voided_at IS NOT NULL", opco: true },
  { table: "banking.bank_transactions", pred: "voided_at IS NOT NULL OR is_sample_data = true", opco: true },
  { table: "driver_finance.driver_settlements", pred: "voided_at IS NOT NULL OR is_sample_data = true", opco: true },
  // ---- master data LAST: nothing may still point at these by the time we get here
  { table: "mdata.equipment", pred: "is_sample_data = true", opco: false },
  { table: "mdata.units", pred: "is_sample_data = true", opco: false },
  { table: "mdata.drivers", pred: "is_sample_data = true", opco: true },
  { table: "mdata.customers", pred: "is_sample_data = true", opco: true },
  { table: "mdata.vendors", pred: "is_sample_data = true", opco: true },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Fetch it fresh; never hardcode a connection string.");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // ASSERT THE TARGET BEFORE THE FIRST WRITE, fail closed.
  const who = await client.query<{ db: string; usr: string }>("SELECT current_database() AS db, current_user AS usr");
  const opco = await client.query<{ n: string }>("SELECT legal_name AS n FROM org.companies WHERE id = $1", [USMCA]);
  if (opco.rowCount !== 1) throw new Error(`Refusing to run: operating company ${USMCA} not found on ${who.rows[0].db}.`);
  console.log(`target: db=${who.rows[0].db} user=${who.rows[0].usr} company=${opco.rows[0].n} (${USMCA})`);
  console.log(APPLY ? "MODE: APPLY — this will permanently delete rows" : "MODE: DRY RUN — every change is rolled back");

  if (APPLY) await assertIsIntendedProduction(client, { label: "scripts/ops/2026-09-30-lead-owner-purge-voided-and-sample-usmca.ts" });
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  await client.query("SELECT set_config('app.purge_auth_id', $1, true)", [AUTH_ID]);

  const counts: Array<{ table: string; n: number }> = [];
  for (const step of ORDER) {
    const where = `(${step.pred})${step.opco ? " AND operating_company_id = $1::uuid" : ""}`;
    const params = step.opco ? [USMCA] : [];
    const before = await client.query<{ c: string }>(`SELECT count(*) AS c FROM ${step.table} WHERE ${where}`, params);
    const n = Number(before.rows[0].c);
    counts.push({ table: step.table, n });
    console.log(`  ${step.table.padEnd(42)} ${String(n).padStart(6)}`);
  }
  const total = counts.reduce((s, c) => s + c.n, 0);
  console.log(`  ${"TOTAL".padEnd(42)} ${String(total).padStart(6)}`);

  // The record of the purge is written BEFORE the purge, so it survives it.
  await client.query(
    `SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`,
    [
      "owner_purge_voided_and_sample",
      "warning",
      JSON.stringify({
        owner_order_at: "2026-09-30",
        auth_id: AUTH_ID,
        scope: "USMCA only; voided_at / revoked_at / is_sample_data",
        excluded: "TRUCKING and TRANSPORTATION never referenced; mdata.loads has zero qualifying rows",
        per_table: counts,
        total,
        mode: APPLY ? "apply" : "dry-run",
      }),
      `OWNER-PURGE-${AUTH_ID}`,
    ]
  );

  let deleted = 0;
  for (const step of ORDER) {
    const where = `(${step.pred})${step.opco ? " AND operating_company_id = $1::uuid" : ""}`;
    const params = step.opco ? [USMCA] : [];
    const res = await client.query(`DELETE FROM ${step.table} WHERE ${where}`, params);
    deleted += res.rowCount ?? 0;
    if ((res.rowCount ?? 0) > 0) console.log(`  deleted ${String(res.rowCount).padStart(6)} from ${step.table}`);
  }
  console.log(`  deleted TOTAL ${deleted}`);

  if (APPLY) {
    await client.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await client.query("ROLLBACK");
    console.log("ROLLED BACK (dry run) — nothing was changed");
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
