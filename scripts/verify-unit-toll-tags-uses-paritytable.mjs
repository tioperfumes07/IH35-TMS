#!/usr/bin/env node
/**
 * verify-unit-toll-tags-uses-paritytable — qbo-parity-a1 (UnitTollTagsTab surface)
 *
 * Unit detail toll-tags tab must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Query outages must surface ListErrorState (never
 * false-empty "No toll tags assigned" on failure).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unit-toll-tags-uses-paritytable";
const PAGE = "apps/frontend/src/pages/units/UnitTollTagsTab.tsx";

const REQUIRED_LABELS = ["Network", "Tag #", "Activated", "Balance", "Monthly", "Status"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
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
  if (!src.includes('storageKey="unit-toll-tags"')) {
    errors.push(`${PAGE}: must set storageKey="unit-toll-tags"`);
  }
  if (!src.includes('tableTestId="unit-toll-tags-table"')) {
    errors.push(`${PAGE}: must set tableTestId="unit-toll-tags-table"`);
  }
  if (!src.includes('data-testid="unit-toll-tags-tab"')) {
    errors.push(`${PAGE}: must keep data-testid="unit-toll-tags-tab" on section`);
  }
  if (!src.includes("No toll tags assigned to this unit.")) {
    errors.push(`${PAGE}: must keep emptyText for empty toll tag list`);
  }
  if (!src.includes("Couldn't load toll tags")) {
    errors.push(`${PAGE}: must keep ListErrorState title for toll tag outage`);
  }
  if (!src.includes("balance_current")) {
    errors.push(`${PAGE}: must preserve balance_current / low-balance rendering`);
  }
  if (!src.includes("low_balance_tags")) {
    errors.push(`${PAGE}: must preserve low_balance_tags wiring`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    <section data-testid="unit-toll-tags-tab">
      <ListErrorState title="Couldn't load toll tags" status={0} onRetry={() => {}} />
      <ParityTable
        storageKey="unit-toll-tags"
        tableTestId="unit-toll-tags-table"
        emptyText="No toll tags assigned to this unit."
        columns={[
          { key: "tag_network", label: "Network" },
          { key: "tag_number", label: "Tag #" },
          { key: "activated_at", label: "Activated" },
          { key: "balance_current", label: "Balance" },
          { key: "monthly_fee", label: "Monthly" },
          { key: "status", label: "Status" },
        ]}
      />
      low_balance_tags balance_current
    </section>
  `;
  const bad = `
    export function UnitTollTagsTab() {
      return (
        <section data-testid="unit-toll-tags-tab">
          <table><thead><tr><th>Network</th></tr></thead></table>
        </section>
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
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + unit-toll-tags-tab testid preserved.`
  );
}

main();
