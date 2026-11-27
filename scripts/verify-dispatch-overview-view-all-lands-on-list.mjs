#!/usr/bin/env node
/**
 * DISPATCH item #7 (owner 2026-09-04): two Overview panels used
 * viewAllHref="/dispatch?view=loads", and parseViewMode (Dispatch.tsx) maps
 * "loads" → "kanban", so "View all →" landed on the Kanban instead of a list.
 * Point them at the list (?view=list).
 *
 * Self-testing static guard (root band — Rule 37). Run:
 *   node scripts/verify-dispatch-overview-view-all-lands-on-list.mjs [--selftest]
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";
const original = { overview: fs.readFileSync(FILE, "utf8") };

const contracts = [
  // Since #29385 (ROUND 8.20) the hrefs go through overviewHref(), which carries the Overview's return context; the target view is the same.
  [
    "no Overview panel routes View-all to the loads(→kanban) view",
    "overview",
    (s) => !s.includes('viewAllHref="/dispatch?view=loads"') && !s.includes('viewAllHref={overviewHref("/dispatch?view=loads")}'),
    (s) => s.replace('viewAllHref={overviewHref("/dispatch?view=list")}', 'viewAllHref={overviewHref("/dispatch?view=loads")}'),
  ],
  [
    "Unassigned units View-all lands on the list",
    "overview",
    (s) => /title="Unassigned units" viewAllHref=\{overviewHref\("\/dispatch\?view=list"\)\}/.test(s),
    (s) => s.replace('title="Unassigned units" viewAllHref={overviewHref("/dispatch?view=list")}', 'title="Unassigned units" viewAllHref={overviewHref("/dispatch?view=kanban")}'),
  ],
  [
    "Round-trip exposure View-all lands on the list",
    "overview",
    (s) => /title="Round-trip exposure" viewAllHref=\{overviewHref\("\/dispatch\?view=list"\)\}/.test(s),
    (s) => s.replace('title="Round-trip exposure" viewAllHref={overviewHref("/dispatch?view=list")}', 'title="Round-trip exposure" viewAllHref={overviewHref("/dispatch?view=kanban")}'),
  ],
];

function audit(sources) {
  return contracts.filter(([, key, test]) => !test(sources[key])).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(
    `[verify-dispatch-overview-view-all-lands-on-list] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`,
  );
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, , mutate] of contracts) {
    const mutated = { ...original, [key]: mutate(original[key]) };
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(
    `[verify-dispatch-overview-view-all-lands-on-list] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`,
  );
  process.exit(0);
}

console.log("[verify-dispatch-overview-view-all-lands-on-list] OK");
