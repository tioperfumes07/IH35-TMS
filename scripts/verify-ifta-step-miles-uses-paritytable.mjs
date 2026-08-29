#!/usr/bin/env node
/**
 * verify-ifta-step-miles-uses-paritytable — qbo-parity-a1 (IFTAStepMiles preparer surface)
 *
 * IFTA quarterly preparer Step 1 state miles grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Columns State / Miles / Source preserved
 * 1:1; Run Step 1 aggregate action + last-aggregated stamp + total summary retained.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ifta-step-miles-uses-paritytable";
const PAGE = "apps/frontend/src/pages/reports/ifta/IFTAStepMiles.tsx";

const REQUIRED_LABELS = ["State", "Miles", "Source"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  const parityUses = (src.match(/<ParityTable\b/g) ?? []).length;
  if (parityUses < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>, found ${parityUses}`);
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
  if (!src.includes('storageKey="ifta-step-miles"')) {
    errors.push(`${PAGE}: must set storageKey="ifta-step-miles"`);
  }
  if (!src.includes("ifta-step-miles-table")) {
    errors.push(`${PAGE}: must set tableTestId="ifta-step-miles-table"`);
  }
  if (!src.includes('emptyText="No miles aggregated yet — run Step 1."')) {
    errors.push(`${PAGE}: must keep emptyText for unaggregated miles`);
  }
  if (!src.includes("Run Step 1 — aggregate miles")) {
    errors.push(`${PAGE}: must preserve Run Step 1 aggregate action`);
  }
  if (!src.includes("miles_aggregated_at")) {
    errors.push(`${PAGE}: must preserve last-aggregated timestamp display`);
  }
  if (!src.includes("Total:")) {
    errors.push(`${PAGE}: must preserve Total miles summary`);
  }
  if (!src.includes("Step 1 · State miles")) {
    errors.push(`${PAGE}: must keep Step 1 · State miles heading`);
  }
  if (!src.includes("useToast") || !src.includes("onError:")) {
    errors.push(`${PAGE}: runMutation must surface failures via toast onError (FINDING 50209)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const columns = [
      { key: "state", label: "State" },
      { key: "miles", label: "Miles" },
      { key: "source", label: "Source" },
    ];
    <section>
      <h3>Step 1 · State miles</h3>
      <button>Run Step 1 — aggregate miles</button>
      <p>{prepQuery.data?.miles_aggregated_at}</p>
      <ParityTable
        storageKey="ifta-step-miles"
        tableTestId="ifta-step-miles-table"
        emptyText="No miles aggregated yet — run Step 1."
      />
      <div>Total: {fmtNum(total)}</div>
    </section>
    onError: (e) => pushToast(e)
    useToast
  `;
  const bad = `
    export function IFTAStepMiles() {
      return (
        <section>
          <table><thead><tr><th>State</th></tr></thead></table>
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
  const csv = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/reports/ifta/IFTAStepCSVExport.tsx"), "utf8");
  if ((csv.match(/onError:/g) ?? []).length < 2) {
    errors.push("IFTAStepCSVExport.tsx: csv + submit mutations must toast onError (FINDING 50212)");
  }
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
