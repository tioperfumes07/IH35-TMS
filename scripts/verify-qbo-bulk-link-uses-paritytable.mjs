#!/usr/bin/env node
/**
 * verify-qbo-bulk-link-uses-paritytable — qbo-parity (QBOBulkLinkPage)
 *
 * The QBO vendor/class bulk-link review grid (step 2) must use the shared ParityTable
 * grammar (sort/resize/gear), not a hand-rolled <table>. The accept checkbox and the
 * QboCombobox link controls must stay inside cell renderers, and load failures must
 * surface ListErrorState (never a silent false-empty).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-bulk-link-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/accounting/QBOBulkLinkPage.tsx";

const COLUMN_LABELS = ["Entity", "Kind", "QBO vendor", "QBO class", "Confidence"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable> (unlinked-entities review grid)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of COLUMN_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="qbo-bulk-link-unlinked"')) {
    errors.push(`${PAGE}: must set storageKey="qbo-bulk-link-unlinked"`);
  }
  if (!src.includes('tableTestId="qbo-bulk-link-table"')) {
    errors.push(`${PAGE}: must set tableTestId="qbo-bulk-link-table"`);
  }
  if (!src.includes("Could not load unlinked entities.")) {
    errors.push(`${PAGE}: must keep ListErrorState title for unlinked-entities load failure`);
  }
  // Link controls must remain inside cell renderers (accept checkbox + vendor/class comboboxes).
  if (!src.includes("QboCombobox")) {
    errors.push(`${PAGE}: must keep QboCombobox link controls inside cell renderers`);
  }
  if (!src.includes('type="checkbox"')) {
    errors.push(`${PAGE}: must keep the accept checkbox inside a cell renderer`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { QboCombobox } from "../../../components/forms/QboCombobox";
    const columns = [
      { key: "accept", label: "", render: (r) => <input type="checkbox" /> },
      { key: "name", label: "Entity" },
      { key: "entity_kind", label: "Kind" },
      { key: "qbo_vendor_id", label: "QBO vendor", render: (r) => <QboCombobox /> },
      { key: "qbo_class_id", label: "QBO class", render: (r) => <QboCombobox /> },
      { key: "match_confidence", label: "Confidence" },
    ];
    <ListErrorState title="Could not load unlinked entities." status={0} onRetry={() => {}} />
    <ParityTable storageKey="qbo-bulk-link-unlinked" tableTestId="qbo-bulk-link-table" />
  `;
  const bad = `
    export function QBOBulkLinkPage() {
      return (
        <div>
          <table><thead><tr><th>Entity</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; link controls preserved.`);
}

main();
