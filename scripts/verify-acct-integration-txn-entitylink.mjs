#!/usr/bin/env node
/**
 * verify-acct-integration-txn-entitylink — Integration transactions reverse (44/46).
 *
 * Root cause: IntegrationTransactionsPage used raw react-router Links (including dead
 * /accounting/bills/:id patterns) and never EntityLink on queue entity_id — Law §9 reverse FAIL.
 *
 * Fix: Entity column + Linked To via EntityLink. No posting/GL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-integration-txn-entitylink";
const PAGE = "apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx";

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
  if (!src.includes("function integrationEntityKind")) {
    errors.push(`${PAGE}: must map entity_type → EntityKind`);
  }
  if (!src.includes('key: "entity_id"') || !src.includes('label: "Entity"')) {
    errors.push(`${PAGE}: must expose Entity column on entity_id`);
  }
  if (!/kind="load"/.test(src) || !/kind="bill"/.test(src) || !/matched_bill_id/.test(src)) {
    errors.push(`${PAGE}: Linked To must EntityLink load + bill matches`);
  }
  if (/Link to=\{\`\/accounting\/bills\//.test(src) || /from "react-router-dom"/.test(src)) {
    errors.push(`${PAGE}: must not use raw Link drill paths — use EntityLink`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { EntityLink } from "../../components/shared/EntityLink";
    function integrationEntityKind(t) { return "bill"; }
    { key: "entity_id", label: "Entity", render: (row) => <EntityLink kind="bill" id={row.entity_id} /> }
    <EntityLink kind="load" id={bt.matched_load_id} />
    <EntityLink kind="bill" id={bt.matched_bill_id} />
  `;
  if (check(good).length) {
    console.error(`${LABEL} SELFTEST FAILED on good fixture`);
    process.exit(1);
  }
  const bad = `import { Link } from "react-router-dom"; <Link to={\`/accounting/bills/\${id}\`}>Bill</Link>`;
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
