#!/usr/bin/env node
/**
 * ACCT-F5659 — the seeded monthly-pnl PDF subscription (delivered to the OWNER monthly; migration
 * 202606080206 seeds it active, format=pdf) previously handed RAW CENTS integers straight to the
 * Handlebars template: net income of $12,345.67 printed as `1234567`, while the XLSX branch of the
 * SAME report divided by 100 — two subscribers to one report, answers 100x apart. It also passed
 * none of the three footer totals (blank cells) and hardcoded company_code to the literal string
 * "COMPANY". The canonical exporter (statement-export.service.ts) formats every amount via
 * formatUsdFromCents and resolves the real org.companies.code — the runner must mirror it.
 *
 * Run:  node scripts/verify-scheduled-pnl-pdf-formats-cents.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-scheduled-pnl-pdf-formats-cents";
const FILE = "apps/backend/src/reports/scheduled/runner.service.ts";

export function analyze(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const fnMatch = code.match(/async function generateMonthlyPnl\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push(`${FILE}: could not locate generateMonthlyPnl — structure changed, re-check this guard`);
    return failures;
  }
  const fn = fnMatch[0];
  for (const key of ["net_income", "gross_profit", "revenue_total", "cogs_total", "operating_expense_total"]) {
    if (!new RegExp(`${key}:\\s*formatUsdFromCents\\(`).test(fn)) {
      failures.push(
        `${FILE}: generateMonthlyPnl's PDF viewModel must pass ${key} through formatUsdFromCents ` +
          `(ACCT-F5659 — a bare cents integer renders as a 100x-inflated-looking number, or the ` +
          `template cell renders blank if the key is missing).`
      );
    }
  }
  if (/amount:\s*(?!formatUsdFromCents\()/.test(fn) && !/amount:\s*formatUsdFromCents\(/.test(fn)) {
    failures.push(`${FILE}: generateMonthlyPnl's PDF line items must format amount via formatUsdFromCents (ACCT-F5659).`);
  }
  if (/company_code:\s*"COMPANY"/.test(fn)) {
    failures.push(
      `${FILE}: generateMonthlyPnl must resolve the real org.companies.code, not hardcode "COMPANY" ` +
        `(ACCT-F5659 — a multi-entity system's P&L of record must say which entity it is for).`
    );
  }
  return failures;
}

export function run() {
  return analyze(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
}

if (process.argv.includes("--selftest")) {
  const GOOD = `
async function generateMonthlyPnl(operatingCompanyId, format) {
  const buffer = await renderStatementPdf({
    templateName: "profit-loss",
    viewModel: {
      company_code: await fetchCompanyCode(operatingCompanyId),
      revenue_lines: report.revenue.lines.map((line) => ({ amount: formatUsdFromCents(line.amount) })),
      revenue_total: formatUsdFromCents(report.revenue.total),
      cogs_total: formatUsdFromCents(report.cogs.total),
      gross_profit: formatUsdFromCents(report.gross_profit),
      operating_expense_total: formatUsdFromCents(report.operating_expenses.total),
      net_income: formatUsdFromCents(report.net_income),
    },
  });
}
`;
  const good = analyze(GOOD);
  if (good.length) throw new Error(`[${LABEL}] selftest PASS fixture FAILED: ${good.join("; ")}`);

  const BAD = `
async function generateMonthlyPnl(operatingCompanyId, format) {
  const buffer = await renderStatementPdf({
    templateName: "profit-loss",
    viewModel: {
      company_code: "COMPANY",
      revenue_lines: report.revenue.lines,
      gross_profit: report.gross_profit,
      net_income: report.net_income,
    },
  });
}
`;
  const bad = analyze(BAD);
  if (bad.length < 5) throw new Error(`[${LABEL}] selftest REGRESSION fixture should FAIL >=5 checks, got ${bad.length}`);

  console.log(`[${LABEL}] selftest: PASS — good fixture green, raw-cents fixture red (${bad.length} failures)`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — the scheduled monthly P&L PDF formats every amount from cents and names its entity`);
