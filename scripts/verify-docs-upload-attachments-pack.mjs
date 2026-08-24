#!/usr/bin/env node
/**
 * verify-docs-upload-attachments-pack.mjs — DOCS-S03 + upload/attachments picker law ratchet.
 * Standalone Docs upload: category catalog combobox, optional EntityPicker entity link
 * (all kinds including customer — no listCustomers/ReferenceSelect dual-path),
 * operating_company_id threading, entity tabs ?tab= sync.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-docs-upload-attachments-pack";

const UPLOAD_MODAL = "apps/frontend/src/components/documents/UploadModal.tsx";
const DOCS_HOME = "apps/frontend/src/pages/docs/DocsHomePage.tsx";

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assertWiring(readSourceFn = readSource) {
  const problems = [];
  const upload = readSourceFn(UPLOAD_MODAL);
  const home = readSourceFn(DOCS_HOME);

  for (const [file, src, needles] of [
    [UPLOAD_MODAL, upload, [
      "listFileCategories",
      'dataTestId="docs-upload-category-combobox"',
      'data-testid="docs-upload-entity-link-panel"',
      "<EntityPicker",
      "standaloneLinkToPickerKind",
      'dataTestId={`docs-upload-link-${linkEntityType}-picker`}',
      "operating_company_id: operatingCompanyId",
      "entity_links",
    ]],
    [DOCS_HOME, home, [
      'data-testid="docs-home-upload-button"',
      'data-testid="docs-home-need-company"',
      "defaultLinkEntityType",
      "operatingCompanyId={companyId}",
      "UploadModal",
      "parseDocsEntityTab",
      "useSearchParams",
    ]],
  ]) {
    for (const needle of needles) {
      if (!src.includes(needle)) problems.push(`${file} missing ${JSON.stringify(needle)}`);
    }
  }

  if (/listCustomers\(/.test(upload)) {
    problems.push(`${UPLOAD_MODAL}: must not call listCustomers — customer link uses EntityPicker`);
  }
  if (/ReferenceSelect/.test(upload) || /createKind=["']customer["']/.test(upload)) {
    problems.push(`${UPLOAD_MODAL}: must not use ReferenceSelect for customer — use EntityPicker`);
  }

  if (/disabled=\{!companyId\}/.test(home)) {
    problems.push(`${DOCS_HOME}: + Upload Document must toast when no company — disabled-only was a dead click`);
  }
  if (!home.includes("Select an operating company before uploading a document")) {
    problems.push(`${DOCS_HOME}: missing toast for + Upload Document with no operating company`);
  }

  return problems;
}

function run() {
  const problems = assertWiring();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const originals = { [UPLOAD_MODAL]: readSource(UPLOAD_MODAL), [DOCS_HOME]: readSource(DOCS_HOME) };
  const cases = [
    [UPLOAD_MODAL, "<EntityPicker", "EntityPicker on standalone upload"],
    [UPLOAD_MODAL, 'data-testid="docs-upload-entity-link-panel"', "entity link panel"],
    [DOCS_HOME, "defaultLinkEntityType", "default link from active tab"],
  ];
  for (const [file, needle, label] of cases) {
    const mutated = originals[file].replace(needle, "");
    if (mutated === originals[file]) throw new Error(`${LABEL}: inert selftest mutation for ${file}`);
    const problems = assertWiring((rel) => (rel === file ? mutated : originals[rel]));
    if (!problems.length) throw new Error(`${LABEL}: selftest did not reject missing ${label}`);
  }
  assertWiring((rel) => originals[rel]);
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
