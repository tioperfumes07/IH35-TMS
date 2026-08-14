#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety","dispatch"],"cols":["reverse_link"],"leafRe":"^(driver_scoring\\.list|safety\\.panel\\.driver_safety_profile|load\\.drawer\\.settlement)$","task":"LINK-F5130-DRIVER-SECONDARY-SURFACE-REVERSE-LINKS","vertical":"class-sweep"}
 *
 * Driver identities on secondary decision surfaces must drill to the canonical driver profile.
 * The class covers the safety score list/detail panel and the dispatch deduction-review modal;
 * title-only create/confirm modals are intentionally not link surfaces.
 */
import fs from "node:fs";

const LABEL = "verify-driver-secondary-surface-reverse-links";
const FILES = {
  scoring: "apps/frontend/src/pages/safety/driver-scoring/DriverScoringTab.tsx",
  detail: "apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx",
  deductions: "apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx",
  resolver: "apps/frontend/src/components/shared/EntityLink.tsx",
};

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function check(sources) {
  const failures = [];
  if (!/key:\s*["']driver_name["'][\s\S]{0,500}<EntityLink[\s\S]{0,180}kind=["']driver["'][\s\S]{0,180}id=\{row\.driver_uuid\}/.test(sources.scoring)) {
    failures.push(`${FILES.scoring}: driver-scoring list must drill row.driver_uuid through EntityLink kind=driver`);
  }
  if (!/<h4[\s\S]{0,220}<EntityLink[\s\S]{0,180}kind=["']driver["'][\s\S]{0,180}id=\{driverUuid\}/.test(sources.detail)) {
    failures.push(`${FILES.detail}: score detail heading must drill driverUuid through EntityLink kind=driver`);
  }
  if (!/Driver:\s*\{["']\s["']\}[\s\S]{0,220}<EntityLink[\s\S]{0,180}kind=["']driver["'][\s\S]{0,180}id=\{selectedPending\.driver_id\}/.test(sources.deductions)) {
    failures.push(`${FILES.deductions}: deduction review must drill selectedPending.driver_id through EntityLink kind=driver`);
  }
  if (!/case\s+["']driver["'][\s\S]{0,180}\/drivers\//.test(sources.resolver)) {
    failures.push(`${FILES.resolver}: driver EntityLink resolver must retain the canonical /drivers/:id route`);
  }
  return failures;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));

if (process.argv.includes("--self-test")) {
  const mutations = [
    ["scoring", 'kind="driver"', 'kind="customer"'],
    ["scoring", "id={row.driver_uuid}", "id={undefined}"],
    ["detail", 'kind="driver"', 'kind="unit"'],
    ["detail", "id={driverUuid}", "id={undefined}"],
    ["deductions", 'kind="driver"', 'kind="vendor"'],
    ["deductions", "id={selectedPending.driver_id}", "id={undefined}"],
    ["resolver", 'case "driver"', 'case "driver_removed"'],
  ];
  const missed = [];
  for (const [key, needle, replacement] of mutations) {
    if (!sources[key].includes(needle)) {
      missed.push(`${key}: mutation anchor missing (${needle})`);
      continue;
    }
    const mutated = { ...sources, [key]: sources[key].replace(needle, replacement) };
    if (check(mutated).length === 0) missed.push(`${key}: planted defect escaped (${needle})`);
  }
  if (missed.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${missed.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error(`${LABEL} FAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — safety scoring list/detail and dispatch deduction review drill to canonical drivers`);
