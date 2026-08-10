#!/usr/bin/env node
/**
 * verify-docs-upload-attachments-pack.mjs — DOCS-S03 + upload/attachments picker law ratchet.
 * Standalone Docs upload: category catalog combobox, optional EntityPicker/ReferenceSelect entity link,
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
      'createKind="customer"',
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

  if (!/disabled=\{!companyId\}/.test(home)) {
    problems.push(`${DOCS_HOME}: upload button must disable when no operating company selected`);
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
