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

const VOID_STATUS_PUSH = /where\.push\(\s*["']b\.status NOT IN \('void', 'voided'\)["']\s*\)/;

function checkService(src, label = serviceRel) {
  const findings = [];
  const hasBalanceHits = [...src.matchAll(/if\s*\(\s*options\.hasBalance\s*\)/g)];
  if (hasBalanceHits.length < 2) {
    findings.push(`${label}: expected ≥2 options.hasBalance sites (vendor + company list)`);
  }
  const voidPushes = [...src.matchAll(new RegExp(VOID_STATUS_PUSH.source, "g"))];
  if (voidPushes.length < 2) {
    findings.push(
      `${label}: expected ≥2 where.push("b.status NOT IN ('void', 'voided')") next to has_balance (found ${voidPushes.length})`
    );
  }
  // Each hasBalance site's following ~400 chars must include the void status push
  // (avoid matching unrelated status filters elsewhere).
  for (const [i, m] of hasBalanceHits.entries()) {
    const start = m.index ?? 0;
    const window = src.slice(start, start + 400);
    if (!VOID_STATUS_PUSH.test(window)) {
      findings.push(`${label}: hasBalance site #${i + 1} window missing b.status NOT IN ('void', 'voided')`);
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
  const goodSvcFindings = checkService(goodSvc, "selftest-good-svc");
  if (goodSvcFindings.length > 0) {
    console.error("verify-payable-selector-excludes-void --selftest FAIL: good service reddened");
    for (const f of goodSvcFindings) console.error(`  - ${f}`);
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
  const goodPageFindings = checkPage(goodPage, "selftest-good-page");
  if (goodPageFindings.length > 0) {
    console.error("verify-payable-selector-excludes-void --selftest FAIL: good page reddened");
    for (const f of goodPageFindings) console.error(`  - ${f}`);
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
