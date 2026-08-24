#!/usr/bin/env node
/**
 * ACCT-F5027 — LV-AR-OPEN-INCLUDES-VOIDED
 * Invoices list "Total billed" / "Open" must exclude void paper. amount_open_cents is a
 * GENERATED column (total − paid) that stays non-zero after void — UI must force $0 and
 * omit void rows from aggregate strips.
 *
 * Ratchet (static on InvoicesListPage.tsx):
 * 1) isVoidInvoice / invoiceOpenCentsForDisplay / invoiceTotalCentsForAggregate present
 * 2) totals reduce must call those helpers (not raw amount_open_cents / total_cents alone)
 * 3) Open column render must use invoiceOpenCentsForDisplay
 * 4) Forbidden: bare `acc.open += Number(row.amount_open_cents` in totals reduce
 *
 * @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^(invoice|ar)","task":"ACCT-F5027-AR-OPEN-EXCLUDES-VOID","pr":"this PR"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageRel = "apps/frontend/src/pages/accounting/InvoicesListPage.tsx";

function check(src, label = pageRel) {
  const findings = [];
  if (!/export function isVoidInvoice\b/.test(src)) {
    findings.push(`${label}: must export isVoidInvoice`);
  }
  if (!/export function invoiceOpenCentsForDisplay\b/.test(src)) {
    findings.push(`${label}: must export invoiceOpenCentsForDisplay`);
  }
  if (!/export function invoiceTotalCentsForAggregate\b/.test(src)) {
    findings.push(`${label}: must export invoiceTotalCentsForAggregate`);
  }
  if (!/invoiceTotalCentsForAggregate\s*\(\s*row\s*\)/.test(src)) {
    findings.push(`${label}: totals must use invoiceTotalCentsForAggregate(row)`);
  }
  if (!/invoiceOpenCentsForDisplay\s*\(\s*row\s*\)/.test(src)) {
    findings.push(`${label}: Open display/totals must use invoiceOpenCentsForDisplay(row)`);
  }
  if (/acc\.open\s*\+=\s*Number\(\s*row\.amount_open_cents/.test(src)) {
    findings.push(`${label}: forbids acc.open += Number(row.amount_open_cents — LV-AR-OPEN-INCLUDES-VOIDED`);
  }
  if (/acc\.total\s*\+=\s*Number\(\s*row\.total_cents/.test(src)) {
    findings.push(`${label}: forbids acc.total += Number(row.total_cents — must exclude void`);
  }
  if (/money\(\s*row\.amount_open_cents\s*\)/.test(src)) {
    findings.push(`${label}: Open column must not money(row.amount_open_cents) — use invoiceOpenCentsForDisplay`);
  }
  if (!/row\.status\s*!==\s*["']sent["']\s*&&\s*row\.status\s*!==\s*["']partial["']/.test(src)) {
    findings.push(`${label}: invoiceOpenCentsForDisplay must treat only sent/partial as open A/R (drafts are not A/R)`);
  }
  return findings;
}

function selftest() {
  const bad = `
    const totals = invoices.reduce((acc, row) => {
      acc.total += Number(row.total_cents ?? 0);
      acc.open += Number(row.amount_open_cents ?? 0);
      return acc;
    }, { total: 0, open: 0 });
    render: (row) => money(row.amount_open_cents)
  `;
  if (check(bad, "selftest-bad").length === 0) {
    console.error("verify-ar-invoice-list-open-excludes-void --selftest FAIL: bad page did not redden");
    process.exit(1);
  }
  const good = `
    export function isVoidInvoice(row) { return row.status === "void" || Boolean(row.voided_at); }
    export function invoiceOpenCentsForDisplay(row) { if (isVoidInvoice(row)) return 0; if (row.status !== "sent" && row.status !== "partial") return 0; return Number(row.amount_open_cents ?? 0) || 0; }
    export function invoiceTotalCentsForAggregate(row) { if (isVoidInvoice(row)) return 0; return Number(row.total_cents ?? 0) || 0; }
    const totals = invoices.reduce((acc, row) => {
      acc.total += invoiceTotalCentsForAggregate(row);
      acc.open += invoiceOpenCentsForDisplay(row);
      return acc;
    }, { total: 0, open: 0 });
    render: (row) => money(invoiceOpenCentsForDisplay(row))
  `;
  const goodFindings = check(good, "selftest-good");
  if (goodFindings.length > 0) {
    console.error("verify-ar-invoice-list-open-excludes-void --selftest FAIL: good page reddened");
    for (const f of goodFindings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-ar-invoice-list-open-excludes-void --selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(root, pageRel), "utf8");
  const findings = check(src);
  if (findings.length > 0) {
    console.error("verify-ar-invoice-list-open-excludes-void FAIL:");
    for (const f of findings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-ar-invoice-list-open-excludes-void PASS");
}

main();
