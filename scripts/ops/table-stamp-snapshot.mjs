#!/usr/bin/env node
// ROUND 326 queue item 23 (CC-1) — THE TABLE-AND-STAMP SNAPSHOT, AS EXCEL. READ-ONLY.
//
// For every document and transaction table in the money / operations schemas: row count, and for each linkage stamp
// the table carries, how many rows have it populated and how many are null — operating company, load, driver, unit,
// trailer, customer, vendor, settlement, invoice, journal entry, item, account, class, void and sample flags. One
// sheet per domain with human headers, plus a "Null across the board" sheet: a stamp column that is null on every
// row of a non-empty table is an engine defect and goes back onto the queue.
//
// This is how the owner confirms the engines stamp correctly BEFORE feeding settlements by hand. It writes nothing
// to the database (SELECT only, inside a READ ONLY transaction) and discovers its own tables from the catalog.
//
// Usage: DATABASE_URL=<read-only url> node scripts/ops/table-stamp-snapshot.mjs [--out <file.xlsx>] [--company <uuid>]
import pg from "pg";
import ExcelJS from "exceljs";
import os from "node:os";
import path from "node:path";

const DOMAINS = [
  ["Accounting", "accounting"], ["Banking", "banking"], ["Driver finance", "driver_finance"], ["Dispatch", "dispatch"],
  ["Master data", "mdata"], ["Fuel", "fuel"], ["Maintenance", "maintenance"], ["Factoring", "factoring"],
  ["Expense attribution", "expense_attribution"],
];
// Stamp label -> column names that carry it (first present wins per table; all present are reported).
export const STAMPS = [
  ["Operating company", ["operating_company_id"]],
  ["Load", ["load_id", "source_load_id"]],
  ["Driver", ["driver_id", "driver_uuid", "assigned_primary_driver_id"]],
  ["Unit", ["unit_id", "assigned_unit_id"]],
  ["Trailer", ["trailer_id", "load_trailer_equipment_id"]],
  ["Customer", ["customer_id", "customer_uuid", "payee_customer_uuid"]],
  ["Vendor", ["vendor_id", "vendor_uuid", "mdata_vendor_id"]],
  ["Settlement", ["settlement_id", "settled_in_settlement_id", "driver_settlement_id"]],
  ["Invoice", ["invoice_id"]],
  ["Journal entry", ["journal_entry_id", "journal_entry_uuid"]],
  ["Item", ["item_id"]],
  ["Account", ["account_id", "posting_account_id", "expense_account_uuid", "payment_account_uuid", "coa_account_id"]],
  ["Class", ["class_id"]],
  ["Voided", ["voided_at"]],
  ["Sample flag", ["is_sample_data"]],
];
const STAMP_COLUMNS = new Set(STAMPS.flatMap(([, cols]) => cols));
// Lookup / config tables are not documents or transactions.
const SKIP_TABLE = /(^|_)(types?|statuses|settings|config|flags?|roles?|catalog|lookup|map|mapping|rules?|templates?|sequences?|seq_.*|audit|log|history|outbox|queue|locks?|cache|snapshots?)$/;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("table-stamp-snapshot: DATABASE_URL (read-only) is required"); process.exit(2); }
  const out = arg("--out") ?? path.join(os.homedir(), "Desktop", `TABLE-AND-STAMP-SNAPSHOT-${new Date().toISOString().slice(0, 10)}.xlsx`);
  const company = arg("--company");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  if (company) await client.query("SELECT set_config('app.operating_company_id', $1, true)", [company]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "IH35 TMS — table-and-stamp snapshot (read-only)";
  const nullAcross = [];
  for (const [label, schema] of DOMAINS) {
    const cols = (await client.query(
      `SELECT c.table_name, array_agg(c.column_name::text ORDER BY c.ordinal_position) AS cols
         FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = $1
        GROUP BY c.table_name ORDER BY c.table_name`,
      [schema]
    )).rows;
    const sheet = wb.addWorksheet(label.slice(0, 31));
    const header = ["Table", "Rows", ...STAMPS.map(([l]) => l)];
    sheet.addRow(header).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
    for (const { table_name, cols: tableCols } of cols) {
      if (SKIP_TABLE.test(table_name)) continue;
      const present = STAMPS.map(([l, names]) => [l, names.filter((n) => tableCols.includes(n))]);
      if (!present.some(([, n]) => n.length) || !tableCols.some((c) => STAMP_COLUMNS.has(c))) continue;
      const exprs = present.flatMap(([, names]) => names.map((n) => `count(${JSON.stringify(n)})::bigint AS ${JSON.stringify(`nn_${n}`)}`));
      const companyFilter = company && tableCols.includes("operating_company_id") ? ` WHERE operating_company_id = '${company.replace(/[^0-9a-f-]/gi, "")}'::uuid` : "";
      let r;
      try {
        r = (await client.query(`SELECT count(*)::bigint AS n${exprs.length ? ", " + exprs.join(", ") : ""} FROM ${schema}.${JSON.stringify(table_name)}${companyFilter}`)).rows[0];
      } catch (e) {
        sheet.addRow([table_name, `unreadable: ${e.message.slice(0, 80)}`]);
        continue;
      }
      const rows = Number(r.n);
      const cells = present.map(([l, names]) => {
        if (!names.length) return "—";
        return names.map((n) => {
          const nn = Number(r[`nn_${n}`]);
          if (rows > 0 && nn === 0 && !["voided_at"].includes(n)) nullAcross.push([label, table_name, l, n, rows]);
          return `${n}: ${nn} set / ${rows - nn} null`;
        }).join("\n");
      });
      const row = sheet.addRow([table_name, rows, ...cells]);
      row.alignment = { wrapText: true, vertical: "top" };
    }
    sheet.columns.forEach((c, i) => { c.width = i === 0 ? 38 : i === 1 ? 10 : 26; });
  }
  const na = wb.addWorksheet("Null across the board");
  na.addRow(["Domain", "Table", "Stamp", "Column", "Rows (all null)"]).font = { bold: true };
  for (const r of nullAcross) na.addRow(r);
  na.columns.forEach((c, i) => { c.width = [20, 38, 20, 28, 16][i]; });
  await client.query("ROLLBACK");
  await client.end();
  await wb.xlsx.writeFile(out);
  console.log(`table-stamp-snapshot: wrote ${out} — ${DOMAINS.length} domain sheets, ${nullAcross.length} stamp column(s) null across a non-empty table`);
}

if (process.argv[1] && process.argv[1].endsWith("table-stamp-snapshot.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
