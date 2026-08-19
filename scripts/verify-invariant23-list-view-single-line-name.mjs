#!/usr/bin/env node
/** @matrix-built {"modules":["customers","vendors"],"cols":["qbo_chrome"],"leafRe":"^list\\.view_list$","task":"FE-INVARIANT23-LIST-VIEW-SINGLE-LINE-NAME","vertical":"column-wave"} */
/**
 * FE-INVARIANT23 — Customers/Vendors list-view roster names must use the canonical
 * `.single-line-name` token (design-tokens.css §7), not rely on master-detail sidebar only.
 *
 * Run: node scripts/verify-invariant23-list-view-single-line-name.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invariant23-list-view-single-line-name";
const TARGETS = {
  vendors: "apps/frontend/src/pages/vendors/VendorsListView.tsx",
  customers: "apps/frontend/src/pages/customers/CustomersListView.tsx",
};

function audit(sources) {
  const failures = [];
  for (const [key, rel] of Object.entries(TARGETS)) {
    const src = sources[rel] ?? fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (!/key:\s*"name"/.test(src)) {
      failures.push(`${rel}: missing name column`);
    }
    if (!/className="single-line-name/.test(src)) {
      failures.push(`${rel}: roster name cell must include single-line-name wrapper`);
    }
    if (!/title=\{row\.name\}/.test(src)) {
      failures.push(`${rel}: roster name wrapper must expose title={row.name} for ellipsis hover`);
    }
    if (!/kind="(vendor|customer)"/.test(src)) {
      failures.push(`${rel}: roster must EntityLink kind vendor/customer`);
    }
    if (key === "customers" && !/EntityLinkOrTombstone/.test(src)) {
      failures.push(`${rel}: customer roster must use EntityLinkOrTombstone`);
    }
    if (key === "vendors" && !/EntityLinkOrTombstone/.test(src)) {
      failures.push(`${rel}: vendor roster must use EntityLinkOrTombstone`);
    }
    if (key === "vendors" && !/data-testid="vendor-roster-record-link"/.test(src)) {
      failures.push(`${rel}: missing vendor-roster-record-link test id`);
    }
    if (key === "customers" && !/data-testid="customer-roster-record-link"/.test(src)) {
      failures.push(`${rel}: missing customer-roster-record-link test id`);
    }
  }
  return failures;
}

function loadSources(root = ROOT) {
  return Object.fromEntries(
    Object.values(TARGETS).map((rel) => [rel, fs.readFileSync(path.join(root, rel), "utf8")])
  );
}

if (process.argv.includes("--selftest")) {
  const live = loadSources();
  if (audit(live).length) {
    console.error(`${LABEL} SELFTEST FAIL — live sources should pass:\n- ${audit(live).join("\n- ")}`);
    process.exit(1);
  }
  for (const [rel, planted] of [
    [TARGETS.vendors, live[TARGETS.vendors].replace(/single-line-name /, "")],
    [TARGETS.customers, live[TARGETS.customers].replace(/title=\{row\.name\}/, "")],
  ]) {
    if (!audit({ ...live, [rel]: planted }).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted defect in ${rel} not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = audit(loadSources());
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers/vendors list-view roster names use single-line-name`);
