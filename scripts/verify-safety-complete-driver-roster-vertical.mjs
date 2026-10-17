#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./verify-drivers-home-complete-roster.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Heavy CI peel — re-pointed, same rule: 52699c6c2f (#26871, 443.182-A catalog one-source consolidation) moved
// listDrivers / listAllDrivers into api/catalog-drivers.ts; api/mdata.ts re-exports them (callers unchanged).
const REL = {
  api: "apps/frontend/src/api/catalog-drivers.ts",
  mdataApi: "apps/frontend/src/api/mdata.ts",
  hos: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
  cards: "apps/frontend/src/components/safety/DriverSafetyCards.tsx",
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function verify(sources = {}) {
  const api = sources.api ?? read(REL.api);
  const mdataApi = sources.mdataApi ?? read(REL.mdataApi);
  const hos = sources.hos ?? read(REL.hos);
  const cards = sources.cards ?? read(REL.cards);
  const checks = [
    ["shared complete-roster helper", /export async function listAllDrivers/.test(api)],
    ["mdata.ts re-exports the one helper", /export \{[^}]*\blistAllDrivers\b[^}]*\} from "\.\/catalog-drivers"/.test(mdataApi) && !/export async function listAllDrivers/.test(mdataApi)],
    ["helper pages by exact server total", /for \(let pageIndex = 1; covered < expected/.test(api) && /offset: pageIndex \* pageSize/.test(api)],
    ["helper rejects incomplete scan", /throw new Error\(`Driver roster paging stopped/.test(api)],
    ["helper deduplicates canonical IDs", /new Map\(drivers\.map\(\(driver\) => \[driver\.id, driver\]\)\)/.test(api)],
    ["HOS reads complete roster", /listAllDrivers\(\{[\s\S]*?status: "Active"/.test(hos)],
    ["HOS has no capped-list disclosure", !/CappedListNotice/.test(hos) && !/limit:\s*200/.test(hos)],
    ["HOS preserves server search", /search:\s*fleetSearch \|\| undefined/.test(hos)],
    ["HOS bounds detail fan-out", /detailBatchSize = 20/.test(hos) && /drivers\.slice\(start, start \+ detailBatchSize\)/.test(hos)],
    ["safety cards read complete roster", /listAllDrivers\(\{[\s\S]*?status: "Active"/.test(cards)],
    ["safety cards have no capped roster", !/listDrivers\(\{[\s\S]*?limit:\s*200/.test(cards)],
    ["safety cards preserve server search", /search:\s*rosterSearch \|\| undefined/.test(cards)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const live = { api: read(REL.api), mdataApi: read(REL.mdataApi), hos: read(REL.hos), cards: read(REL.cards) };
  const mutations = [
    ["first page only", { ...live, api: live.api.replace("for (let pageIndex = 1; covered < expected", "for (let pageIndex = 1; false") }],
    ["second helper copy in mdata.ts", { ...live, mdataApi: live.mdataApi + "\nexport async function listAllDrivers() {}\n" }],
    ["HOS cap", { ...live, hos: live.hos.replace("listAllDrivers({", "listDrivers({\n    limit: 200,") }],
    ["unbounded HOS fan-out", { ...live, hos: live.hos.replace("detailBatchSize = 20", "detailBatchSize = drivers.length") }],
    ["cards cap", { ...live, cards: live.cards.replace("listAllDrivers({", "listDrivers({\n        limit: 200,") }],
  ];
  for (const [name, mutated] of mutations) {
    if (verify(mutated).length === 0) throw new Error(`selftest did not catch ${name}`);
  }
  console.log(`PASS: selftest caught ${mutations.length} complete-roster regressions`);
} else {
  const failures = verify();
  if (failures.length) {
    console.error(`FAIL: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS: HOS dashboard and Driver Safety Cards scan the complete scoped driver roster");
}
