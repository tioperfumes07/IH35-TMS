#!/usr/bin/env node
/**
 * LV-PROGRAM-MODULES-FILTER-CONTROL-ABSENT
 * LV-SYSTEM-PROGRAM-FILTER-CONTROL-ABSENT
 * LV-CASH-FLOW-ACTUAL-FILTER-PANEL-ABSENT
 *
 * Exact Live leaves claimed chrome.toolbar_filter but mounted ParityTable without a governed
 * CollapsedListFilters panel + Apply/Cancel/Reset. Date-range Apply on cash-flow is NOT the filter panel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SURFACES = [
  {
    id: "program",
    file: "apps/frontend/src/pages/program/ModuleCompletionPage.tsx",
    route: "/program/modules",
  },
  {
    id: "system",
    file: "apps/frontend/src/pages/system/SystemModulePage.tsx",
    route: "/system?tab=program",
  },
  {
    id: "cash-flow",
    file: "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx",
    route: "/cash-flow?tab=actual_vs_projected",
  },
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectFailures(sources) {
  const failures = [];
  for (const surface of SURFACES) {
    const src = sources[surface.file] ?? "";
    if (!src.includes("CollapsedListFilters")) {
      failures.push(`${surface.id} (${surface.route}): must mount CollapsedListFilters for chrome.toolbar_filter`);
    }
    if (!/\bonApply=\{/.test(src)) {
      failures.push(`${surface.id}: CollapsedListFilters must wire onApply (no silent apply)`);
    }
    if (!/\bonReset=\{/.test(src)) {
      failures.push(`${surface.id}: CollapsedListFilters must wire onReset`);
    }
    if (!/\bonCancel=\{/.test(src)) {
      failures.push(`${surface.id}: CollapsedListFilters must wire onCancel`);
    }
    if (!src.includes("useStagedListFilters")) {
      failures.push(`${surface.id}: must stage drafts via useStagedListFilters`);
    }
    if (!/<ParityTable[\s\S]*rows=\{/.test(src) && !/<ParityTable[\s\S]*rows=\{/.test(src)) {
      failures.push(`${surface.id}: must retain ParityTable consumer`);
    }
  }
  // Cash-flow: date Apply alone must not be the only Apply — require Filters toggle prefix
  const cash = sources[SURFACES[2].file] ?? "";
  if (!/testIdPrefix="cash-flow-avp"/.test(cash) && !/data-cash-flow-avp-filter-toolbar/.test(cash)) {
    failures.push("cash-flow: Filters panel must be distinct from the date-range Apply control");
  }
  return failures;
}

function load() {
  return Object.fromEntries(SURFACES.map((s) => [s.file, read(s.file)]));
}

const sources = load();
const failures = collectFailures(sources);
if (failures.length) {
  console.error(`program/system/cash-flow filter-panel guard failed:\n${failures.map((f) => `- ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    () => ({ ...sources, [SURFACES[0].file]: sources[SURFACES[0].file].replaceAll("CollapsedListFilters", "BrokenFilters") }),
    () => ({ ...sources, [SURFACES[1].file]: sources[SURFACES[1].file].replace(/\bonApply=\{/g, "onIgnore={") }),
    () => ({ ...sources, [SURFACES[2].file]: sources[SURFACES[2].file].replaceAll("useStagedListFilters", "useBrokenFilters") }),
    () => ({
      ...sources,
      [SURFACES[2].file]: sources[SURFACES[2].file]
        .replace(/testIdPrefix="cash-flow-avp"/g, 'testIdPrefix="broken"')
        .replace(/data-cash-flow-avp-filter-toolbar/g, "data-broken"),
    }),
  ];
  mutations.forEach((mutate, index) => {
    if (!collectFailures(mutate()).length) {
      throw new Error(`self-test mutation ${index + 1} survived`);
    }
  });
  console.log(`PASS: ${mutations.length} planted missing-Filters-panel defects were rejected`);
}

console.log("PASS: program/system/cash-flow exact filter panels mount CollapsedListFilters + staged Apply");
