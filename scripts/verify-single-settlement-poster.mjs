#!/usr/bin/env node
// ROUND 326 queue item 2 (CC-1) — ONE settlement poster. Competing-engine order 2026-10-02: closeSettlementPayRun
// (one JE crediting 2170 Driver Net-Pay Clearing) and postSettlementBillPayment (per-load A/P) both posted
// settlements; the owner ruled the per-load A/P chain and no holding accounts. This guard fails if:
//   1. the Close engine stops posting through settlement-ap-chain (postSettlementApChainInClientTx) or posts a
//      settlement JE of its own ("pay-run close" memo / createJournalEntry with the legs);
//   2. the retired bill-payment-post route stops answering 410, or ANY other backend code calls
//      postSettlementBillPayment( — a second reachable settlement poster;
//   3. the chain references a clearing / holding account (driver_payroll_clearing, net-pay clearing, 2170);
//   4. a non-cash settlement application could post a cash leg (bills.service must skip it), or the chain stops
//      applying advances / deductions as non-cash bill payments and net pay from a bank.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-single-settlement-poster";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const F = {
  close: "apps/backend/src/driver-finance/settlement-payrun-close.service.ts",
  chain: "apps/backend/src/driver-finance/settlement-ap-chain.service.ts",
  routes: "apps/backend/src/accounting/settlement-posting/settlement-posting.routes.ts",
  bills: "apps/backend/src/accounting/bills.service.ts",
  posterB: "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
};

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) { if (!/node_modules|__tests__/.test(e)) walk(p, out); }
    else if (/\.ts$/.test(e) && !/\.test\.ts$/.test(e)) out.push(p);
  }
  return out;
}

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(src, otherCallers) {
  const p = [];
  const close = strip(src.close);
  if (!/await postSettlementApChainInClientTx\(/.test(close)) p.push("the Close engine (closeSettlementPayRun) must post through postSettlementApChainInClientTx");
  if (/pay-run close \(net/.test(close) || /createJournalEntry\(\s*jeInput/.test(close)) p.push("the Close engine posts its own settlement JE again (the retired single clearing JE)");
  const routes = strip(src.routes);
  if (!/bill-payment-post[\s\S]{0,400}code\(410\)/.test(routes)) p.push("the retired /settlement-posting/bill-payment-post route must answer 410");
  if (/postSettlementBillPayment\(/.test(routes)) p.push("settlement-posting.routes.ts calls postSettlementBillPayment( — a second reachable poster");
  for (const f of otherCallers) p.push(`${f} calls postSettlementBillPayment( — a second reachable settlement poster`);
  const chain = strip(src.chain);
  if (/driver_payroll_clearing|net[_ -]?pay[_ -]?clearing|\b2170\b/i.test(chain)) p.push("settlement-ap-chain references a clearing / holding account (owner: no holding accounts)");
  if (!/settlementDeductionNoncash: true/.test(chain)) p.push("advances / deductions / escrow must apply as non-cash bill payments (settlementDeductionNoncash)");
  if (!/fromBankAccountId: input\.payoutBankAccountId/.test(chain)) p.push("net pay must be a bill payment from the payout bank");
  if (!/input\.settlementDeductionNoncash !== true/.test(strip(src.bills))) p.push("bills.service must skip the cash GL leg for a non-cash settlement application");
  return p;
}

function loadSrc() {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, read(v)]));
  const posterBAbs = path.join(ROOT, F.posterB);
  const routesAbs = path.join(ROOT, F.routes);
  const otherCallers = walk(path.join(ROOT, "apps/backend/src"))
    .filter((f) => f !== posterBAbs && f !== routesAbs && /postSettlementBillPayment\(/.test(strip(readFileSync(f, "utf8"))))
    .map((f) => path.relative(ROOT, f));
  return { src, otherCallers };
}

export function run() {
  const { src, otherCallers } = loadSrc();
  return problems(src, otherCallers);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
const { src, otherCallers } = loadSrc();
const own = problems(src, otherCallers);
const plants = [
  ["clearing JE back", { ...src, close: src.close + "\nawait createJournalEntry(jeInput, a, b); // pay-run close (net 1c)" }],
  ["route re-enabled", { ...src, routes: src.routes.replace("code(410)", "code(201)") }],
  ["clearing in chain", { ...src, chain: src.chain + "\nconst x = 'driver_payroll_clearing';" }],
  ["cash leg on non-cash", { ...src, bills: src.bills.replace("input.settlementDeductionNoncash !== true", "true") }],
];
if (process.argv.includes("--selftest")) {
  if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
  for (const [name, planted] of plants) {
    if (!problems(planted, []).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
  }
  console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
  process.exit(0);
}
if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
console.log(`${LABEL}: OK — Close posts the per-load A/P chain (one bill per load, advances / deductions as non-cash bill payments, net pay from the bank); the second poster is retired (410); no clearing account.`);
}
