#!/usr/bin/env node
/**
 * ACCT-F5792 — CUSTOMERS-PAGER-TOTAL-MISMATCH-ON-INACTIVE-ALL-TABS. Customers.tsx's pager
 * totalCount (customersServerTotal) always read customersQuery.data?.total -- the ACTIVE-only
 * server COUNT (PAGER-SERVERTOTAL-01: intentionally a real server total, never derived from
 * .length). That is correct for the Active tab, but once ACCT-F5789/F5790 wired a real, non-zero
 * Inactive tab (fullCustomersRoster merges an active + a separate inactive query), the pager
 * kept showing the ACTIVE total underneath the Inactive tab regardless -- live-confirmed on
 * https://app.ih35dispatch.com/customers?listTab=inactive: header said "Inactive (13)" (correct,
 * from customerTabCounts / fullCustomersRoster.length) while the pager underneath said
 * "1-12 of 12" (the stale active-only server total, 12 == Active tab's real count).
 *
 * Fixed additively, still honoring PAGER-SERVERTOTAL-01 (never derive from .length): pick the
 * correct AUTHORITATIVE SERVER total per listStatus -- inactiveCustomersQuery's own total for
 * the Inactive tab, the sum of both real server totals for the All tab, and the unchanged
 * customersQuery total for every other (active-scoped) tab.
 *
 * INVARIANT (static — no database): Customers.tsx must branch customersServerTotal on
 * listStatus (inactive -> inactiveCustomersQuery.data?.total, all -> sum of both totals,
 * otherwise -> customersQuery.data?.total, unchanged from before this fix).
 *
 * Self-test: node scripts/verify-customers-pager-total-tab-aware.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_FILE = "apps/frontend/src/pages/Customers.tsx";
const LABEL = "verify-customers-pager-total-tab-aware";

export function checkPageSource(src) {
  const problems = [];
  if (!/listStatus === "inactive"\s*\n\s*\? inactiveCustomersQuery\.data\?\.total \?\? 0/.test(src)) {
    problems.push("customersServerTotal no longer branches to inactiveCustomersQuery's own total for the Inactive tab — the pager would show the stale active-only total again");
  }
  if (!/listStatus === "all"\s*\n\s*\? \(customersQuery\.data\?\.total \?\? 0\) \+ \(inactiveCustomersQuery\.data\?\.total \?\? 0\)/.test(src)) {
    problems.push("customersServerTotal no longer sums both server totals for the All tab");
  }
  if (!/: customersQuery\.data\?\.total \?\? 0;/.test(src)) {
    problems.push("customersServerTotal's default (active-scoped tabs) branch is missing or no longer falls back to customersQuery's own total");
  }
  return problems;
}

function selftest() {
  const goodSrc = `
    const customersServerTotal =
      listStatus === "inactive"
        ? inactiveCustomersQuery.data?.total ?? 0
        : listStatus === "all"
          ? (customersQuery.data?.total ?? 0) + (inactiveCustomersQuery.data?.total ?? 0)
          : customersQuery.data?.total ?? 0;
  `;

  const cases = [
    { name: "good source", src: goodSrc, expectProblems: false },
    {
      name: "reverted to always active-only total",
      src: `const customersServerTotal = customersQuery.data?.total ?? 0;`,
      expectProblems: true,
    },
    {
      name: "inactive branch removed (all-only left)",
      src: goodSrc.replace(
        /listStatus === "inactive"\s*\n\s*\? inactiveCustomersQuery\.data\?\.total \?\? 0\s*\n\s*: /,
        ""
      ),
      expectProblems: true,
    },
    {
      name: "all branch reverted to not summing",
      src: goodSrc.replace(
        `(customersQuery.data?.total ?? 0) + (inactiveCustomersQuery.data?.total ?? 0)`,
        `customersQuery.data?.total ?? 0`
      ),
      expectProblems: true,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = checkPageSource(c.src);
    const hasProblems = problems.length > 0;
    const ok = hasProblems === c.expectProblems;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] expectProblems=${c.expectProblems} got=${problems.length}`);
    if (!ok) {
      failed++;
      for (const p of problems) console.log(`    - ${p}`);
    }
  }
  if (failed > 0) {
    console.error(`${LABEL} --selftest FAILED: ${failed} case(s)`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — ${cases.length} cases`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const pagePath = path.join(ROOT, PAGE_FILE);
  if (!fs.existsSync(pagePath)) {
    console.error(`${LABEL}: FAIL — ${PAGE_FILE} not found`);
    process.exit(1);
  }

  const src = fs.readFileSync(pagePath, "utf8");
  const problems = checkPageSource(src);

  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(`${LABEL}: OK — Customers.tsx's pager total picks the correct authoritative server COUNT per listStatus (Inactive tab's own total, All tab's summed total, unchanged active-only default elsewhere).`);
}

main();
