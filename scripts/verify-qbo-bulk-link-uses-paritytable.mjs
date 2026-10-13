#!/usr/bin/env node
/**
 * verify-qbo-bulk-link-uses-paritytable — qbo-parity (QBOBulkLinkPage)
 *
 * The QBO vendor/class bulk-link review grid (step 2) must use the shared ParityTable
 * grammar (sort/resize/gear), not a hand-rolled <table>, and load failures must
 * surface ListErrorState (never a silent false-empty).
 *
 * 443.137 9e (CC-2), guard change — OLD: the page had to KEEP the QboCombobox link controls and the
 * accept checkbox inside cell renderers (the wizard's step 3 then POSTed the picked QuickBooks ids
 * onto native mdata.drivers / mdata.units rows). NEW: the page must be a READ-ONLY review — no
 * QboCombobox, no accept checkbox, no postQboBulkLink / "Apply bulk link" write path — and must say so
 * on screen. WHY: QBO is a read-only archive ("USMCA is entirely our TMS ERP"); the page's whole
 * purpose is QBO linking and it has no native equivalent, so the write path is removed rather than
 * re-pointed. The grid, column set, error state and storage key are unchanged and still enforced.
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
  // 443.137 9e: read-only — no QBO picker, no accept checkbox, no write path.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/QboCombobox/.test(code)) {
    errors.push(`${PAGE}: must not render a QboCombobox — QBO is a read-only archive (443.137 9e)`);
  }
  if (/type="checkbox"/.test(code)) {
    errors.push(`${PAGE}: must not carry an accept checkbox — the review writes nothing`);
  }
  if (/postQboBulkLink|\/api\/v1\/qbo\/bulk-link|Apply bulk link|useMutation/.test(code)) {
    errors.push(`${PAGE}: must not write — no postQboBulkLink / bulk-link POST / "Apply bulk link" / mutation`);
  }
  if (!src.includes('data-testid="qbo-bulk-link-read-only"')) {
    errors.push(`${PAGE}: must tell the operator the review is read-only (data-testid="qbo-bulk-link-read-only")`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const columns = [
      { key: "name", label: "Entity" },
      { key: "entity_kind", label: "Kind" },
      { key: "suggested_qbo_vendor_id", label: "QBO vendor", render: (r) => archiveId(r.suggested_qbo_vendor_id) },
      { key: "suggested_qbo_class_id", label: "QBO class", render: (r) => archiveId(r.suggested_qbo_class_id) },
      { key: "match_confidence", label: "Confidence" },
    ];
    <p data-testid="qbo-bulk-link-read-only">QuickBooks is a read-only archive.</p>
    <ListErrorState title="Could not load unlinked entities." status={0} onRetry={() => {}} />
    <ParityTable storageKey="qbo-bulk-link-unlinked" tableTestId="qbo-bulk-link-table" />
  `;
  // 443.137 9e plants: each re-introduces one piece of the retired QBO write path.
  const plants = [
    ["QboCombobox picker in a cell", good.replace('render: (r) => archiveId(r.suggested_qbo_vendor_id)', "render: (r) => <QboCombobox />"), /must not render a QboCombobox/],
    ["accept checkbox", good.replace("const columns = [", 'const columns = [\n      { key: "accept", label: "", render: (r) => <input type="checkbox" /> },'), /accept checkbox/],
    ["bulk-link POST", good + "\n    const m = useMutation({ mutationFn: () => postQboBulkLink(companyId, body) });", /must not write/],
    ["Apply bulk link button", good + "\n    <Button>Apply bulk link</Button>", /must not write/],
    ["read-only notice removed", good.replace(' data-testid="qbo-bulk-link-read-only"', ""), /read-only/],
  ];
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
  for (const [name, planted, expected] of plants) {
    if (planted === good) {
      console.error(`${LABEL} --selftest FAIL plant did not change the fixture: ${name}`);
      process.exit(1);
    }
    const found = assertMigrated(planted);
    if (!found.some((e) => expected.test(e))) {
      console.error(`${LABEL} --selftest FAIL plant NOT caught: ${name}`, found);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS (good clean, hand-rolled table caught, ${plants.length}/${plants.length} QBO write-path plants caught)`);
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; read-only (no QBO picker, no write path).`);
}

main();
