#!/usr/bin/env npx tsx
// CC-3 queue item 11 — the owner's one-command Excel copy of the preservation ledger. One sheet per preserved table
// (natural keys only — no UUID column except the dead `pre_reset` reference), streamed so the 800k+ position rows never
// sit in memory; a table past Excel's row limit continues on "<table> (2)", "(3)"... Read-only.
// Three workbooks so each stays openable: <prefix>-positions.xlsx, <prefix>-hos.xlsx, <prefix>-telematics.xlsx (the other
// eight tables). Every preserved row is exported; the dead pre_reset UUID reference stays in the database only.
// Usage: DATABASE_URL=<prod> npx tsx scripts/ops/preserve-export-xlsx.mts [--out-dir dir] [--company USMCA]
import pg from "pg";
import ExcelJS from "exceljs";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const day = new Date().toISOString().slice(0, 10);
const outDir = arg("--out-dir") ?? ".";
const company = arg("--company");
// [table, primary key] — pages are read in primary-key order with keyset pagination (no cursor dependency).
const TABLES: Array<[string, string[]]> = [
  ["vehicle_positions", ["company_code", "unit_number", "captured_at", "observation_id"]],
  ["geofences", ["company_code", "fence_key"]],
  ["geofence_events", ["company_code", "unit_number", "fence_key", "event_kind", "occurred_at"]],
  ["unit_stop_events", ["company_code", "unit_number", "started_at"]],
  ["odometer_readings", ["company_code", "unit_number", "read_at", "source"]],
  ["load_odometer_segments", ["company_code", "load_number", "segment_kind", "started_at"]],
  ["samsara_addresses", ["company_code", "samsara_address_id"]],
  ["route_stop_progress", ["company_code", "load_number", "sequence_number"]],
  ["dvir_submissions", ["company_code", "unit_number", "submitted_at", "dvir_type"]],
  ["hos_snapshots", ["company_code", "driver_key", "polled_at", "payload_hash"]],
];
const MAX_ROWS = 1_000_000;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
const summary: Record<string, number> = {};
const files: string[] = [];
const DROP = new Set(["pre_reset"]);
const GROUPS: Array<[string, string[]]> = [
  ["positions", ["vehicle_positions"]],
  ["hos", ["hos_snapshots"]],
  ["telematics", TABLES.map(([t]) => t).filter((t) => t !== "vehicle_positions" && t !== "hos_snapshots")],
];
for (const [group, tables] of GROUPS) {
const file = `${outDir}/IH35-preserved-${company ?? "ALL"}-${group}-${day}.xlsx`;
files.push(file);
const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: file, useStyles: true });
const sheet = (name: string) => wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
for (const [table, pk] of TABLES.filter(([t]) => tables.includes(t))) {
  const cols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'preserve' AND table_name = $1 ORDER BY ordinal_position`, [table])).rows.map((r) => String(r.column_name)).filter((k) => !DROP.has(k));
  let part = 1, inSheet = 0, total = 0;
  let ws = sheet(table);
  const header = (s: ExcelJS.Worksheet) => { const h = s.addRow(cols); h.font = { bold: true }; h.commit(); };
  header(ws);
  let last: unknown[] | null = null;
  for (;;) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (company) { params.push(company); where.push(`company_code = $${params.length}`); }
    if (last) { const ph = last.map((v) => { params.push(v); return `$${params.length}`; }); where.push(`(${pk.join(", ")}) > (${ph.join(", ")})`); }
    const rows = (await c.query(`SELECT * FROM preserve.${table} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${pk.join(", ")} LIMIT 5000`, params)).rows;
    if (!rows.length) break;
    for (const r of rows) {
      if (inSheet >= MAX_ROWS) { ws.commit(); part++; inSheet = 0; ws = sheet(`${table} (${part})`); header(ws); }
      ws.addRow(cols.map((k) => { const v = r[k]; return v instanceof Date ? v.toISOString() : v !== null && typeof v === "object" ? JSON.stringify(v) : v; })).commit();
      inSheet++; total++;
    }
    const tail = rows[rows.length - 1];
    last = pk.map((k) => tail[k]);
  }
  ws.commit();
  summary[table] = total;
}
await wb.commit();
}
await c.query("ROLLBACK");
await c.end();
console.log(JSON.stringify({ files, company: company ?? "all", rows: summary }));
