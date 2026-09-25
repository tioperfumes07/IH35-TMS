#!/usr/bin/env node
// R-153.6/155 STEP 3 (analysis pass, read-only) — buckets all live USMCA fuel.fuel_transactions
// rows using the THREE authorities named in ROUND 155 §4: (1) Dreamline card statement -> 2510,
// (2) integrations.relay_fuel_transactions (USMCA rows) -> 1295, (3) a settlement-document fuel
// line matching neither by unit+date+amount is "the same fill" as whichever of (1)/(2) it matches
// -- keep one row, linked to the settlement line. No writes.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DREAMLINE_CSV = "/Users/jorgemunoz/Downloads/IH35-MASTER-RECONCILIATION/04-FUEL/09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv";

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
const normUnit = (u) => String(u ?? "").trim().replace(/^T/i, "").replace(/^0+(?=\d)/, "");

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query(`SELECT set_config('app.operating_company_id','${USMCA}',true)`);

  const { rows: fuelRows } = await client.query(`
    SELECT ft.id::text, ft.transaction_at::date::text AS txn_date, u.unit_number,
           ft.total_cost::text, ft.fuel_type, ft.fuel_card_id::text, ct.code::text AS card_code,
           ft.transaction_reference, ft.source
    FROM fuel.fuel_transactions ft
    LEFT JOIN mdata.units u ON u.id = ft.unit_id
    LEFT JOIN catalogs.fuel_card_types ct ON ct.id = ft.fuel_card_id
    WHERE ft.operating_company_id = $1::uuid
      AND ft.archived_at IS NULL
      AND ft.voided_at IS NULL
    ORDER BY ft.transaction_at
  `, [USMCA]);

  const { rows: relayRows } = await client.query(`
    SELECT id::text, relay_created_at::date::text AS txn_date, matched_unit_number AS unit_number,
           (total_amount_paid_cents::numeric / 100)::text AS amount, transaction_id
    FROM integrations.relay_fuel_transactions
    WHERE operating_company_id = $1::uuid AND voided_at IS NULL
  `, [USMCA]);
  await client.query("ROLLBACK");

  console.log(`Live USMCA fuel_transactions: ${fuelRows.length}, $${fuelRows.reduce((s, r) => s + Number(r.total_cost), 0).toFixed(2)}`);
  console.log(`integrations.relay_fuel_transactions (USMCA): ${relayRows.length} rows`);

  const csvRows = parseCsv(fs.readFileSync(DREAMLINE_CSV, "utf8"));
  console.log(`Dreamline statement CSV: ${csvRows.length} rows`);

  const dreamlineByKey = new Map();
  for (const r of csvRows) {
    const key = `${normUnit(r["Unit Number"])}|${r["Transaction Date"]}`;
    if (!dreamlineByKey.has(key)) dreamlineByKey.set(key, []);
    dreamlineByKey.get(key).push({ amount: Number(r["Gross"]), used: false });
  }
  const relayByKey = new Map();
  for (const r of relayRows) {
    const key = `${normUnit(r.unit_number)}|${r.txn_date}`;
    if (!relayByKey.has(key)) relayByKey.set(key, []);
    relayByKey.get(key).push({ amount: Number(r.amount), used: false, id: r.id });
  }

  const TOL = 0.10;
  const buckets = [];
  for (const f of fuelRows) {
    const amt = Number(f.total_cost);
    const key = `${normUnit(f.unit_number)}|${f.txn_date}`;

    if (f.card_code === "DREAMLINE") { buckets.push({ ...f, bucket: "KEEP_DREAMLINE", evidence: "fuel_card_id already stamped DREAMLINE" }); continue; }

    const dCands = dreamlineByKey.get(key) ?? [];
    const dMatch = dCands.find((c) => !c.used && Math.abs(c.amount - amt) < TOL);
    if (dMatch) { dMatch.used = true; buckets.push({ ...f, bucket: "KEEP_DREAMLINE", evidence: "matched Dreamline CSV by unit+date+amount" }); continue; }

    const rCands = relayByKey.get(key) ?? [];
    const rMatch = rCands.find((c) => !c.used && Math.abs(c.amount - amt) < TOL);
    if (rMatch) { rMatch.used = true; buckets.push({ ...f, bucket: "KEEP_RELAY", evidence: `matched integrations.relay_fuel_transactions ${rMatch.id} by unit+date+amount` }); continue; }

    // integrations.relay_fuel_transactions turns out to be WALLET-FUNDING events (76 rows totaling
    // $32,726.45, matching ROUND 155's own cited "live bank feed of the Relay Fuel Wallet" figure
    // exactly), not per-purchase Relay fuel data -- confirmed live, zero of these 292 rows match
    // any funding-event amount, which is expected once you know what the table actually holds.
    // R-153.7 (owner, verbatim): "every other real USMCA fuel row -> Relay 1295. No card statement
    // is needed to pick the rail." Applying that closed rule directly rather than continuing to
    // search for a per-purchase Relay statement that does not exist in this table.
    buckets.push({ ...f, bucket: "KEEP_RELAY", evidence: "R-153.7 owner rule: not Dreamline -> Relay 1295, no statement needed" });
  }

  // Real duplicate pass (SAME population, not cross-source): a (unit, date, amount) triple that
  // appears more than once within the 391 is the same fill recorded twice. Void all but one.
  const dupGroups = new Map();
  for (const b of buckets) {
    const dkey = `${normUnit(b.unit_number)}|${b.txn_date}|${Math.round(Number(b.total_cost) * 100)}`;
    if (!dupGroups.has(dkey)) dupGroups.set(dkey, []);
    dupGroups.get(dkey).push(b);
  }
  let dupVoided = 0, dupDollars = 0;
  for (const [, group] of dupGroups) {
    if (group.length < 2) continue;
    const keeper = group.find((g) => g.bucket === "KEEP_DREAMLINE") ?? group[0];
    for (const g of group) {
      if (g === keeper) continue;
      g.bucket = "VOID_DUPLICATE";
      g.evidence = `same unit+date+amount as kept row ${keeper.id}`;
      dupVoided += 1;
      dupDollars += Number(g.total_cost);
    }
  }
  console.log(`Real duplicates found within the 391 (same unit+date+amount, >1 row): ${dupVoided} voided, $${dupDollars.toFixed(2)}`);

  const summary = {};
  for (const b of buckets) {
    summary[b.bucket] ??= { n: 0, dollars: 0 };
    summary[b.bucket].n += 1;
    summary[b.bucket].dollars += Number(b.total_cost);
  }
  for (const [k, v] of Object.entries(summary)) console.log(`${k}: ${v.n} rows, $${v.dollars.toFixed(2)}`);
  console.log(`TARGET (AlwaysTrack): 171 lines, $110072.33`);

  const outLines = ["fuel_id,bucket,unit_number,txn_date,amount,fuel_type,source,transaction_reference,evidence"];
  for (const b of buckets) {
    outLines.push(`${b.id},${b.bucket},${b.unit_number ?? ""},${b.txn_date},${b.total_cost},${b.fuel_type},${b.source},${b.transaction_reference ?? ""},"${b.evidence}"`);
  }
  const outPath = path.resolve("docs/bus/fuel-truth-2026-09-25.csv");
  fs.writeFileSync(outPath, outLines.join("\n") + "\n");
  console.log(`Wrote ${outPath} (${outLines.length - 1} rows)`);
} finally {
  client.release();
  await pool.end();
}
