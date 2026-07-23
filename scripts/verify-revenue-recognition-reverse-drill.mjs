#!/usr/bin/env node
/**
 * Rule-17: revenue recognition reverse drill — contract detail must EntityLink source invoice/load/customer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-revenue-recognition-reverse-drill";
const PAGE = "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertRevenueRecognitionReverse() {
  const errors = [];
  const page = read(PAGE);
  const api = read("apps/frontend/src/api/revenue-recognition.ts");
  const manifest = read("apps/frontend/src/routes/manifest.tsx");

  if (!/from "\.\.\/\.\.\/components\/shared\/EntityLink"/.test(page)) {
    errors.push(`${PAGE}: must import EntityLink`);
  }
  if (!/data-testid="revenue-recognition-reverse-drill"/.test(page)) {
    errors.push(`${PAGE}: reverse drill marker missing`);
  }
  if (!/kind="invoice"/.test(page) || !/detail\.source_invoice_id/.test(page)) {
    errors.push(`${PAGE}: must EntityLink detail.source_invoice_id`);
  }
  if (!/kind="load"/.test(page) || !/detail\.source_load_id/.test(page)) {
    errors.push(`${PAGE}: must EntityLink detail.source_load_id`);
  }
  if (!/kind="customer"/.test(page) || !/detail\.customer_uuid/.test(page)) {
    errors.push(`${PAGE}: must EntityLink detail.customer_uuid`);
  }
  if (!/source_invoice_id/.test(api) || !/source_load_id/.test(api)) {
    errors.push("revenue-recognition API types must expose source_invoice_id + source_load_id");
  }
  if (!/\/accounting\/revenue-recognition/.test(manifest)) {
    errors.push("manifest: /accounting/revenue-recognition route missing");
  }
  return errors;
}

function selftest() {
  const good = `
    data-testid="revenue-recognition-reverse-drill"
    <EntityLink kind="invoice" id={detail.source_invoice_id} />
    <EntityLink kind="load" id={detail.source_load_id} />
    <EntityLink kind="customer" id={detail.customer_uuid} />
  `;
  const bad = `<p>{detail.description}</p>`;
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

const errors = assertRevenueRecognitionReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
