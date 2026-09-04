#!/usr/bin/env node
/**
 * verify-load-costs-tab-advance-received-wired.mjs
 *
 * SET-15. SET-24 shipped the ONE write path for a broker advance
 * (POST /api/v1/accounting/broker-advances, broker-advances.routes.ts) but named a real, honest
 * blocker: the hosting screen (tab 13's stacked cost-entry rows, where "advance received" becomes
 * its own row type) did not exist yet. This guard proves the hosting screen now calls that SAME
 * endpoint -- BLOCK-B rule 6 (one write path, the tab calls the same endpoint everything else
 * uses) -- rather than inventing a second write path or leaving the backend unreachable from the
 * UI.
 *
 * Source-level regression lock (CI has no reachable Postgres, same pattern as every other guard
 * this session).
 */
import { readFileSync } from "node:fs";

const TAB_PATH = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";
const ACCOUNTING_API_PATH = "apps/frontend/src/api/accounting.ts";

function loadSource(path) {
  return readFileSync(path, "utf8");
}

export function collectFailures(tabSrc, accountingApiSrc) {
  const failures = [];

  if (!accountingApiSrc) {
    failures.push(`${ACCOUNTING_API_PATH} not found`);
  } else {
    if (!/export function createBrokerAdvance\(/.test(accountingApiSrc)) {
      failures.push("createBrokerAdvance is not exported from the accounting API client");
    }
    if (!/"\/api\/v1\/accounting\/broker-advances"/.test(accountingApiSrc)) {
      failures.push("createBrokerAdvance does not call POST /api/v1/accounting/broker-advances -- the ONE write path broker-advances.routes.ts names");
    }
  }

  if (!tabSrc) {
    failures.push(`${TAB_PATH} not found`);
    return failures;
  }

  if (!/createBrokerAdvance/.test(tabSrc)) {
    failures.push("LoadDetailCostsTab.tsx does not import/call createBrokerAdvance -- the advance-received row type has no write path wired");
  }
  if (!/data-testid="load-cost-toggle-advance"/.test(tabSrc)) {
    failures.push('the "Advance received" toggle button (load-cost-toggle-advance) is missing');
  }
  if (!/kind === "advance"/.test(tabSrc)) {
    failures.push('no branch checks kind === "advance" -- the advance row type is not distinguished from expense/bill');
  }
  // The save mutation must actually call createBrokerAdvance inside an advance branch, not just
  // reference the import unused.
  const saveMutationMatch = tabSrc.match(/const save = useMutation\(\{[\s\S]*?onError: \(error\) => pushToast[\s\S]{0,200}?\}\);/);
  if (!saveMutationMatch) {
    failures.push("could not find the save mutation -- source shape drifted, guard needs review");
  } else if (!/await createBrokerAdvance\(/.test(saveMutationMatch[0])) {
    failures.push("the save mutation never calls createBrokerAdvance -- an advance draft can be filled in but never persisted");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tabSrc = loadSource(TAB_PATH);
  const accountingApiSrc = loadSource(ACCOUNTING_API_PATH);
  const baseline = collectFailures(tabSrc, accountingApiSrc);
  if (baseline.length) {
    console.error(`verify-load-costs-tab-advance-received-wired SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }

  const escaped = [];

  const badTab1 = tabSrc.replace('data-testid="load-cost-toggle-advance"', 'data-testid="load-cost-toggle-advance-removed"');
  if (badTab1 === tabSrc || collectFailures(badTab1, accountingApiSrc).length === 0) {
    escaped.push("advance-received toggle button testid removed");
  }

  const badTab2 = tabSrc.replace("await createBrokerAdvance(", "await Promise.resolve(/* createBrokerAdvance(");
  if (badTab2 === tabSrc || collectFailures(badTab2, accountingApiSrc).length === 0) {
    escaped.push("save mutation's createBrokerAdvance call removed");
  }

  const badApi = accountingApiSrc.replace('"/api/v1/accounting/broker-advances"', '"/api/v1/accounting/advances"');
  if (badApi === accountingApiSrc || collectFailures(tabSrc, badApi).length === 0) {
    escaped.push("createBrokerAdvance's endpoint path drifted from the backend route");
  }

  if (escaped.length) {
    console.error(`verify-load-costs-tab-advance-received-wired SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-load-costs-tab-advance-received-wired SELFTEST PASS — 3/3 plants rejected");
}

const tabSrc = loadSource(TAB_PATH);
const accountingApiSrc = loadSource(ACCOUNTING_API_PATH);
const failures = collectFailures(tabSrc, accountingApiSrc);
if (failures.length > 0) {
  console.error("verify-load-costs-tab-advance-received-wired: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-load-costs-tab-advance-received-wired: OK — Load Costs tab 13's Advance received row type calls the SAME broker-advances write path SET-24 shipped"
);
