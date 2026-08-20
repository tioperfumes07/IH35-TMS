#!/usr/bin/env node
/**
 * verify-hos-tracker-uses-paritytable — qbo-parity-a1 (HosTrackerSection surface)
 *
 * Compliance HOS roster must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Query outages must surface ListErrorState + Retry.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hos-tracker-uses-paritytable";
const PAGE = "apps/frontend/src/pages/compliance/HosTrackerSection.tsx";
const REQUIRED_LABELS = [
  "Driver",
  "Unit",
  "Status",
  "Drive",
  "Shift",
  "Cycle",
  "Driven (cyc)",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import shared ParityTable`);
  }
  if (!src.includes('from "../../components/ListErrorState"')) {
    errors.push(`${PAGE}: must import ListErrorState`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length !== 1) {
    errors.push(`${PAGE}: expected exactly one <ParityTable>`);
  }
  if (/<table[\s>]/.test(src) || /<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled table`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label "${label}"`);
    }
  }
  if (!src.includes('storageKey="compliance-hos-tracker"')) {
    errors.push(`${PAGE}: must set stable ParityTable storageKey`);
  }
  // Re-anchored (2026-08-20, CC-3): emptyText is now a ternary — a distinct, more honest message
  // when a single driver's filter yields no roster row for the day ("No HOS roster row for this
  // driver...") vs. the general empty-roster case, which still preserves the original copy as its
  // fallback branch. The old check required the exact plain-string assignment shape
  // (emptyText="No active drivers.") that a ternary genuinely can't match; check for the string
  // inside the prop's expression container instead.
  if (!/emptyText=\{[\s\S]{0,200}"No active drivers\."/.test(src)) {
    errors.push(`${PAGE}: must preserve the empty roster copy`);
  }
  if (!src.includes("Couldn't load HOS roster")) {
    errors.push(`${PAGE}: must render a specific ListErrorState title`);
  }
  if (!src.includes("onRetry={() => void rosterQ.refetch()}")) {
    errors.push(`${PAGE}: ListErrorState must retry the failed roster query`);
  }
  if (!src.includes("onRowClick={setSelectedDriver}")) {
    errors.push(`${PAGE}: driver rows must still open the cycle-detail drawer`);
  }
  if (!src.includes("buildDayStrip") || !src.includes("selectedDriver ? (")) {
    errors.push(`${PAGE}: date strip and cycle-detail drawer must remain`);
  }
  return errors;
}

function selftest() {
  const columns = REQUIRED_LABELS.map((label) => `{ key: "${label}", label: "${label}" }`).join(",");
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable } from "../../components/parity/ParityTable";
    function buildDayStrip() {}
    const configuredColumns = [${columns}];
    <ListErrorState title="Couldn't load HOS roster" onRetry={() => void rosterQ.refetch()} />;
    <ParityTable storageKey="compliance-hos-tracker" emptyText="No active drivers."
      onRowClick={setSelectedDriver} />;
    selectedDriver ? (<div />) : null;
  `;
  const bad = `
    function HosTrackerSection() {
      return <table><thead><tr><th>Driver</th></tr></thead></table>;
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 5) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; HOS behavior preserved.`);
}

main();
