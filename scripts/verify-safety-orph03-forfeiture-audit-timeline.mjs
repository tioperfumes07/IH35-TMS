#!/usr/bin/env node
/**
 * SAF-ORPH-03 — Forfeiture Audit panel must be able to render escrow timeline rows.
 *
 * Root defect (2026-07-25): driver_finance.escrow_ledger has created_at but NO posted_at.
 * deductions.routes.ts ordered by posted_at → Postgres 42703 on every call, and
 * listEscrowRecords() swallowed failures into an empty timeline — the panel looked like
 * "no forfeitures" when the read was structurally broken.
 *
 * This guard locks BOTH halves:
 *   1. escrow_ledger reads order by created_at (never posted_at)
 *   2. listEscrowRecords does not manufacture empty timelines from caught exceptions
 *   3. EscrowRecordTab surfaces timeline_errors when history is incomplete
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-orph03-forfeiture-audit-timeline";

const DEDUCTIONS_ROUTES = "apps/backend/src/driver-finance/deductions.routes.ts";
const ESCROW_VIZ_ROUTES = "apps/backend/src/banking/escrow-visualizer.routes.ts";
const DRIVER_FINANCE_API = "apps/frontend/src/api/driverFinance.ts";
const ESCROW_RECORD_TAB = "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx";

const FILES = [DEDUCTIONS_ROUTES, ESCROW_VIZ_ROUTES, DRIVER_FINANCE_API, ESCROW_RECORD_TAB];

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractEscrowLedgerSql(src) {
  const chunks = [];
  const re = /driver_finance\.escrow_ledger[\s\S]{0,1200}/gi;
  let m;
  while ((m = re.exec(src))) chunks.push(m[0]);
  return chunks;
}

export function assertOrph03(root = ROOT) {
  const problems = [];

  for (const rel of FILES) {
    if (!fs.existsSync(path.join(root, rel))) problems.push(`missing ${rel}`);
  }
  if (problems.length) return problems;

  for (const rel of [DEDUCTIONS_ROUTES, ESCROW_VIZ_ROUTES]) {
    const src = stripComments(read(rel));
    const chunks = extractEscrowLedgerSql(src);
    if (chunks.length === 0) {
      problems.push(`${rel}: expected at least one driver_finance.escrow_ledger query`);
      continue;
    }
    for (const chunk of chunks) {
      if (/order\s+by\s+posted_at/i.test(chunk)) {
        problems.push(
          `${rel}: driver_finance.escrow_ledger query orders by posted_at — column does not exist (Postgres 42703)`
        );
      }
      if (!/order\s+by\s+created_at/i.test(chunk)) {
        problems.push(`${rel}: driver_finance.escrow_ledger query must ORDER BY created_at`);
      }
    }
  }

  const driverFinance = stripComments(read(DRIVER_FINANCE_API));
  if (/getEscrowDriverTimeline[\s\S]{0,500}\(\s*\(\)\s*=>\s*\(\{\s*ok:\s*true[\s\S]{0,80}timeline:\s*\[\]/.test(
    driverFinance
  )) {
    problems.push(
      `${DRIVER_FINANCE_API}: listEscrowRecords must not treat timeline failures as ok:true with an empty timeline`
    );
  }
  if (!/ok:\s*false\s+as\s+const,\s*error:/.test(driverFinance)) {
    problems.push(`${DRIVER_FINANCE_API}: timeline failures must return ok:false with an error message`);
  }
  if (!/timeline_errors/.test(driverFinance)) {
    problems.push(`${DRIVER_FINANCE_API}: listEscrowRecords must return timeline_errors for partial audit honesty`);
  }

  const tab = read(ESCROW_RECORD_TAB);
  if (!/data-testid="escrow-forfeit-audit-errors"/.test(tab)) {
    problems.push(`${ESCROW_RECORD_TAB}: must surface timeline_errors — incomplete audit must not look empty`);
  }

  return problems;
}

function selftest() {
  const baseline = assertOrph03();
  if (baseline.length) {
    console.error(`SELFTEST FAIL: repository already red.\n  - ${baseline.join("\n  - ")}`);
    process.exit(1);
  }

  const cases = [
    {
      name: "posted_at resurrected on escrow_ledger read",
      file: DEDUCTIONS_ROUTES,
      find: "ORDER BY created_at DESC LIMIT 200",
      replace: "ORDER BY posted_at DESC LIMIT 200",
    },
    {
      name: "timeline failures treated as empty success",
      file: DRIVER_FINANCE_API,
      find: "(err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) })",
      replace: "() => ({ ok: true as const, payload: { timeline: [] } })",
    },
    {
      name: "EscrowRecordTab stops surfacing timeline_errors",
      file: ESCROW_RECORD_TAB,
      find: 'data-testid="escrow-forfeit-audit-errors"',
      replace: 'data-testid="escrow-forfeit-audit-errors-removed"',
    },
  ];

  for (const c of cases) {
    const abs = path.join(ROOT, c.file);
    const original = fs.readFileSync(abs, "utf8");
    if (!original.includes(c.find)) {
      console.error(`SELFTEST FAIL: anchor for "${c.name}" not found`);
      process.exit(1);
    }
    try {
      fs.writeFileSync(abs, original.replace(c.find, c.replace), "utf8");
      const caught = assertOrph03();
      if (caught.length === 0) {
        console.error(`SELFTEST FAIL: "${c.name}" not caught`);
        process.exit(1);
      }
      console.log(`  caught: ${c.name}`);
    } finally {
      fs.writeFileSync(abs, original, "utf8");
    }
  }

  console.log(`SELFTEST PASS: all ${cases.length} planted defects caught, restore green.`);
}

const problems = assertOrph03();
if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (problems.length) {
  console.error(`${LABEL} FAIL:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}

console.log(`${LABEL} OK — escrow timeline reads use created_at; forfeiture audit does not swallow failures.`);
