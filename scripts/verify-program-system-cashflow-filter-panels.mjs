#!/usr/bin/env node
/**
 * LV-PROGRAM-MODULES-FILTER-CONTROL-ABSENT
 * LV-SYSTEM-PROGRAM-FILTER-CONTROL-ABSENT
 * LV-CASH-FLOW-ACTUAL-FILTER-PANEL-ABSENT
 * LV-INSURANCE-LAWSUITS-FILTER-PANEL-ABSENT
 * LV-DRIVERS-TABLE-FILTER-PANEL-ABSENT
 * LV-LEGAL-MATTERS-FILTER-LEAF-THEATER
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
  {
    id: "insurance-lawsuits",
    file: "apps/frontend/src/pages/insurance/LawsuitsTab.tsx",
    route: "/safety/insurance/lawsuits",
  },
  {
    id: "drivers-table",
    file: "apps/frontend/src/pages/drivers/DriversTable.tsx",
    route: "/drivers",
  },
  {
    id: "legal-matters",
    file: "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
    route: "/legal/matters",
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
    if (!/<ParityTable[\s\S]*rows=\{/.test(src)) {
      failures.push(`${surface.id}: must retain ParityTable consumer`);
    }
  }
  // Cash-flow: date Apply alone must not be the only Apply — require Filters toggle prefix
  const cash = sources[SURFACES[2].file] ?? "";
  if (!/testIdPrefix="cash-flow-avp"/.test(cash) && !/data-cash-flow-avp-filter-toolbar/.test(cash)) {
    failures.push("cash-flow: Filters panel must be distinct from the date-range Apply control");
  }
  // Insurance: Filters must bind to Lawsuits exact owner (not alias /insurance + UniversalListToolbar)
  const insuranceReq = sources["docs/specs/scoreboard/modules/insurance.required.json"] ?? "";
  if (insuranceReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"route_hint": "\/safety\/insurance\/lawsuits"/.test(insuranceReq)) {
      failures.push("insurance.required.json: chrome.toolbar_filter route_hint must be /safety/insurance/lawsuits");
    }
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/insurance\/LawsuitsTab\.tsx"/.test(insuranceReq)) {
      failures.push("insurance.required.json: chrome.toolbar_filter surface_path must be LawsuitsTab.tsx");
    }
  }
  const lawsuits = sources[SURFACES[3].file] ?? "";
  if (!/testIdPrefix="insurance-lawsuits"/.test(lawsuits) && !/data-insurance-lawsuits-filter-toolbar/.test(lawsuits)) {
    failures.push("insurance-lawsuits: Filters panel must use insurance-lawsuits testId/data attribute");
  }
  const drivers = sources[SURFACES[4].file] ?? "";
  if (!/testIdPrefix="drivers-table"/.test(drivers) && !/data-drivers-table-filter-toolbar/.test(drivers)) {
    failures.push("drivers-table: Filters panel must use drivers-table testId/data attribute");
  }
  const legalReq = sources["docs/specs/scoreboard/modules/legal.required.json"] ?? "";
  if (legalReq) {
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"route_hint": "\/legal\/matters"/.test(legalReq)) {
      failures.push("legal.required.json: chrome.toolbar_filter route_hint must be /legal/matters");
    }
    if (!/"id": "chrome\.toolbar_filter"[\s\S]*?"surface_path": "pages\/legal\/matters\/LegalMattersListPage\.tsx"/.test(legalReq)) {
      failures.push("legal.required.json: chrome.toolbar_filter surface_path must be LegalMattersListPage.tsx");
    }
  }
  const legal = sources[SURFACES[5].file] ?? "";
  if (!/testIdPrefix="legal-matters"/.test(legal) && !/data-legal-matters-filter-toolbar/.test(legal)) {
    failures.push("legal-matters: Filters panel must use legal-matters testId/data attribute");
  }
  return failures;
}

function load() {
  const map = Object.fromEntries(SURFACES.map((s) => [s.file, read(s.file)]));
  map["docs/specs/scoreboard/modules/insurance.required.json"] = read(
    "docs/specs/scoreboard/modules/insurance.required.json",
  );
  map["docs/specs/scoreboard/modules/legal.required.json"] = read(
    "docs/specs/scoreboard/modules/legal.required.json",
  );
  return map;
}

const sources = load();
const failures = collectFailures(sources);
if (failures.length) {
  console.error(`filter-panel guard failed:\n${failures.map((f) => `- ${f}`).join("\n")}`);
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
    () => ({
      ...sources,
      [SURFACES[3].file]: sources[SURFACES[3].file].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/insurance.required.json": sources[
        "docs/specs/scoreboard/modules/insurance.required.json"
      ].replaceAll('"/safety/insurance/lawsuits"', '"/insurance"'),
    }),
    () => ({
      ...sources,
      [SURFACES[4].file]: sources[SURFACES[4].file].replaceAll("CollapsedListFilters", "BrokenFilters"),
    }),
    () => ({
      ...sources,
      "docs/specs/scoreboard/modules/legal.required.json": sources[
        "docs/specs/scoreboard/modules/legal.required.json"
      ].replaceAll('"/legal/matters"', '"/legal"'),
    }),
  ];
  mutations.forEach((mutate, index) => {
    if (!collectFailures(mutate()).length) {
      throw new Error(`self-test mutation ${index + 1} survived`);
    }
  });
  console.log(`PASS: ${mutations.length} planted missing-Filters-panel defects were rejected`);
}

console.log("PASS: program/system/cash-flow/insurance/drivers/legal exact filter panels mount CollapsedListFilters + staged Apply");
