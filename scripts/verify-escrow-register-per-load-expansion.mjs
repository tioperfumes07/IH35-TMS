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
  {
    name: "backend: LATERAL joins settlement_lines for escrow_contribution",
    file: ROUTE,
    pattern: /LEFT JOIN LATERAL[\s\S]{0,300}line_type = 'escrow_contribution'/,
  },
  {
    name: "backend: joins mdata.loads for load_number",
    file: ROUTE,
    pattern: /LEFT JOIN mdata\.loads l[\s\S]{0,100}sl_expand\.load_id/,
  },
  {
    name: "backend: selects load_id, load_number, load_date",
    file: ROUTE,
    pattern: /sl_expand\.load_id::text AS load_id[\s\S]{0,100}l\.load_number AS load_number[\s\S]{0,400}FROM mdata\.load_stops st[\s\S]{0,200}stop_type = 'pickup'[\s\S]{0,200}\) AS load_date/, // 443.331: mdata.loads has no pickup_date column — load_date is the first pickup stop
  },
  {
    name: "frontend type: EscrowDriverTimelineRow has load_id, load_number, load_date",
    file: TYPE_FILE,
    pattern: /EscrowDriverTimelineRow[\s\S]{0,800}load_id\?.*string[\s\S]{0,200}load_number\?.*string[\s\S]{0,200}load_date\?.*string/,
  },
  {
    name: "frontend page: renders Load {number} label when load_id present",
    file: PAGE,
    pattern: /t\.load_id[\s\S]{0,100}Load \${t\.load_number/,
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
      LEFT JOIN LATERAL (
        SELECT sl.load_id, sl.amount
        FROM driver_finance.settlement_lines sl
        WHERE sl.settlement_id = ep.source_id::uuid
          AND sl.line_type = 'escrow_contribution'
      ) sl_expand ON true
      LEFT JOIN mdata.loads l ON l.id = sl_expand.load_id AND l.operating_company_id = ep.operating_company_id
      sl_expand.load_id::text AS load_id,
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
      const settLabel = t.load_id
        ? \`Load \${t.load_number ?? "—"} · ...\`
        : t.settlement_id
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
