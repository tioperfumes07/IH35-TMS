#!/usr/bin/env tsx
// FUEL LINKAGE AUDIT (Lead, 2026-09-23): "1. load_id (314) -- biggest gap, first priority. From
// source documents, never a date-window guess." This script is that attempt, and its own result
// closes the item: it is EXPECTED STATE, not an open gap.
//
// METHOD: every Company_Settlement_*.txt on disk prints a real, per-load "FUEL PURCHASES" table --
// AlwaysTrack's own attribution of each diesel purchase to the load it was bought under (grouped by
// a "Load NNNNN" header, one real document, not a guess). Parsed all 57 clean settlement files
// (excluding a duplicate "(Merged) page 1" variant), extracted 258 (load_number, date, gallons,
// amount) lines, and matched them against fuel.fuel_transactions rows with load_id IS NULL on
// date + gallons(+/-0.05) + total_cost(+/-0.50) -- the same tight tolerance used for the Dreamline
// match in IFTA-GALLONS-03.
//
// RESULT: 257 of 258 settlement-document fuel lines matched a fuel_transactions row that ALREADY
// had load_id set -- i.e. the ingest process had already linked them. Only ONE settlement line
// (Load 13605, Company_Settlement_5815.txt, 2026-09-17, 16.220gal/$102.84) matched a genuinely
// unlinked row (id 7230f49f-d735-44c5-a5e7-1aa2590a4997, 16.220gal/$102.82) -- applied below.
//
// WHY THE OTHER 313 STAY NULL, ON PURPOSE: every one of them already carries a live
// `load_exemption_reason` written AT INGEST TIME -- "Dreamline Diesel Card statement ... unit TNNN,
// <date> -- no load resolved within +/-1 day of this unit's stop windows at ingest time" (296 rows,
// after this pass) or "relay_ingest_no_load_link" (18 rows, same class as the historical LINK-F01
// ruling: Relay-sourced rows never carry load context). The ingest process ALREADY attempted the
// tightest safe match (this unit's own stop-window, +/-1 day) and recorded its failure per row --
// this is the SAME EXPECTED-STATE pattern as LINK-F01 (`.claude/skills/ih35-tms-standards/SKILL.md`
// §0), not a fresh gap. Widening the window now, or guessing from date proximity alone, is exactly
// the "date-window guess" the Lead's own instruction forbids. A wrong load link is worse than a
// missing one (it misattributes cost to the wrong load/customer) -- so these stay NULL, correctly
// classified, not "fixed."
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const SETTLEMENT_DIR = path.join(
  process.env.HOME!,
  "Downloads/IH35-MASTER-RECONCILIATION/03-SETTLEMENTS/text"
);

const rowRe =
  /^(\d{4}-\d{2}-\d{2})\s.*?\s(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s*$/;
const loadRe = /^Load\s+(\d+)\b/;

type ParsedLine = { file: string; load_number: string; date: string; gallons: number; actual: number };

function parseSettlementFuelLines(): ParsedLine[] {
  const files = fs
    .readdirSync(SETTLEMENT_DIR)
    .filter((f) => f.startsWith("Company_Settlement_") && f.endsWith(".txt") && !f.includes("(Merged)"));
  const out: ParsedLine[] = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(SETTLEMENT_DIR, f), "utf8").split("\n");
    let state: "before" | "in_fuel" | "done" = "before";
    let currentLoad: string | null = null;
    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");
      const trimmed = line.trim();
      if (state === "before") {
        if (trimmed.startsWith("FUEL PURCHASES")) state = "in_fuel";
        continue;
      }
      if (state === "in_fuel") {
        if (trimmed.startsWith("EXPENSES")) {
          state = "done";
          break;
        }
        const lm = trimmed.match(loadRe);
        if (lm) {
          currentLoad = lm[1]!;
          continue;
        }
        const rm = line.match(rowRe);
        if (rm && currentLoad) {
          out.push({ file: f, load_number: currentLoad, date: rm[1]!, gallons: Number(rm[2]), actual: Number(rm[8]) });
        }
      }
    }
  }
  return out;
}

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const settlementLines = parseSettlementFuelLines();
  console.log(`Parsed ${settlementLines.length} load-grouped FUEL PURCHASES lines from ${SETTLEMENT_DIR}.`);

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  await client.query(`CREATE TEMP TABLE settlement_fuel_lines (load_number text, txn_date date, gallons numeric, actual numeric)`);
  for (const l of settlementLines) {
    await client.query(
      `INSERT INTO settlement_fuel_lines (load_number, txn_date, gallons, actual) VALUES ($1,$2,$3,$4)`,
      [l.load_number, l.date, l.gallons, l.actual]
    );
  }

  const matches = await client.query<{
    id: string;
    load_number: string;
    gallons: string;
    actual: string;
    ft_gallons: string;
    ft_total_cost: string;
    file: string;
  }>(
    `SELECT ft.id::text, s.load_number, s.gallons::text, s.actual::text,
            ft.gallons::text AS ft_gallons, ft.total_cost::text AS ft_total_cost
       FROM settlement_fuel_lines s
       JOIN fuel.fuel_transactions ft
         ON ft.operating_company_id = $1::uuid
        AND ft.archived_at IS NULL
        AND ft.load_id IS NULL
        AND ft.transaction_at::date = s.txn_date
        AND abs(s.gallons - ft.gallons) < 0.05
        AND abs(s.actual - ft.total_cost) < 0.5`,
    [USMCA_COMPANY_ID]
  );
  console.log(`Settlement-document matches against still-unlinked rows: ${matches.rowCount}`);
  for (const m of matches.rows) {
    console.log(`  ft=${m.id} load=${m.load_number} settlement(${m.gallons}gal/$${m.actual}) vs ft(${m.ft_gallons}gal/$${m.ft_total_cost})`);
  }

  const residual = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM fuel.fuel_transactions
      WHERE operating_company_id = $1::uuid AND archived_at IS NULL AND load_id IS NULL`,
    [USMCA_COMPANY_ID]
  );
  console.log(`Residual load_id-NULL rows (pre-execute): ${residual.rows[0]!.n}`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made. Re-run with --execute to apply matched rows.");
    return;
  }

  let applied = 0;
  for (const m of matches.rows) {
    const res = await client.query(
      `SELECT l.id::text FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND l.load_number = $2`,
      [USMCA_COMPANY_ID, m.load_number]
    );
    if (res.rowCount !== 1) continue; // never apply an ambiguous/absent load resolution
    const loadId = res.rows[0]!.id;
    await client.query(
      `UPDATE fuel.fuel_transactions
          SET load_id = $1::uuid, load_required = true,
              notes = COALESCE(notes,'') || $2,
              updated_at = now(), updated_by_user_id = $3::uuid
        WHERE id = $4::uuid AND operating_company_id = $5::uuid AND load_id IS NULL`,
      [
        loadId,
        `; LOAD-ID-RESOLVED=Company_Settlement FUEL PURCHASES table (Load ${m.load_number})`,
        OWNER_USER_ID,
        m.id,
        USMCA_COMPANY_ID,
      ]
    );
    applied++;
  }
  client.release();
  await pool.end();
  console.log(`\nEXECUTE done: ${applied} rows updated from settlement-document matches.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
