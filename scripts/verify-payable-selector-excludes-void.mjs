#!/usr/bin/env node
/**
 * ACCT-F5028 — LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS
 * listBills has_balance must exclude status 'void'/'voided' (dollar open ≠ payable).
 * BillPaymentsListPage unpaid selector must filter status !== 'voided'.
 *
 * @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^(bill|payable)","task":"ACCT-F5028-PAYABLE-SELECTOR-EXCLUDES-VOID","pr":"this PR"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const serviceRel = "apps/backend/src/accounting/bills.service.ts";
const pageRel = "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx";

function checkService(src, label = serviceRel) {
  const findings = [];
  const hasBalanceBlocks = [...src.matchAll(/if\s*\(\s*options\.hasBalance\s*\)\s*\{([\s\S]*?)\}/g)];
  if (hasBalanceBlocks.length < 2) {
    findings.push(`${label}: expected ≥2 options.hasBalance blocks (vendor + company list)`);
  }
  for (const [i, m] of hasBalanceBlocks.entries()) {
    const body = m[1];
    if (!/b\.status\s+NOT IN\s*\(\s*'void'\s*,\s*'voided'\s*\)/.test(body)) {
      findings.push(`${label}: hasBalance block #${i + 1} must push b.status NOT IN ('void', 'voided')`);
    }
  }
  return findings;
}

function checkPage(src, label = pageRel) {
  const findings = [];
  if (!/unpaidBillsForSelector/.test(src)) {
    findings.push(`${label}: must define unpaidBillsForSelector`);
  }
  if (!/status\s*!==\s*["']voided["']/.test(src)) {
    findings.push(`${label}: unpaid selector must filter status !== \"voided\"`);
  }
  if (/\(unpaidBillsQuery\.data\?\.rows\s*\?\?\s*\[\]\)\.map\(/.test(src)) {
    findings.push(`${label}: must not map unpaidBillsQuery.data.rows directly into selector`);
  }
  return findings;
}

function selftest() {
  const badSvc = `
    if (options.hasBalance) {
      where.push(\`\${BILL_OPEN_BALANCE_SQL} > 0\`);
    }
    if (options.hasBalance) {
      where.push(\`\${BILL_OPEN_BALANCE_SQL} > 0\`);
    }
  `;
  if (checkService(badSvc, "selftest-bad-svc").length === 0) {
    console.error("verify-payable-selector-excludes-void --selftest FAIL: bad service did not redden");
    process.exit(1);
  }
  const goodSvc = `
    if (options.hasBalance) {
      where.push(\`\${BILL_OPEN_BALANCE_SQL} > 0\`);
      where.push("b.status NOT IN ('void', 'voided')");
    }
    if (options.hasBalance) {
      where.push(\`\${BILL_OPEN_BALANCE_SQL} > 0\`);
      where.push("b.status NOT IN ('void', 'voided')");
    }
  `;
  if (checkService(goodSvc, "selftest-good-svc").length > 0) {
    console.error("verify-payable-selector-excludes-void --selftest FAIL: good service reddened");
    process.exit(1);
  }
  const badPage = `
    {(unpaidBillsQuery.data?.rows ?? []).map((bill) => (
      <option key={bill.id}>{bill.id}</option>
    ))}
  `;
  if (checkPage(badPage, "selftest-bad-page").length === 0) {
    console.error("verify-payable-selector-excludes-void --selftest FAIL: bad page did not redden");
    process.exit(1);
  }
  const goodPage = `
    const unpaidBillsForSelector = useMemo(() => {
      return (unpaidBillsQuery.data?.rows ?? []).filter((bill) => bill.status !== "voided");
    }, [unpaidBillsQuery.data?.rows]);
    {unpaidBillsForSelector.map((bill) => (
      <option key={bill.id}>{bill.id}</option>
    ))}
  `;
  if (checkPage(goodPage, "selftest-good-page").length > 0) {
    console.error("verify-payable-selector-excludes-void --selftest FAIL: good page reddened");
    process.exit(1);
  }
  console.log("verify-payable-selector-excludes-void --selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const findings = [
    ...checkService(fs.readFileSync(path.join(root, serviceRel), "utf8")),
    ...checkPage(fs.readFileSync(path.join(root, pageRel), "utf8")),
  ];
  if (findings.length > 0) {
    console.error("verify-payable-selector-excludes-void FAIL:");
    for (const f of findings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-payable-selector-excludes-void PASS");
}

main();
