#!/usr/bin/env node
/**
 * Rule-17: Faro CSV import preview reverse drill (Law §9).
 * Preview must resolve invoice/customer ids and render EntityLink drill-through.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-faro-import-linkage";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertFaroImportLinkage() {
  const errors = [];
  const page = read("apps/frontend/src/pages/factoring/FaroImportPage.tsx");
  const routes = read("apps/backend/src/factoring/faro-csv-import.routes.ts");
  const service = read("apps/backend/src/factoring/faro-csv-import.ts");

  if (!/enrichFaroPreviewLines/.test(routes)) {
    errors.push("faro-csv-import.routes: preview must call enrichFaroPreviewLines");
  }
  if (!/invoice_id/.test(service) || !/customer_id/.test(service)) {
    errors.push("faro-csv-import: preview enrichment must resolve invoice_id + customer_id");
  }
  if (!/EntityLink/.test(page) || !/kind="invoice"/.test(page) || !/kind="customer"/.test(page)) {
    errors.push("FaroImportPage: preview table must EntityLink invoice + customer");
  }
  if (!/data-testid="faro-import-invoice-link"/.test(page)) {
    errors.push("FaroImportPage: invoice reverse marker missing");
  }
  return errors;
}

function selftest() {
  const good = `
    enrichFaroPreviewLines(client, companyId, lines)
    kind="invoice" invoice_id
    kind="customer" customer_id
    data-testid="faro-import-invoice-link"
  `;
  const bad = `<span>{row.invoice_number}</span>`;
  if (!/kind="invoice"/.test(good) || /kind="invoice"/.test(bad)) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertFaroImportLinkage();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

// PHANTOM-COLUMN GUARD: mdata.customers has customer_name, NOT name (0008_mdata_init.sql:100).
// The enrichment query shipped `c.name::text AS customer_name`, which raises 42703 and — because
// the throw is not a FaroCsvImportError — rethrows as a 500, killing the preview for EVERY CSV.
const faroSrc = fs.readFileSync(path.join(ROOT, "apps/backend/src/factoring/faro-csv-import.ts"), "utf8");
if (/\bc\.name\b/.test(faroSrc)) {
  console.error("FAIL: faro-csv-import references c.name — mdata.customers has customer_name, not name (42703 -> 500 on every preview)");
  process.exit(1);
}

console.log(`${LABEL} PASS`);
