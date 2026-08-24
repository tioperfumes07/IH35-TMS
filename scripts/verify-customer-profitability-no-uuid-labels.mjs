#!/usr/bin/env node
/**
 * verify-customer-profitability-no-uuid-labels.mjs
 * LV-REPORTS-CUSTOMER-PROFITABILITY-RAW-UUID-LABELS
 * + LV-REPORTS-CUSTOMER-PROFITABILITY-DEAD-TOMBSTONE-LINK residual
 *
 * Report API must never emit UUID-shaped customer_name; FE chart/CSV must use
 * entityLabel (never raw UUID axis labels). Unresolved "Customer — not visible"
 * rows must be non-interactive tombstones (no EntityLink href / no row drill).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-customer-profitability-no-uuid-labels";
const API = "apps/backend/src/reports/customer-profitability.routes.ts";
const PAGE = "apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const api = read(API);
  if (/customer_name:\s*nameMap\.get\(customerId\)\s*\?\?\s*customerId/.test(api)) {
    failures.push("API must not fall back customer_name to raw customerId UUID");
  }
  if (!/Customer — not visible/.test(api)) {
    failures.push('API must tombstone unresolved names as "Customer — not visible"');
  }
  if (/\.catch\(\(\) => \(\{ rows: \[\] as Array<\{ customer_id: string; cost_cents/.test(api)) {
    failures.push("API must not catch a failed driver-bill cost aggregate as empty — that paints $0 cost");
  }
  if (/\.catch\(\(\) => \(\{ rows: \[\] as Array<\{ customer_id: string; open_cents/.test(api)) {
    failures.push("API must not catch a failed AR-open aggregate as empty — that paints $0 AR");
  }
  const page = read(PAGE);
  if (!/isUnresolvedCustomerTombstone/.test(page)) {
    failures.push("page must gate drills with isUnresolvedCustomerTombstone");
  }
  if (!/customer-profitability-tombstone/.test(page)) {
    failures.push("page must render non-interactive tombstone test id for unresolved customers");
  }
  if (/render:\s*\(r\)\s*=>\s*<EntityLink\s+kind="customer"/.test(page)) {
    failures.push("customer column must not unconditionally mount EntityLink");
  }
  if (!/EntityLink\s+kind="customer"/.test(page)) {
    failures.push("resolvable customers must still mount EntityLink kind=customer");
  }
  if (!/if\s*\(isUnresolvedCustomerTombstone\(r\)\)\s*return;/.test(page)) {
    failures.push("onRowClick must no-op for unresolved customer tombstones");
  }
  const chart = page.match(/top5Chart\s*=\s*useMemo\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[query\.data\?\.by_customer\]\)/);
  if (!chart) {
    failures.push("top5Chart useMemo missing");
  } else if (!/customerDisplayLabel\(r\)/.test(chart[1]) && !/entityLabel\(r\.customer_name,\s*r\.customer_id,\s*"Customer"\)/.test(chart[1])) {
    failures.push("top5Chart must label via customerDisplayLabel/entityLabel");
  }
  if (!/customerDisplayLabel\(r\)/.test(page) && !/entityLabel\(r\.customer_name,\s*r\.customer_id,\s*"Customer"\)/.test(page)) {
    failures.push("page must use customerDisplayLabel/entityLabel for customer display paths");
  }
  const csv = page.match(/function exportCsv\([\s\S]*?\n  \}/);
  if (csv && !/customerDisplayLabel\(r\)/.test(csv[0]) && !/entityLabel\(r\.customer_name,\s*r\.customer_id,\s*"Customer"\)/.test(csv[0])) {
    failures.push("CSV export must use customerDisplayLabel/entityLabel, not raw customer_name");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const customerColStart = original.indexOf('key: "customer_name"');
    const customerColEnd = original.indexOf('key: "load_count"', customerColStart);
    if (customerColStart < 0 || customerColEnd < 0) fail("selftest could not locate customer_name column");
    // Back up to the opening `{` of the column object.
    const objectStart = original.lastIndexOf("{", customerColStart);
    const badLink =
      original.slice(0, objectStart) +
      '{ key: "customer_name", label: "Customer", sortable: true, render: (r) => <EntityLink kind="customer" id={r.customer_id} label={customerDisplayLabel(r)} className="font-medium text-gray-900" /> },\n      { ' +
      original.slice(customerColEnd);
    fs.writeFileSync(pagePath, badLink);
    const plantedLink = analyze();
    if (!plantedLink.some((m) => /unconditionally mount EntityLink|tombstone test id/.test(m))) {
      fail(`selftest expected unconditional EntityLink fail; got: ${plantedLink.join("; ")}`);
    }

    const badClick = original.replace(
      "if (isUnresolvedCustomerTombstone(r)) return;\n              navigate(`/customers/${r.customer_id}?tab=billing`);",
      "navigate(`/customers/${r.customer_id}?tab=billing`);",
    );
    if (badClick === original) fail("selftest could not plant unconditional onRowClick");
    fs.writeFileSync(pagePath, badClick);
    const plantedClick = analyze();
    if (!plantedClick.some((m) => /onRowClick must no-op/.test(m))) {
      fail(`selftest expected onRowClick fail; got: ${plantedClick.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(pagePath, original);
  }

  const apiPath = path.join(process.cwd(), API);
  const apiOriginal = fs.readFileSync(apiPath, "utf8");
  try {
    const bad = apiOriginal.replace(
      /customer_name:\s*nameMap\.get\(customerId\)\s*\?\?\s*"[^"]+",/,
      "customer_name: nameMap.get(customerId) ?? customerId,",
    );
    if (bad === apiOriginal) fail("selftest could not plant UUID fallback");
    fs.writeFileSync(apiPath, bad);
    const planted = analyze();
    if (!planted.some((m) => /raw customerId/.test(m))) fail("selftest expected UUID fallback to fail");
  } finally {
    fs.writeFileSync(apiPath, apiOriginal);
  }

  try {
    const withCatch =
      apiOriginal +
      `\n.catch(() => ({ rows: [] as Array<{ customer_id: string; cost_cents: string }> }));\n`;
    fs.writeFileSync(apiPath, withCatch);
    const plantedCatch = analyze();
    if (!plantedCatch.some((m) => /cost aggregate as empty/.test(m))) {
      fail(`selftest expected cost catch fail; got: ${plantedCatch.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(apiPath, apiOriginal);
  }

  const good = analyze();
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — customer profitability has no UUID labels and tombstones are non-interactive`);
