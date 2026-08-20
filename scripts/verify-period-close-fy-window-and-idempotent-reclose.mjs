#!/usr/bin/env node
/**
 * ACCT-F5675 — the retained-earnings year-end close must follow the LOCKED design (owner 2026-08-20;
 * OWNER-DECISIONS-FINAL E7/E8 + blueprint 16825):
 *
 *   1. FISCAL-YEAR WINDOW: the P&L aggregation runs Jan 1 of fiscal_year → period_end — never the
 *      closing period's own period_start. Prod periods are monthly, so the old window swept only
 *      December into Retained Earnings and understated RE by ~11/12 of each year's net income.
 *   2. IDEMPOTENT RE-CLOSE: an unreversed posted closing JE for the fiscal year is RETURNED —
 *      a second close JE is never posted. (Undo = reverse, then close again.)
 *   3. REVERSAL-SCOPED KEY: after an undo, the fresh close's idempotency key carries a
 *      reversed-count suffix so its lines can never ON-CONFLICT-collide with the reversed close's
 *      rows (the zero-line / unbalanced-JE collision class).
 *
 * Run:  node scripts/verify-period-close-fy-window-and-idempotent-reclose.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-period-close-fy-window-and-idempotent-reclose";
const FILE = "apps/backend/src/accounting/period-close-retained-earnings.service.ts";

export function analyze(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");

  if (!/const fiscalYearStart = `\$\{params\.fiscal_year\}-01-01`/.test(code)) {
    failures.push(`${FILE}: the aggregation start must be the FISCAL-YEAR start (fiscal_year-01-01), never the closing period's own period_start (locked E8/blueprint-16825 design).`);
  }
  if (!/\[params\.operating_company_id, fiscalYearStart, params\.period_end\]/.test(code)) {
    failures.push(`${FILE}: the aggregation query must be parameterized with fiscalYearStart — passing params.period_start sweeps only the closing month.`);
  }
  if (/\[params\.operating_company_id, params\.period_start, params\.period_end\]/.test(code)) {
    failures.push(`${FILE}: params.period_start must NOT feed the P&L aggregation window (the ~11/12-understatement regression).`);
  }
  if (!/const liveClose = priorCloses\.rows\.find\([\s\S]{0,120}?\)\s*;?\s*\n\s*if \(liveClose\) return liveClose\.id;/.test(code)) {
    failures.push(`${FILE}: re-close must be IDEMPOTENT — an unreversed posted closing JE is returned, never duplicated (locked design: "return existing close JE, never a second one").`);
  }
  if (!/reversedCloseCount > 0 \? `:r\$\{reversedCloseCount\}` : ""/.test(code)) {
    failures.push(`${FILE}: the idempotency key must be reversal-count-scoped (\`:r{n}\` suffix after an undo) — without it a close-after-undo ON-CONFLICT-collides into a zero-line or unbalanced JE.`);
  }
  return failures;
}

export function run() {
  return analyze(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const good = analyze(real);
  if (good.length) throw new Error(`[${LABEL}] selftest: the REAL file should PASS but failed: ${good.join("; ")}`);

  const m1 = real.replace("[params.operating_company_id, fiscalYearStart, params.period_end]", "[params.operating_company_id, params.period_start, params.period_end]");
  if (!analyze(m1).some((f) => f.includes("period_start must NOT feed") || f.includes("parameterized with fiscalYearStart"))) {
    throw new Error(`[${LABEL}] selftest: regressed window should FAIL but passed`);
  }

  const m2 = real.replace(/if \(liveClose\) return liveClose\.id;/, "");
  if (!analyze(m2).some((f) => f.includes("IDEMPOTENT"))) {
    throw new Error(`[${LABEL}] selftest: removed idempotent return should FAIL but passed`);
  }

  const m3 = real.replace(/\$\{reversedCloseCount > 0 \? `:r\$\{reversedCloseCount\}` : ""\}/, "");
  if (!analyze(m3).some((f) => f.includes("reversal-count-scoped"))) {
    throw new Error(`[${LABEL}] selftest: removed key suffix should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — real green; window, idempotent-return and key-suffix mutations all red`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — fiscal-year window, idempotent re-close, and reversal-scoped keys all locked`);
