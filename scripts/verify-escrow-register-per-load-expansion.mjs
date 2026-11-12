#!/usr/bin/env node
/**
 * ROW 215 — Escrow register shows one row per LOAD (not one lump per settlement).
 * Backend: the /escrow-visualizer/:driver_id route LEFT JOIN LATERAL expands
 * escrow_postings with source_type='driver_settlement' into one row per
 * driver_finance.settlement_lines WHERE line_type='escrow_contribution'.
 * Frontend: EscrowRegisterPage shows "Load {number} · {date}" when load_id is present.
 *
 * Self-test: node scripts/verify-escrow-register-per-load-expansion.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-register-per-load-expansion";

const ROUTE = "apps/backend/src/banking/escrow-visualizer.routes.ts";
const TYPE_FILE = "apps/frontend/src/api/banking.ts";
const PAGE = "apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx";

const CHECKS = [
  // ACCT-F11093 (row 22, #28642): the per-load rows come from the split the WRITER records (accounting.escrow_posting_loads),
  // no longer expanded at read time from settlement_lines (53 per-load lines voided as "SET-24 LINE-DUP" dropped $1,725.00).
  {
    name: "backend: per-load rows read the recorded split accounting.escrow_posting_loads",
    file: ROUTE,
    pattern: /LEFT JOIN accounting\.escrow_posting_loads epl[\s\S]{0,150}epl\.escrow_posting_id = ep\.id/,
  },
  {
    name: "backend: joins mdata.loads for load_number",
    file: ROUTE,
    pattern: /LEFT JOIN mdata\.loads l[\s\S]{0,100}l\.id = epl\.load_id/,
  },
  {
    name: "backend: selects load_id, load_number, load_date",
    file: ROUTE,
    pattern: /epl\.load_id::text AS load_id[\s\S]{0,100}l\.load_number AS load_number[\s\S]{0,400}FROM mdata\.load_stops st[\s\S]{0,200}stop_type = 'pickup'[\s\S]{0,200}\) AS load_date/, // 443.331: mdata.loads has no pickup_date column — load_date is the first pickup stop
  },
  {
    name: "backend: the row date is the document date, never posted_at",
    file: ROUTE,
    pattern: /COALESCE\(epl\.document_date, ep\.document_date, je\.entry_date\)::text AS document_date/,
  },
  {
    name: "frontend type: EscrowDriverTimelineRow has load_id, load_number, load_date",
    file: TYPE_FILE,
    pattern: /EscrowDriverTimelineRow[\s\S]{0,1600}load_id\?.*string[\s\S]{0,200}load_number\?.*string[\s\S]{0,200}load_date\?.*string/,
  },
  {
    name: "frontend page: Load column EntityLinks the load when load_id present",
    file: PAGE,
    pattern: /loadNumber: t\.load_id \? \(t\.load_number[\s\S]{0,2000}kind=["']load["'][\s\S]{0,200}id=\{r\.loadId\}/,
  },
  {
    name: "frontend page: Source EntityLinks settlement / journal_entry",
    file: PAGE,
    pattern: /kind=["']settlement["'][\s\S]{0,120}id=\{r\.settlementId\}[\s\S]{0,400}kind=["']journal_entry["'][\s\S]{0,120}id=\{r\.journalEntryId\}/,
  },
  {
    name: "frontend CSV money uses formatUsd (not toFixed)",
    file: PAGE,
    pattern: /formatUsd\(r\.balance\)/,
  },
];

function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    [ROUTE]: `
      LEFT JOIN accounting.escrow_posting_loads epl
        ON epl.escrow_posting_id = ep.id
      LEFT JOIN mdata.loads l ON l.id = epl.load_id AND l.operating_company_id = ep.operating_company_id
      COALESCE(epl.document_date, ep.document_date, je.entry_date)::text AS document_date,
      epl.load_id::text AS load_id,
      l.load_number AS load_number,
      (SELECT (COALESCE(st.actual_arrival_at, st.appointment_start_at, st.scheduled_arrival_at) AT TIME ZONE 'America/Chicago')::date::text
         FROM mdata.load_stops st
        WHERE st.load_id = l.id AND st.stop_type = 'pickup' AND st.soft_deleted_at IS NULL
        ORDER BY st.sequence_number ASC LIMIT 1) AS load_date
    `,
    [TYPE_FILE]: `
      export type EscrowDriverTimelineRow = {
        id: string;
        load_id?: string | null;
        load_number?: string | null;
        load_date?: string | null;
      }
    `,
    [PAGE]: `
        loadNumber: t.load_id ? (t.load_number ?? null) : null,
        render: (r) => r.loadId ? (<EntityLink kind="load" id={r.loadId} label={r.loadNumber} />) : "—",
        kind="settlement" id={r.settlementId}
        kind="journal_entry" id={r.journalEntryId}
      formatUsd(r.balance)
    `,
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture failed: ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: all-empty fixture should fail all ${CHECKS.length} checks`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — ${CHECKS.length}/${CHECKS.length}`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s):`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — escrow register expands settlement postings to one row per load`);
