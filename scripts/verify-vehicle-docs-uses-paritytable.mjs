#!/usr/bin/env node
/**
 * verify-vehicle-docs-uses-paritytable — qbo-parity-a1 (DocumentsSection surface)
 *
 * Vehicle profile Documents list must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns Type / Name / Expiration / Uploaded preserved;
 * + Upload + UploadModal entity scoping preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vehicle-docs-uses-paritytable";
const PAGE = "apps/frontend/src/components/vehicle-profile/DocumentsSection.tsx";

const REQUIRED_LABELS = ["Type", "Name", "Expiration", "Uploaded"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
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
  if (!src.includes('storageKey="vehicle-profile-documents"')) {
    errors.push(`${PAGE}: must set storageKey="vehicle-profile-documents"`);
  }
  if (!src.includes('tableTestId="vp-documents-table"')) {
    errors.push(`${PAGE}: must set tableTestId="vp-documents-table"`);
  }
  if (!src.includes("No documents linked.")) {
    errors.push(`${PAGE}: must keep emptyText for empty documents list`);
  }
  if (!src.includes('data-testid="vp-docs-upload-button"')) {
    errors.push(`${PAGE}: must keep vp-docs-upload-button Upload control`);
  }
  if (!src.includes("UploadModal")) {
    errors.push(`${PAGE}: must keep UploadModal for entity-scoped upload`);
  }
  if (!src.includes('entityType="unit"')) {
    errors.push(`${PAGE}: must keep UploadModal entityType=\"unit\"`);
  }
  if (!src.includes("operatingCompanyId={companyId}")) {
    errors.push(`${PAGE}: must keep viewed-company operatingCompanyId threading`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { UploadModal } from "../documents/UploadModal";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    <button data-testid="vp-docs-upload-button">+ Upload</button>
    <UploadModal entityType="unit" operatingCompanyId={companyId} />
    <ParityTable
      storageKey="vehicle-profile-documents"
      tableTestId="vp-documents-table"
      emptyText="No documents linked."
      columns={[
        { key: "category", label: "Type" },
        { key: "name", label: "Name" },
        { key: "expiration_date", label: "Expiration" },
        { key: "uploaded_at", label: "Uploaded" },
      ]}
    />
  `;
  const bad = `
    export function DocumentsSection() {
      return (
        <div>
          <table><thead><tr><th>Type</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns + Upload preserved.`);
}

main();
