#!/usr/bin/env node
// BANK leftover refuse — FuelIntegrityPage / FuelReceiptPage / RelayFillsReverseSection
// ROUND 443.250 — also locks Fuel Integrity V3 board chrome (piggyback step 3684 ≡0 EVEN).
import { readFileSync } from "node:fs";

const TARGETS = [
  "apps/frontend/src/pages/fuel/integrity/FuelIntegrityPage.tsx",
  "apps/frontend/src/pages/driver/FuelReceiptPage.tsx",
  "apps/frontend/src/components/fuel/RelayFillsReverseSection.tsx",
];
const INTEGRITY = TARGETS[0];
const LABEL = "verify-fuel-integ-receipt-relay-slate-leftover-chrome";

function leftoverHits(src) {
  const hits = [];
  if (
    src.includes("text-slate-") ||
    src.includes("border-slate-") ||
    src.includes("border-l-slate-") ||
    src.includes("bg-slate-") ||
    src.includes("hover:bg-slate-") ||
    src.includes("hover:text-slate-") ||
    src.includes("divide-slate-") ||
    src.includes("sm:divide-slate-") ||
    src.includes("ring-slate-") ||
    src.includes("decoration-slate-") ||
    src.includes("focus:ring-slate-") ||
    src.includes("focus-visible:ring-slate-") ||
    src.includes("focus:border-slate-")
  ) {
    hits.push("leftover slate class");
  }
  return hits;
}

/** ROUND 443.250 Fuel Integrity tab — V3 board chrome; engines E-19..E-22 unchanged. */
export function computeIntegrityV3Failures(source) {
  const errors = [];
  if (!/V3KpiTile/.test(source) || !/data-fuel-integrity-v3-kpis/.test(source)) {
    errors.push("FuelIntegrityPage must render V3KpiTile strip with data-fuel-integrity-v3-kpis");
  }
  if (
    !/FuelBoardSection/.test(source) ||
    !/fuel-integrity-card-v3-panel/.test(source) ||
    !/fuel-integrity-relay-v3-panel/.test(source) ||
    !/fuel-integrity-derived-v3-panel/.test(source)
  ) {
    errors.push("FuelIntegrityPage must wrap Card purchases / Relay fills / Derived pump time in FuelBoardSection");
  }
  if (/import\s*\{[^}]*\bV3Panel\b/.test(source) || /<\s*V3Panel\b/.test(source)) {
    errors.push("FuelIntegrityPage must not use V3Panel after 443.326 unwrap");
  }
  if (!/MoneyListToolbar/.test(source)) {
    errors.push("FuelIntegrityPage must mount MoneyListToolbar (443.326 board grammar)");
  }
  if (/import\s*\{[^}]*\bDataPanel\b/.test(source) || /<\s*DataPanel\b/.test(source)) {
    errors.push("FuelIntegrityPage must not keep DataPanel after V3 restyle");
  }
  if (/import\s*\{[^}]*\bDrillKpiCard\b/.test(source) || /<\s*DrillKpiCard\b/.test(source)) {
    errors.push("FuelIntegrityPage must not keep DrillKpiCard after V3 restyle");
  }
  if (!/getFuelIntegrityVerdicts/.test(source) || !/getFuelTimeDerivations/.test(source)) {
    errors.push("FuelIntegrityPage must keep getFuelIntegrityVerdicts + getFuelTimeDerivations (engines unchanged)");
  }
  for (const label of [
    "Card purchases",
    "Relay fills — was the truck at the pump?",
    "Derived pump time & state",
    "Computed on read from GPS fuel-stop geofences — writes nothing",
  ]) {
    if (!source.includes(label)) {
      errors.push(`FuelIntegrityPage must keep board label "${label}"`);
    }
  }
  return errors;
}

function audit(sources) {
  const fails = [];
  for (const [path, src] of sources) {
    for (const e of leftoverHits(src)) fails.push(`${path}: ${e}`);
  }
  return fails;
}

function main() {
  const sources = TARGETS.map((path) => [path, readFileSync(path, "utf8")]);
  const selftest = process.argv.includes("--selftest");
  if (selftest) {
    const [path0, src0] = sources[0];
    const planted = `${src0}\n<span className="text-slate-700 border-slate-200 bg-slate-50">plant</span>\n`;
    if (!audit([[path0, planted], ...sources.slice(1)]).some((e) => e.includes(path0) && e.includes("leftover slate class"))) {
      console.error(`${LABEL} SELFTEST FAIL leftover plant escaped`);
      process.exit(1);
    }
    console.log(`${LABEL}: SELFTEST PASS leftover slate class plant`);
    const integritySrc = readFileSync(INTEGRITY, "utf8");
    if (computeIntegrityV3Failures(integritySrc).length) {
      console.error(`${LABEL} SELFTEST FAIL — shipped Fuel Integrity V3 baseline is red`, computeIntegrityV3Failures(integritySrc));
      process.exit(1);
    }
    const noV3 = integritySrc.replace(/V3KpiTile/g, "LegacyKpi").replace(/data-fuel-integrity-v3-kpis/g, "data-fuel-integrity-legacy");
    if (!computeIntegrityV3Failures(noV3).some((e) => e.includes("data-fuel-integrity-v3-kpis"))) {
      console.error(`${LABEL} SELFTEST FAIL — Fuel Integrity V3KpiTile removal should fail`);
      process.exit(1);
    }
    const withDataPanel = `${integritySrc}\nimport { DataPanel } from "x";\n`;
    if (!computeIntegrityV3Failures(withDataPanel).some((e) => e.includes("DataPanel"))) {
      console.error(`${LABEL} SELFTEST FAIL — DataPanel reintro should fail`);
      process.exit(1);
    }
    console.log(`${LABEL}: SELFTEST PASS Fuel Integrity V3 chrome markers`);
    process.exit(0);
  }
  const fails = audit(sources);
  const integrityFails = computeIntegrityV3Failures(readFileSync(INTEGRITY, "utf8")).map((e) => `${INTEGRITY}: ${e}`);
  const all = [...fails, ...integrityFails];
  if (all.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of all) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS leftover slate class refuse (${TARGETS.length} files); Fuel Integrity V3 chrome`);
}
main();
