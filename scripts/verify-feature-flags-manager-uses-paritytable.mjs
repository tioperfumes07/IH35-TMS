#!/usr/bin/env node
/**
 * verify-feature-flags-manager-uses-paritytable — qbo-parity-a1 (FeatureFlagsManager surface)
 *
 * Admin feature-flags manager must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Outages must surface ListErrorState (never a false-empty
 * buffered list on query failure).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-feature-flags-manager-uses-paritytable";
const PAGE = "apps/frontend/src/pages/admin/feature-flags/FeatureFlagsManager.tsx";

const REQUIRED_LABELS = ["Key", "Default", "Rollout %", "Overrides", "Actions"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="admin-feature-flags"')) {
    errors.push(`${PAGE}: must set storageKey="admin-feature-flags"`);
  }
  if (!src.includes('tableTestId="feature-flags-table"')) {
    errors.push(`${PAGE}: must set tableTestId="feature-flags-table"`);
  }
  if (!src.includes('data-testid="feature-flags-manager"')) {
    errors.push(`${PAGE}: must preserve data-testid="feature-flags-manager"`);
  }
  if (!src.includes('data-testid="per-entity-only-notice"')) {
    errors.push(`${PAGE}: must preserve per-entity-only-notice testid`);
  }
  if (!src.includes("No flags yet.")) {
    errors.push(`${PAGE}: must keep emptyText for empty flags list`);
  }
  if (!src.includes("Couldn't load feature flags")) {
    errors.push(`${PAGE}: must keep ListErrorState title for feature-flags outage`);
  }
  if (!src.includes("Tenant override ON")) {
    errors.push(`${PAGE}: must preserve Tenant override ON action`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "flag_key", label: "Key" },
      { key: "default_enabled", label: "Default" },
      { key: "rollout_pct", label: "Rollout %" },
      { key: "overrides", label: "Overrides" },
      { key: "actions", label: "Actions" },
    ];
    <div data-testid="feature-flags-manager">
      <ListErrorState title="Couldn't load feature flags" status={0} onRetry={() => {}} />
      <ParityTable
        storageKey="admin-feature-flags"
        tableTestId="feature-flags-table"
        emptyText="No flags yet."
      />
      <span data-testid="per-entity-only-notice" />
      Tenant override ON
    </div>
  `;
  const bad = `
    export function FeatureFlagsManager() {
      return (
        <div data-testid="feature-flags-manager">
          <table><thead><tr><th>Key</th></tr></thead></table>
        </div>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
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
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + feature-flags-manager testid preserved.`);
}

main();
