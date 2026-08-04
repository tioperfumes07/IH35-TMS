#!/usr/bin/env node
/**
 * verify-docs-home-page-uses-paritytable — qbo-parity-a1 (DocsHomePage surface)
 *
 * Documents home list must use shared ParityTable grammar (sort/resize/gear + filterBar),
 * not a hand-rolled <table>. Outages must surface ListErrorState (never false-empty on failure).
 * KPI drill-down filters, entity tabs, UploadModal scoping, and server-side pagination preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-docs-home-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/docs/DocsHomePage.tsx";

const REQUIRED_LABELS = ["File", "Type", "Entity", "Size", "Expires", "Uploaded"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("ParityTable")
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
  if (!src.includes('storageKey="docs-home-page"')) {
    errors.push(`${PAGE}: must set storageKey="docs-home-page"`);
  }
  if (!src.includes('tableTestId="docs-home-table"')) {
    errors.push(`${PAGE}: must set tableTestId="docs-home-table"`);
  }
  if (!src.includes("No documents found")) {
    errors.push(`${PAGE}: must keep emptyText for empty documents list`);
  }
  if (!src.includes("Couldn't load documents")) {
    errors.push(`${PAGE}: must keep ListErrorState title for documents outage`);
  }
  if (!src.includes("UploadModal")) {
    errors.push(`${PAGE}: must keep UploadModal for company-scoped upload`);
  }
  if (!src.includes("+ Upload Document")) {
    errors.push(`${PAGE}: must keep + Upload Document action`);
  }
  if (!src.includes("Previous") || !src.includes("Next")) {
    errors.push(`${PAGE}: must keep server-side Previous/Next pagination`);
  }
  // DOCS-S02: Incomplete Uploads is the honest label for the missing_required KPI predicate.
  if (!src.includes('label="Incomplete Uploads"') || !src.includes('label="Recent Uploads"')) {
    errors.push(`${PAGE}: must keep Incomplete Uploads + Recent Uploads KPI cards`);
  }
  if (!src.includes('label="Required Types"')) {
    errors.push(`${PAGE}: must keep Required Types KPI card (DOCS-S02 catalog density)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { UploadModal } from "../../components/documents/UploadModal";
    const DOCS_COLUMNS = [
      { key: "original_filename", label: "File" },
      { key: "type_label", label: "Type" },
      { key: "entity", label: "Entity" },
      { key: "size_bytes", label: "Size" },
      { key: "expiration_date", label: "Expires" },
      { key: "created_at", label: "Uploaded" },
    ];
    <KpiCard label="Incomplete Uploads" onClick={() => {}} />
    <KpiCard label="Required Types" onClick={() => {}} />
    <KpiCard label="Recent Uploads" onClick={() => {}} />
    + Upload Document
    <UploadModal operatingCompanyId={companyId} />
    <ListErrorState title="Couldn't load documents" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="docs-home-page"
      tableTestId="docs-home-table"
      emptyText="No documents found. Click + Upload Document to add one."
    />
    <button>Previous</button>
    <button>Next</button>
  `;
  const bad = `
    export function DocsHomePage() {
      return (
        <div>
          <table><thead><tr><th>File</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + KPI/upload/pagination preserved.`);
}

main();
