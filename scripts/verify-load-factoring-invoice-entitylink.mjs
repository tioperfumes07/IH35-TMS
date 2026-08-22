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
const API = "apps/frontend/src/api/accounting.ts";
const ROUTE = "apps/backend/src/accounting/invoices.routes.ts";
const MATRIX = "docs/specs/scoreboard/modules/dispatch.required.json";

function audit(src, api, route, matrix) {
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
  if (!/queryKey: \["factoring-tab", "invoices", "by-load", operatingCompanyId, loadId\]/.test(src)) {
    failures.push(`${TARGET}: invoice reverse query key must bind company + exact load`);
  }
  if (!/listInvoices\(operatingCompanyId, \{ source_load_id: loadId, limit: 1 \}\)/.test(src)) {
    failures.push(`${TARGET}: must read the exact load invoice server-side, not client-filter a capped customer list`);
  }
  if (!/kind="invoice" id=\{linkedInvoice\.id\} name=\{linkedInvoice\.display_id\}/.test(src)) {
    failures.push(`${TARGET}: invoice drill must bind the exact returned id and human display id`);
  }
  if (!/export function listInvoices\([\s\S]{0,420}source_load_id\?: string;/.test(api) || !/export function listInvoices\([\s\S]{0,900}params\.source_load_id\) query\.set\("source_load_id", params\.source_load_id\)/.test(api)) {
    failures.push(`${API}: listInvoices must accept and serialize source_load_id`);
  }
  if (!/const listQuerySchema[\s\S]{0,500}source_load_id: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(route) || !/if \(q\.source_load_id\)[\s\S]{0,180}i\.source_load_id = \$\$\{values\.length\}::uuid/.test(route)) {
    failures.push(`${ROUTE}: invoice list must validate and filter source_load_id server-side`);
  }
  try {
    const leaf = JSON.parse(matrix).leaves?.find((item) => item.id === "load.drawer.factoring");
    if (!leaf?.required?.includes("reverse_link")) failures.push("exact dispatch load.drawer.factoring owns reverse_link");
  } catch {
    failures.push("dispatch Required matrix parses");
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
  const api = fs.readFileSync(path.join(ROOT, API), "utf8");
  const route = fs.readFileSync(path.join(ROOT, ROUTE), "utf8");
  const matrix = fs.readFileSync(path.join(ROOT, MATRIX), "utf8");
  if (audit(good, api, route, matrix).length) {
    console.error(`${LABEL} SELFTEST FAIL — live file should pass`);
    process.exit(1);
  }
  const plants = [
    ["kind", good, api, route, matrix, /kind=["']invoice["']/, 'kind="load"'],
    ["exact read", good, api, route, matrix, /source_load_id: loadId/, "customer_id: loadId"],
    ["exact id", good, api, route, matrix, /id=\{linkedInvoice\.id\}/, "id={loadId}"],
    ["api", good, api.replace("source_load_id?: string;", "source_load_missing?: string;"), route, matrix, /$^/, ""],
    ["route", good, api, route.replace("source_load_id: z.string().uuid().optional(),", ""), matrix, /$^/, ""],
    ["matrix", good, api, route, matrix.replace('"id": "load.drawer.factoring"', '"id": "load.drawer.factoring.removed"'), /$^/, ""],
  ];
  for (const [name, target, nextApi, nextRoute, nextMatrix, pattern, replacement] of plants) {
    const broken = target.replace(pattern, replacement);
    if (!audit(broken, nextApi, nextRoute, nextMatrix).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted regression not caught: ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest OK — ${plants.length}/${plants.length} production/matrix defects rejected`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
const failures = audit(
  src,
  fs.readFileSync(path.join(ROOT, API), "utf8"),
  fs.readFileSync(path.join(ROOT, ROUTE), "utf8"),
  fs.readFileSync(path.join(ROOT, MATRIX), "utf8"),
);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — load drawer factoring invoice EntityLink to invoice detail`);
