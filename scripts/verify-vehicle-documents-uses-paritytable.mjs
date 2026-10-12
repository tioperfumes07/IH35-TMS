#!/usr/bin/env node
/**
 * verify-vehicle-documents-uses-paritytable — qbo-parity-a1 (vehicle DocumentsSection)
 *
 * Vehicle profile documents list must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns Type / Name / Expiration / Uploaded preserved;
 * + Upload + UploadModal entity scoping preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vehicle-documents-uses-paritytable";
const PAGE = "apps/frontend/src/components/vehicle-profile/DocumentsSection.tsx";

const REQUIRED_LABELS = ["Type", "Name", "Expiration", "Uploaded"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../parity/ParityTable"') &&
    !src.includes("from '../parity/ParityTable'")
  ) {
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
  // 443.99 class B (CC-2, 2026-10-12) — upload control anchor.
  //   old rule: the file contains a literal data-testid="vp-docs-upload-button" button and the text "UploadModal".
  //   new rule: EITHER that inline shape (the button test id + a real <UploadModal ...> element), OR the shared
  //             <EntityDocumentUpload> (imported from ../documents/EntityDocumentUpload, which renders the button
  //             with data-testid={buttonTestId} and the UploadModal) with entityType="unit", entityId={unitId},
  //             operatingCompanyId={companyId} (FIX-2: upload files under the VIEWED entity) and
  //             buttonTestId="vp-docs-upload-button".
  //   why: LAY-01/UPL-01 (#19219, db6ca177ba) replaced every profile's hand-wired UploadModal with the one shared
  //        component. The upload still exists; the literal anchors could not see it (and "UploadModal" was only
  //        matching a code comment). Stricter, not looser: the shared shape must also pass the viewed company.
  const inlineUpload = src.includes('data-testid="vp-docs-upload-button"') && /<UploadModal\b/.test(src);
  const sharedTag = /<EntityDocumentUpload\b[\s\S]*?\/>/.exec(src)?.[0] ?? "";
  const sharedUpload =
    /import\s*\{\s*EntityDocumentUpload\s*\}\s*from\s*["'][./]+documents\/EntityDocumentUpload["']/.test(src) &&
    sharedTag.includes('buttonTestId="vp-docs-upload-button"') &&
    sharedTag.includes('entityType="unit"') &&
    /entityId=\{unitId\}/.test(sharedTag);
  if (!inlineUpload && !sharedUpload) {
    errors.push(`${PAGE}: must keep vp-docs-upload-button upload control`);
  }
  if (!inlineUpload && !(sharedUpload && /operatingCompanyId=\{companyId\}/.test(sharedTag))) {
    errors.push(`${PAGE}: must keep UploadModal for entity-scoped upload`);
  }
  if (!src.includes("No documents linked.")) {
    errors.push(`${PAGE}: must keep emptyText for empty documents list`);
  }
  if (!src.includes("expColor")) {
    errors.push(`${PAGE}: must keep expiration urgency coloring`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { UploadModal } from "../documents/UploadModal";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    function expColor(dateStr) { return "text-gray-600"; }
    <button data-testid="vp-docs-upload-button">+ Upload</button>
    <UploadModal entityType="unit" />
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
  // The shared EntityDocumentUpload shape (today's component) passes; dropping its test id, its unit scope or
  // the viewed company is caught.
  const sharedGood = good
    .replace('import { UploadModal } from "../documents/UploadModal";', 'import { EntityDocumentUpload } from "../documents/EntityDocumentUpload";')
    .replace('<button data-testid="vp-docs-upload-button">+ Upload</button>\n    <UploadModal entityType="unit" />',
      '<EntityDocumentUpload\n      entityType="unit"\n      entityId={unitId}\n      operatingCompanyId={companyId}\n      buttonTestId="vp-docs-upload-button"\n      onUploadSuccess={onUploaded}\n    />');
  if (sharedGood === good || assertMigrated(sharedGood).length) {
    console.error(`${LABEL} --selftest FAIL shared EntityDocumentUpload fixture rejected:`, assertMigrated(sharedGood));
    process.exit(1);
  }
  const plants = [
    ["upload control removed", sharedGood.replace(/<EntityDocumentUpload[\s\S]*?\/>/, "")],
    ["test id dropped", sharedGood.replace('buttonTestId="vp-docs-upload-button"', "")],
    ["upload not scoped to the unit", sharedGood.replace('entityType="unit"', 'entityType="vendor"')],
    ["viewed company not passed (files under the uploader's default entity)", sharedGood.replace("operatingCompanyId={companyId}", "")],
    ["inline button with no modal", good.replace('<UploadModal entityType="unit" />', "")],
  ];
  for (const [name, fixture] of plants) {
    if (fixture === sharedGood || fixture === good || !assertMigrated(fixture).length) {
      console.error(`${LABEL} --selftest FAIL planted violation escaped — ${name}`);
      process.exit(1);
    }
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
    `OK ${LABEL}: ${PAGE} uses ParityTable; columns + vp-docs-upload-button + UploadModal preserved.`,
  );
}

main();
