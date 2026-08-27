#!/usr/bin/env node
import fs from "node:fs";

const pageFile = "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx";
const apiFile = "apps/frontend/src/api/fuelPlanner.ts";
const page = fs.readFileSync(pageFile, "utf8");
const api = fs.readFileSync(apiFile, "utf8");

function failures(p, a) {
  const out = [];
  if (!p.includes("fuelHistoryPage, setFuelHistoryPage") || !p.includes("fuelHistoryPageCount")) out.push("history needs controlled exact paging");
  if (!p.includes("offset: (fuelHistoryPage - 1) * fuelHistoryPageSize")) out.push("history must send server offset");
  if (!p.includes('data-testid="fuel-history-server-pager"')) out.push("history pager must be mounted");
  if (!/queryKey:\s*\[\s*"fuel",\s*"transactions",[\s\S]*?deepLinkTransactionId,\s*fuelHistoryPage,\s*\]/.test(p)) out.push("query key must own every reverse filter and page");
  if (!p.includes("setFuelHistoryPage(1);") || !p.includes("fuelHistoryPage > fuelHistoryPageCount")) out.push("scope/filter and empty-page recovery required");
  if (/CappedListNotice/.test(p)) out.push("a cap notice is not navigation");
  if (!a.includes("total_count: number") || !a.includes("has_more: boolean")) out.push("canonical API must expose exact count");
  return out;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    page.replace("offset: (fuelHistoryPage - 1) * fuelHistoryPageSize,", "offset: 0,"),
    page.replace('data-testid="fuel-history-server-pager"', 'data-testid="disabled"'),
    page.replace("      fuelHistoryPage,\n    ],", "    ],"),
    page.replace("fuelHistoryPage > fuelHistoryPageCount", "false"),
    `${page}\nconst regression = CappedListNotice;`,
  ];
  const missed = mutations.filter((mutation) => failures(mutation, api).length === 0).length;
  if (missed) {
    console.error(`FAIL: selftest missed ${missed}/${mutations.length} planted regressions`);
    process.exit(1);
  }
  console.log(`PASS: selftest caught ${mutations.length}/${mutations.length} fuel-history regressions`);
  process.exit(0);
}

const found = failures(page, api);
if (found.length) {
  console.error(`FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("PASS: Fuel History mounts exact server paging across every reverse filter");
