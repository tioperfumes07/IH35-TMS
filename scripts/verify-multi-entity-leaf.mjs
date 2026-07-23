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

function assertMultiEntityLeaf(sources) {
  const errors = [];
  const page = sources?.page ?? read("apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx");

  if (!/EntityLink/.test(page) || !/kind="account"/.test(page) || !/row\.account_id/.test(page)) {
    errors.push("MultiEntityAccountingPage: accounts table must EntityLink GL account_id");
  }
  if (!/data-testid="multi-entity-account-link"/.test(page)) {
    errors.push("MultiEntityAccountingPage: account reverse marker missing");
  }
  return errors;
}

/**
 * Planted-regression selftest: runs the REAL assertion against MUTATED COPIES of the REAL file.
 * The previous version compared two string literals declared inside this script and never read the
 * repo, so it exited 0 even against a broken page — it proved nothing.
 */
function selftest() {
  const PAGE = "apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx";
  const live = { page: read(PAGE) };
  const problems = [];

  const liveErrors = assertMultiEntityLeaf(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    ["EntityLink removed", { page: live.page.replace(/kind="account"/g, "kind=\"nope\"") }, "must EntityLink GL account_id"],
    ["reverse marker removed", { page: live.page.replace(/data-testid="multi-entity-account-link"/g, "") }, "reverse marker missing"],
  ];
  for (const [name, mutated, expect] of cases) {
    if (mutated.page === live.page) { problems.push(`planted regression "${name}" did not mutate the source — selftest is inert`); continue; }
    if (!assertMultiEntityLeaf(mutated).some((e) => e.includes(expect))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const pr of problems) console.error("  •", pr);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — live source clean; ${cases.length} planted regressions caught`);
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
