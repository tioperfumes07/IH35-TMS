#!/usr/bin/env node
/**
 * verify-hos-viewer-uses-paritytable — Compliance HOS Viewer duty-segment grid
 *
 * The HOS Viewer must use shared ParityTable grammar (sort/resize/gear/export),
 * not a hand-rolled table. Duty status / start / end / duration columns and the
 * ListErrorState retry path preserve the operational HOS viewer behavior.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hos-viewer-uses-paritytable";
const PAGE = "apps/frontend/src/pages/compliance/HosViewerSection.tsx";
const REQUIRED_LABELS = ["Duty status", "Start (CT)", "End (CT)", "Duration"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on HOS query failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="compliance-hos-viewer-segments"')) {
    errors.push(`${PAGE}: must set storageKey="compliance-hos-viewer-segments"`);
  }
  if (!src.includes('tableTestId="compliance-hos-viewer-segments-table"')) {
    errors.push(`${PAGE}: must preserve the HOS segments table test id`);
  }
  if (!src.includes('exportFilename="hos-viewer-duty-segments"')) {
    errors.push(`${PAGE}: must enable HOS duty-segment CSV export`);
  }
  if (!src.includes('data-testid="compliance-section-hos-viewer"')) {
    errors.push(`${PAGE}: must keep the HOS Viewer section test id`);
  }
  if (!src.includes("Couldn't load the ELD log for")) {
    errors.push(`${PAGE}: must keep a specific HOS outage title`);
  }
  if (!src.includes("No ELD data")) {
    errors.push(`${PAGE}: must keep no-ELD-data empty state`);
  }
  if (!src.includes("DatePicker") || !src.includes("Combobox")) {
    errors.push(`${PAGE}: must keep driver and date controls`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { Combobox } from "../../components/Combobox";
    import { DatePicker } from "../../components/forms/DatePicker";
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    <section data-testid="compliance-section-hos-viewer">
      <Combobox />
      <DatePicker />
      <ListErrorState title={"Couldn't load the ELD log for driver."} />
      <div>No ELD data</div>
      <ParityTable
        storageKey="compliance-hos-viewer-segments"
        tableTestId="compliance-hos-viewer-segments-table"
        exportFilename="hos-viewer-duty-segments"
        columns={[
          { key: "duty_status", label: "Duty status" },
          { key: "start_utc", label: "Start (CT)" },
          { key: "end_utc", label: "End (CT)" },
          { key: "minutes", label: "Duration" },
        ]}
      />
    </section>
  `;
  const bad = `
    export function HosViewerSection() {
      return <table><thead><tr><th>Duty status</th></tr></thead></table>;
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
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; HOS viewer controls and columns preserved.`);
}

main();
