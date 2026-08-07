#!/usr/bin/env node
/**
 * BANK-F602 — Banking Home "Cash posting" KPI must not render cents as dollars (100× inflation).
 *
 * Authoritative total: sumAuthoritativeDepositoryCashCents (same raw cents as cash-flow opening_cash_cents).
 * API converts once: total_cash = authoritativeTotalCash / 100 (dollars).
 * UI reads dollars once via formatUsd — never formatUsdCents on total_cash, never a second /100.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = path.join(ROOT, "apps/backend/src/banking/banking.routes.ts");
const HOME = path.join(ROOT, "apps/frontend/src/pages/banking/BankingHome.tsx");
const CASH_FLOW = path.join(ROOT, "apps/backend/src/cash-flow/cash-flow.service.ts");
const LABEL = "verify-banking-cash-posting-cents-scale";

function stripComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

export function auditRoute(src) {
  const errors = [];
  const body = stripComments(src);
  if (!/sumAuthoritativeDepositoryCashCents\s*\(/.test(body)) {
    errors.push(`${ROUTE}: total_cash KPI must call sumAuthoritativeDepositoryCashCents (shared with cash-flow opening).`);
  }
  if (!/total_cash:\s*authoritativeTotalCash\s*\/\s*100/.test(body)) {
    errors.push(
      `${ROUTE}: total_cash must be authoritativeTotalCash / 100 (dollars). Raw cents inflates Cash posting 100× vs Cash Flow.`
    );
  }
  if (/total_cash:\s*authoritativeTotalCash\s*[,}\n]/.test(body) && !/total_cash:\s*authoritativeTotalCash\s*\/\s*100/.test(body)) {
    errors.push(`${ROUTE}: total_cash must not assign raw authoritativeTotalCash cents to the KPI payload.`);
  }
  return errors;
}

export function auditHome(src) {
  const errors = [];
  const body = stripComments(src);
  if (!/formatUsd\s*\(/.test(body)) {
    errors.push(`${HOME}: Cash posting KPI must use formatUsd from lib/money (API dollars, not cents).`);
  }
  const cashSel =
    /const\s+cashPosting\s*=\s*Number\(\s*kpiQuery\.data\?\.\s*total_cash\s*\?\?\s*0\s*\)([^;\n]*)/.exec(body);
  if (!cashSel) {
    errors.push(`${HOME}: missing cashPosting selector from kpiQuery.data.total_cash.`);
  } else if (/\/\s*100/.test(cashSel[1] ?? "")) {
    errors.push(`${HOME}: cashPosting must not divide total_cash by 100 — API already returns dollars.`);
  }
  if (/formatUsdCents\s*\(\s*cashPosting\s*\)/.test(body)) {
    errors.push(`${HOME}: Cash posting must not pass API dollars through formatUsdCents (100× inflation).`);
  }
  if (!/Cash posting[\s\S]{0,400}formatUsd\s*\(\s*cashPosting\s*\)/.test(body)) {
    errors.push(`${HOME}: Cash posting tile must render formatUsd(cashPosting) so dollars stay dollars.`);
  }
  return errors;
}

export function auditCashFlowParity(src) {
  const errors = [];
  const body = stripComments(src);
  if (!/openingCashCents\s*=\s*await\s+sumAuthoritativeDepositoryCashCents\s*\(/.test(body)) {
    errors.push(`${CASH_FLOW}: opening_cash_cents must stay on sumAuthoritativeDepositoryCashCents (KPI parity anchor).`);
  }
  return errors;
}

export function auditTree(root = ROOT) {
  return [
    ...auditRoute(fs.readFileSync(path.join(root, ROUTE.replace(`${ROOT}/`, "")), "utf8")),
    ...auditHome(fs.readFileSync(path.join(root, HOME.replace(`${ROOT}/`, "")), "utf8")),
    ...auditCashFlowParity(fs.readFileSync(path.join(root, CASH_FLOW.replace(`${ROOT}/`, "")), "utf8")),
  ];
}

function readAt(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function auditFromRoot(root) {
  return [
    ...auditRoute(readAt(root, "apps/backend/src/banking/banking.routes.ts")),
    ...auditHome(readAt(root, "apps/frontend/src/pages/banking/BankingHome.tsx")),
    ...auditCashFlowParity(readAt(root, "apps/backend/src/cash-flow/cash-flow.service.ts")),
  ];
}

function selftest() {
  const failures = [];
  if (auditFromRoot(ROOT).length !== 0) {
    failures.push(`live tree flagged: ${auditFromRoot(ROOT).join(" | ")}`);
  }

  const goodRoute = `
    const authoritativeTotalCash = await sumAuthoritativeDepositoryCashCents(client, companyId, opts);
    return { total_cash: authoritativeTotalCash / 100 };
  `;
  const badRoute = `
    const authoritativeTotalCash = await sumAuthoritativeDepositoryCashCents(client, companyId, opts);
    return { total_cash: authoritativeTotalCash };
  `;
  if (auditRoute(goodRoute).length !== 0) failures.push("good route fixture wrongly flagged");
  if (auditRoute(badRoute).length === 0) failures.push("raw cents route NOT caught");

  const goodHome = `
    import { formatUsd } from "../../lib/money";
    const cashPosting = Number(kpiQuery.data?.total_cash ?? 0);
    <div>Cash posting</div><div>{formatUsd(cashPosting)}</div>
  `;
  const doubleConvert = `
    import { formatUsd } from "../../lib/money";
    const cashPosting = Number(kpiQuery.data?.total_cash ?? 0) / 100;
    <div>Cash posting</div><div>{formatUsd(cashPosting)}</div>
  `;
  const centsAsDollars = `
    import { formatUsdCents } from "../../lib/money";
    const cashPosting = Number(kpiQuery.data?.total_cash ?? 0);
    <div>Cash posting</div><div>{formatUsdCents(cashPosting)}</div>
  `;
  if (auditHome(goodHome).length !== 0) failures.push("good home fixture wrongly flagged");
  if (auditHome(doubleConvert).length === 0) failures.push("frontend double /100 NOT caught");
  if (auditHome(centsAsDollars).length === 0) failures.push("formatUsdCents(cashPosting) NOT caught");

  const goodCf = `const openingCashCents = await sumAuthoritativeDepositoryCashCents(client, operatingCompanyId, opts);`;
  if (auditCashFlowParity(goodCf).length !== 0) failures.push("good cash-flow fixture wrongly flagged");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — raw cents, double /100, and formatUsdCents(cashPosting) all rejected`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditFromRoot(ROOT);
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Cash posting KPI uses API dollars once (matches Cash Flow authoritative cents / 100)`);
}

main();
