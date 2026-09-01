#!/usr/bin/env node
/**
 * UPL-01 — shared docs.files upload UI (EntityDocumentUpload).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-upl01-entity-document-upload";

const FILES = {
  shared: "apps/frontend/src/components/documents/EntityDocumentUpload.tsx",
  docsTab: "apps/frontend/src/components/documents/DocumentsTab.tsx",
  docsSection: "apps/frontend/src/components/vehicle-profile/DocumentsSection.tsx",
};

function load() {
  return Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
}

function inspect(src) {
  const errors = [];
  if (!src.shared.includes("export function EntityDocumentUpload")) errors.push("EntityDocumentUpload export missing");
  if (!src.shared.includes("<UploadModal")) errors.push("EntityDocumentUpload must wrap UploadModal (docs.files stack)");
  for (const file of ["docsTab", "docsSection"]) {
    if (!src[file].includes("EntityDocumentUpload")) errors.push(`${file} must consume EntityDocumentUpload`);
    if (src[file].includes("<UploadModal")) errors.push(`${file} must not wire UploadModal directly`);
  }
  return errors;
}

function mutate(src, file, token) {
  if (!src[file].includes(token)) throw new Error(`selftest anchor missing: ${file}:${token}`);
  return { ...src, [file]: src[file].replaceAll(token, "PLANTED_MISSING") };
}

function selftest() {
  const good = load();
  const baseline = inspect(good);
  if (baseline.length) throw new Error(`good fixture rejected: ${baseline.join("; ")}`);
  const cases = [
    ["shared export", "shared", "export function EntityDocumentUpload"],
    ["DocumentsTab adoption", "docsTab", "EntityDocumentUpload"],
    ["DocumentsSection adoption", "docsSection", "EntityDocumentUpload"],
  ];
  for (const [name, file, token] of cases) {
    if (inspect(mutate(good, file, token)).length === 0) throw new Error(`mutation escaped: ${name}`);
  }
  console.log(`${LABEL}: selftest PASS (${cases.length}/${cases.length})`);
}

const errors = inspect(load());
if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (err) {
    console.error(`${LABEL}: selftest FAIL — ${err.message}`);
    process.exit(1);
  }
} else if (errors.length) {
  console.error(`${LABEL}: FAIL\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
} else {
  console.log(`${LABEL}: PASS — EntityDocumentUpload shared; DocumentsTab + DocumentsSection migrated off ad-hoc UploadModal wiring`);
}
