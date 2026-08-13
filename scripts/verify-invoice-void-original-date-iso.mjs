#!/usr/bin/env node
/**
 * ACCT-F5029 — LV-BILLVOID class on invoice void: issue_date must reach postVoidReversal as ISO YYYY-MM-DD.
 * toISOString().slice(0,10) TZ-shifts; Date.toString().slice → "Thu Aug 06" → Postgres ::date 500.
 *
 * Ratchet on invoices.routes.ts void path:
 * 1) SELECT projects issue_date::text AS issue_date_iso
 * 2) forbids toISOString().slice(0, 10) for originalDate
 * 3) uses pgDateColumnToIsoDay(...)
 *
 * @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^(invoice|void)","task":"ACCT-F5029-INVOICE-VOID-ORIGINAL-DATE-ISO","pr":"this PR"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const invoicesRel = "apps/backend/src/accounting/invoices.routes.ts";

function checkInvoices(src, label = invoicesRel) {
  const findings = [];
  if (!/issue_date::text\s+AS\s+issue_date_iso/i.test(src)) {
    findings.push(`${label}: void SELECT must project issue_date::text AS issue_date_iso`);
  }
  if (!/pgDateColumnToIsoDay\s*\(/.test(src)) {
    findings.push(`${label}: void originalDate must use pgDateColumnToIsoDay(...)`);
  }
  // Forbidden TZ-fragile originalDate construction on the void path
  if (/toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(src) && /\/void/.test(src)) {
    // Narrow: only fail if the void handler still builds originalDate via toISOString slice
    const voidIdx = src.indexOf("/api/v1/accounting/invoices/:id/void");
    if (voidIdx >= 0) {
      const voidSlice = src.slice(voidIdx, voidIdx + 4500);
      if (/toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(voidSlice)) {
        findings.push(`${label}: void path forbids toISOString().slice(0, 10) for originalDate`);
      }
      if (/rawDate\.slice\(\s*0\s*,\s*10\s*\)/.test(voidSlice)) {
        findings.push(`${label}: void path forbids rawDate.slice(0, 10) — use pgDateColumnToIsoDay`);
      }
    }
  }
  return findings;
}

function selftest() {
  const bad = `
    app.post("/api/v1/accounting/invoices/:id/void", async () => {
      const currentRes = await client.query(\`SELECT * FROM accounting.invoices WHERE id = $1\`);
      const rawDate = current.issue_date;
      const originalDate =
        typeof rawDate === "string" ? rawDate.slice(0, 10) : new Date(rawDate).toISOString().slice(0, 10);
    });
  `;
  if (checkInvoices(bad, "selftest-bad").length === 0) {
    console.error("verify-invoice-void-original-date-iso --selftest FAIL: bad void did not redden");
    process.exit(1);
  }
  const good = `
    import { pgDateColumnToIsoDay, postVoidReversal } from "./void.service.js";
    app.post("/api/v1/accounting/invoices/:id/void", async () => {
      const currentRes = await client.query(
        \`SELECT *, issue_date::text AS issue_date_iso FROM accounting.invoices WHERE id = $1\`
      );
      const originalDate = pgDateColumnToIsoDay(current.issue_date_iso ?? current.issue_date);
    });
  `;
  const goodFindings = checkInvoices(good, "selftest-good");
  if (goodFindings.length > 0) {
    console.error("verify-invoice-void-original-date-iso --selftest FAIL: good void reddened");
    for (const f of goodFindings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-invoice-void-original-date-iso --selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const findings = checkInvoices(fs.readFileSync(path.join(root, invoicesRel), "utf8"));
  if (findings.length > 0) {
    console.error("verify-invoice-void-original-date-iso FAIL:");
    for (const f of findings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-invoice-void-original-date-iso PASS");
}

main();
