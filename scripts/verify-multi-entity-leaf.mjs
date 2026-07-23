#!/usr/bin/env node
/**
 * Rule-17: Multi-entity accounting leaf reverse drill (Law §9).
 * Consolidated summary tables must drill to entity P&L and GL account register.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-multi-entity-leaf";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertMultiEntityLeaf() {
  const errors = [];
  const page = read("apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx");

  if (!/EntityLink/.test(page) || !/kind="account"/.test(page) || !/row\.account_id/.test(page)) {
    errors.push("MultiEntityAccountingPage: accounts table must EntityLink GL account_id");
  }
  if (!/data-testid="multi-entity-account-link"/.test(page)) {
    errors.push("MultiEntityAccountingPage: account reverse marker missing");
  }
  return errors;
}

function selftest() {
  const good = `
    kind="account" id={row.account_id}
    data-testid="multi-entity-account-link"
  `;
  const bad = `<span>{row.account_name}</span>`;
  if (!/kind="account"/.test(good) || /kind="account"/.test(bad)) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertMultiEntityLeaf();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
