#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leafRe":"^load\\.drawer\\.factoring$","task":"LINK-F5171-LOAD-FACTORING-INVOICE-DRILL","vertical":"column-wave"} */
/**
 * LINK-F5171 — load.drawer.factoring reverse: linked invoice on the load factoring
 * checklist must EntityLink to the invoice record (not plain entityLabel text).
 *
 * Run: node scripts/verify-load-factoring-invoice-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-factoring-invoice-entitylink";
const TARGET = "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx";

function audit(src) {
  const failures = [];
  if (!/from ["'].*EntityLink["']/.test(src)) {
    failures.push(`${TARGET}: must import EntityLink`);
  }
  if (!/kind=["']invoice["']/.test(src)) {
    failures.push(`${TARGET}: invoice checklist row must EntityLink kind="invoice"`);
  }
  if (!/data-testid=["']load-factoring-invoice-link["']/.test(src)) {
    failures.push(`${TARGET}: missing data-testid=load-factoring-invoice-link`);
  }
  if (
    /note=\{hasInvoice \? entityLabel\(linkedInvoice\?\.display_id/.test(src) ||
    /note=\{hasInvoice \? entityLabel\(linkedInvoice/.test(src)
  ) {
    failures.push(`${TARGET}: invoice still rendered as plain entityLabel note (no drill)`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — live file should pass`);
    process.exit(1);
  }
  const broken = good.replace(/kind=["']invoice["']/, 'kind="load"');
  if (!audit(broken).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted kind regression not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
const failures = audit(src);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — load drawer factoring invoice EntityLink to invoice detail`);
