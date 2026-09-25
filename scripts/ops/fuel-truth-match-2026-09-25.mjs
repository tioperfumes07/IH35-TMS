#!/usr/bin/env node
// R-153.6 STEP 1 — read-only truth-set matcher. Matches USMCA fuel.fuel_transactions rows with
// no stamped fuel_card_id against the Dreamline statement CSV by (unit_number, date, amount).
// Writes docs/bus/fuel-truth-2026-09-25.csv. No writes to any table.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CSV_PATH = "/Users/jorgemunoz/Downloads/IH35-MASTER-RECONCILIATION/04-FUEL/09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv";

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((h, i) => (row[h.trim()] = (cells[i] ?? "").trim()));
    return row;
  });
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query(`SELECT set_config('app.operating_company_id','${USMCA}',true)`);

  const { rows: fuelRows } = await client.query(`
    SELECT ft.id::text, ft.transaction_at::date::text AS txn_date, u.unit_number,
           ft.total_cost::text, ft.fuel_type, ft.gallons::text, ft.fuel_card_id::text,
           ft.source, ft.notes
    FROM fuel.fuel_transactions ft
    LEFT JOIN mdata.units u ON u.id = ft.unit_id
    WHERE ft.operating_company_id = $1::uuid
      AND ft.archived_at IS NULL
      AND ft.voided_at IS NULL
    ORDER BY ft.transaction_at
  `, [USMCA]);
  await client.query("ROLLBACK");

  console.log(`Live USMCA fuel_transactions (non-archived, non-voided): ${fuelRows.length} rows, $${(
    fuelRows.reduce((s, r) => s + Number(r.total_cost), 0)
  ).toFixed(2)}`);

  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const csvRows = parseCsv(csvText);
  console.log(`Dreamline statement CSV: ${csvRows.length} rows`);

  // DB unit_number is "T156"/"T152" (T-prefixed); the CSV's Unit Number column is bare digits
  // ("156","152"). Normalize both to the bare digit form before keying.
  const normUnit = (u) => String(u ?? "").trim().replace(/^T/i, "").replace(/^0+(?=\d)/, "");

  // Index CSV rows by (unit, date) -> list of {amount, used}
  const csvByKey = new Map();
  for (const r of csvRows) {
    const key = `${normUnit(r["Unit Number"])}|${r["Transaction Date"]}`;
    if (!csvByKey.has(key)) csvByKey.set(key, []);
    // total_cost in the DB matches the CSV's GROSS column (pre-discount), not the discounted
    // Amount column -- calibrated against a known match: unit 163, 2026-08-07, DB total_cost
    // 1093.72 vs CSV Gross 1093.75 (Amount there is 937.39, a $156 gap -- wrong column).
    csvByKey.get(key).push({ amount: Number(r["Gross"]), used: false, raw: r });
  }

  const buckets = { dreamline_matched: [], already_dreamline: [], no_card_no_csv_match: [], other_card: [] };

  for (const f of fuelRows) {
    if (f.fuel_card_id) {
      buckets.already_dreamline.push(f);
      continue;
    }
    const key = `${normUnit(f.unit_number)}|${f.txn_date}`;
    const candidates = csvByKey.get(key) ?? [];
    const amt = Number(f.total_cost);
    let matched = null;
    for (const c of candidates) {
      if (c.used) continue;
      if (Math.abs(c.amount - amt) < 0.10) { matched = c; break; }
    }
    if (matched) {
      matched.used = true;
      buckets.dreamline_matched.push({ ...f, csv_row: matched.raw });
    } else {
      buckets.no_card_no_csv_match.push(f);
    }
  }

  console.log(`Already stamped (DREAMLINE): ${buckets.already_dreamline.length}`);
  console.log(`Matched to Dreamline CSV by (unit,date,amount): ${buckets.dreamline_matched.length}, $${
    buckets.dreamline_matched.reduce((s, r) => s + Number(r.total_cost), 0).toFixed(2)
  }`);
  console.log(`No card + no CSV match (residual, needs disclosure): ${buckets.no_card_no_csv_match.length}, $${
    buckets.no_card_no_csv_match.reduce((s, r) => s + Number(r.total_cost), 0).toFixed(2)
  }`);

  const outLines = ["fuel_id,bucket,unit_number,txn_date,amount,fuel_type,source,evidence"];
  for (const f of buckets.already_dreamline) {
    outLines.push(`${f.id},dreamline_already_stamped,${f.unit_number ?? ""},${f.txn_date},${f.total_cost},${f.fuel_type},${f.source},fuel_card_id already stamped DREAMLINE`);
  }
  for (const f of buckets.dreamline_matched) {
    outLines.push(`${f.id},dreamline_csv_matched,${f.unit_number ?? ""},${f.txn_date},${f.total_cost},${f.fuel_type},${f.source},"matched ${CSV_PATH} by unit+date+amount"`);
  }
  for (const f of buckets.no_card_no_csv_match) {
    outLines.push(`${f.id},UNRESOLVED,${f.unit_number ?? ""},${f.txn_date},${f.total_cost},${f.fuel_type},${f.source},"no fuel_card_id stamp and no Dreamline CSV row matched by unit+date+amount"`);
  }
  const outPath = path.resolve("docs/bus/fuel-truth-2026-09-25.csv");
  fs.writeFileSync(outPath, outLines.join("\n") + "\n");
  console.log(`Wrote ${outPath} (${outLines.length - 1} rows)`);
} finally {
  client.release();
  await pool.end();
}
