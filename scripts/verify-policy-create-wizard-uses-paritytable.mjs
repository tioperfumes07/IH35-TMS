#!/usr/bin/env node
/**
 * verify-policy-create-wizard-uses-paritytable — qbo-parity-a1 (PolicyCreateWizard)
 *
 * Insurance policy create wizard Step 4 bill-schedule preview must use shared
 * ParityTable grammar (sort/resize/gear), not a hand-rolled <table>. Coverage-type
 * outages must surface ListErrorState (never false-empty). Unit roster errors are owned by the
 * shared EntityPicker engine rather than duplicated inside this wizard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-policy-create-wizard-uses-paritytable";
const PAGE = "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx";

const REQUIRED_LABELS = ["Bill #", "Amount", "Per vehicle / mo"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on catalog/units query failure`);
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
  if (!src.includes('storageKey="insurance-policy-create-bill-schedule"')) {
    errors.push(`${PAGE}: must set storageKey="insurance-policy-create-bill-schedule"`);
  }
  if (!src.includes('tableTestId="policy-create-bill-schedule"')) {
    errors.push(`${PAGE}: must set tableTestId="policy-create-bill-schedule"`);
  }
  if (!src.includes("Couldn't load coverage types")) {
    errors.push(`${PAGE}: must keep ListErrorState title for coverage type outages`);
  }
  if (!/<EntityPicker[\s\S]{0,180}kind="unit"/.test(src)) {
    errors.push(`${PAGE}: covered units must use the shared EntityPicker error/search engine`);
  }
  if (!src.includes("Bill schedule —")) {
    errors.push(`${PAGE}: must keep Bill schedule heading`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../ListErrorState";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    <ListErrorState title="Couldn't load coverage types" status={0} onRetry={() => {}} />
    <EntityPicker kind="unit" operatingCompanyId={id} value={null} onChange={() => {}} />
    <p>Bill schedule — {n} monthly bills</p>
    <ParityTable
      storageKey="insurance-policy-create-bill-schedule"
      tableTestId="policy-create-bill-schedule"
      columns={[
        { key: "bill_number", label: "Bill #" },
        { key: "amount_cents", label: "Amount" },
        { key: "per_vehicle_cents", label: "Per vehicle / mo" },
      ]}
    />
  `;
  const bad = `
    export function PolicyCreateWizard() {
      return (
        <div>
          <table><thead><tr><th>Bill #</th></tr></thead></table>
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
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable + coverage ListErrorState + shared unit EntityPicker; Bill #/Amount/Per vehicle / mo preserved.`,
  );
}

main();
