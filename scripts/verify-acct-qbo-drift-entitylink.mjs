#!/usr/bin/env node
/**
 * verify-acct-qbo-drift-entitylink — QBO sync drift reverse (45/46).
 *
 * Root cause: drift_log rows carried entity_id but the dashboard table showed entity_type
 * text only — no reverse drill to customer/vendor/CoA register.
 *
 * Fix: Local record column with EntityLink by drift entity_type. No posting/GL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-qbo-drift-entitylink";
const PAGE = "apps/frontend/src/pages/accounting/QBOSyncDriftDashboard.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(src) {
  const errors = [];
  if (!src) {
    errors.push(`${PAGE}: missing`);
    return errors;
  }
  if (!src.includes('from "../../components/shared/EntityLink"')) {
    errors.push(`${PAGE}: must import EntityLink`);
  }
  if (!src.includes("function driftEntityKind")) {
    errors.push(`${PAGE}: must map drift entity_type → EntityKind`);
  }
  if (!src.includes('key: "entity_id"') || !src.includes('label: "Local record"')) {
    errors.push(`${PAGE}: must expose Local record column on entity_id`);
  }
  if (!/function driftEntityKind/.test(src) || !/chart_of_accounts/.test(src) || !/return "account"/.test(src) || !/return "customer"/.test(src) || !/return "vendor"/.test(src)) {
    errors.push(`${PAGE}: must map drift entity_type to account/customer/vendor EntityKind`);
  }
  if (!/<EntityLink kind=\{kind\}/.test(src) && !/EntityLink kind=\{kind\}/.test(src)) {
    errors.push(`${PAGE}: must render EntityLink on drift entity_id`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { EntityLink } from "../../components/shared/EntityLink";
    function driftEntityKind(t) { switch (t) { case "chart_of_accounts": return "account"; case "customers": return "customer"; case "vendors": return "vendor"; } }
    { key: "entity_id", label: "Local record", render: (row) => <EntityLink kind={kind} id={row.entity_id} /> }
  `;
  if (check(good).length) {
    console.error(`${LABEL} SELFTEST FAILED on good fixture`);
    process.exit(1);
  }
  const bad = `render: (row) => row.entity_type.replace(/_/g, " ")`;
  if (check(bad).length < 3) {
    console.error(`${LABEL} SELFTEST FAILED: planted gap must fail`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`PASS: ${LABEL} --selftest`);
  process.exit(0);
}

const errors = check(read(PAGE));
if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log(`PASS: ${LABEL}`);
