#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["trailer"],"leafRe":"^(home\\.roster|roster\\.kind\\.(all|trailers)|roster\\.filter\\.(type|status_active)|roster\\.bulk\\.(status|type|inactivate)|roster\\.row\\.edit_unit)$","task":"LINK-F5163-FLEET-ROSTER-TRAILER-KIND"} */
/**
 * OWNER-EXECUTION-PLAN vertical trailer-column sweep (2026-08-14): FleetTablePage.tsx's roster
 * unifies truck+trailer rows through the canonical complete reader with `include: "trailers"` and genuinely kind-branches
 * (KIND_TABS "Trailers" tab, kindFilter, type-filter options, active-status filter apply uniformly
 * to trailer rows). FleetTable.tsx's bulk actions and row-edit genuinely kind-branch on row.kind
 * ("trailer" -> equipment endpoints/TRAILER_EQUIPMENT_TYPE_OPTIONS; else -> unit endpoints).
 *
 * Self-test: node scripts/verify-fleet-roster-trailer-kind-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  tablePage: "apps/frontend/src/pages/maintenance/FleetTablePage.tsx",
  table: "apps/frontend/src/components/FleetTable.tsx",
};
const LABEL = "verify-fleet-roster-trailer-kind-wiring";

export function audit(src) {
  const failures = [];
  if (!/\{ key: "trailer", label: "Trailers" \}/.test(src.tablePage)) {
    failures.push(`${FILES.tablePage}: KIND_TABS must include a real "Trailers" tab`);
  }
  const trailerReaderCalls = src.tablePage.match(/listAllUnits\(\{[\s\S]*?include: "trailers"[\s\S]*?\}\)/g) ?? [];
  if (trailerReaderCalls.length < 2) {
    failures.push(`${FILES.tablePage}: both complete roster queries must request trailer rows through listAllUnits`);
  }
  if (!/kindFilter && r\.kind !== kindFilter/.test(src.tablePage)) {
    failures.push(`${FILES.tablePage}: roster.kind.trailers filter must apply to real row.kind`);
  }
  if (!/row\.kind === "trailer" \? "equipment" : "units"/.test(src.table)) {
    failures.push(`${FILES.table}: bulk inactivate must route trailer rows to the equipment endpoint, not units`);
  }
  if (!/const trailers = selectedRows\.filter\(\(row\) => row\.kind === "trailer"\)/.test(src.table)) {
    failures.push(`${FILES.table}: bulk status/type actions must split trailer rows from truck rows`);
  }
  if (!/open=\{editingUnitId !== null && editingRow\?\.kind !== "trailer"\}/.test(src.table)) {
    failures.push(`${FILES.table}: roster.row.edit_unit must NOT open for trailer rows (kind-branch)`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    tablePage: fs.readFileSync(path.join(root, FILES.tablePage), "utf8"),
    table: fs.readFileSync(path.join(root, FILES.table), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["kind-tab", "tablePage", /\{ key: "trailer", label: "Trailers" \}/, '{ key: "trailer_x", label: "Trailers" }'],
    ["complete-unfiltered-reader", "tablePage", /listAllUnits\(\{ operating_company_id: operatingCompanyId, include: "trailers" \}\)/, 'listAllUnits({ operating_company_id: operatingCompanyId })'],
    ["complete-filtered-reader", "tablePage", /include: "trailers",\n        type:/, 'include: undefined,\n        type:'],
    ["kind-filter", "tablePage", /kindFilter && r\.kind !== kindFilter/, "false"],
    ["bulk-inactivate-route", "table", /row\.kind === "trailer" \? "equipment" : "units"/, '"units"'],
    ["bulk-split", "table", /const trailers = selectedRows\.filter\(\(row\) => row\.kind === "trailer"\)/, "const trailers = []"],
    ["edit-unit-kind-branch", "table", /open=\{editingUnitId !== null && editingRow\?\.kind !== "trailer"\}/, "open={editingUnitId !== null}"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fleet roster genuinely kind-branches trailer rows across tabs, filters, bulk actions, and row edit`);
