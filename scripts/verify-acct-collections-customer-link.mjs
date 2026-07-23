#!/usr/bin/env node
/**
 * verify-acct-collections-customer-link — Collections reverse customer link (28/28).
 *
 * Root cause: CollectionTask.customer_id was available but the queue rendered plain
 * customer_name text and the detail panel had Invoice EntityLink only — no customer reverse.
 *
 * Fix: EntityLink kind=customer on queue + detail. No posting/GL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-collections-customer-link";
const PAGE = "apps/frontend/src/pages/accounting/CollectionsPage.tsx";

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
  const customerLinks = (src.match(/kind="customer"/g) || []).length;
  if (customerLinks < 2) {
    errors.push(`${PAGE}: must EntityLink kind=customer in queue AND detail (≥2)`);
  }
  if (!/task\.customer_id/.test(src)) {
    errors.push(`${PAGE}: must wire task.customer_id`);
  }
  if (/Unknown customer/.test(src) && !/kind="customer"/.test(src)) {
    errors.push(`${PAGE}: plain Unknown customer without EntityLink`);
  }
  // Detail panel Customer label present
  if (!src.includes(">Customer<") && !src.includes("Customer</div>")) {
    errors.push(`${PAGE}: detail panel must label Customer`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { EntityLink } from "../../components/shared/EntityLink";
    <EntityLink kind="customer" id={task.customer_id} />
    <div className="text-xs">Customer</div>
    <EntityLink kind="customer" id={detailQuery.data?.task.customer_id} />
  `;
  if (check(good).length) {
    console.error(`${LABEL} SELFTEST FAILED on good: ${check(good).join("; ")}`);
    process.exit(1);
  }
  const bad = `<div>{task.customer_name ?? "Unknown customer"}</div>`;
  if (check(bad).length < 2) {
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
