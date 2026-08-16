#!/usr/bin/env node
/**
 * LV-DOCS-FILES-NOT-HASHED ratchet:
 *  1) docs.ts exports sha256HexOfFile + requestUploadUrlFromFile + uploadNewVersionFromFile
 *  2) Product upload call sites use *FromFile helpers (not bare requestUploadUrl without hash)
 *  3) requestUploadUrlFromFile always sets sha256_hash from SubtleCrypto
 *
 * --selftest strips requestUploadUrlFromFile body sha256 assignment and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_API = path.join(ROOT, "apps/frontend/src/api/docs.ts");
const SRC = path.join(ROOT, "apps/frontend/src");

const PRODUCT_CALLERS = [
  "apps/frontend/src/components/documents/UploadModal.tsx",
  "apps/frontend/src/components/drivers/CreateDriverModal.tsx",
  "apps/frontend/src/pages/safety/components/FineCreateModal.tsx",
  "apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx",
  "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx",
  "apps/frontend/src/pages/dispatch/components/book-load-v4/useRateConExtraction.ts",
];

function walkTsx(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "__tests__" || ent.name.endsWith(".test.tsx")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsx(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function check({ docsApi }) {
  const errors = [];
  if (!/export async function sha256HexOfFile/.test(docsApi)) {
    errors.push("docs.ts missing sha256HexOfFile");
  }
  if (!/export async function requestUploadUrlFromFile/.test(docsApi)) {
    errors.push("docs.ts missing requestUploadUrlFromFile");
  }
  if (!/export async function uploadNewVersionFromFile/.test(docsApi)) {
    errors.push("docs.ts missing uploadNewVersionFromFile");
  }
  if (!/sha256_hash,\n/.test(docsApi) && !/sha256_hash,/.test(docsApi)) {
    errors.push("requestUploadUrlFromFile must pass sha256_hash");
  }
  if (!/crypto\.subtle\.digest\(\s*"SHA-256"/.test(docsApi)) {
    errors.push("sha256HexOfFile must use crypto.subtle.digest SHA-256");
  }

  for (const rel of PRODUCT_CALLERS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      errors.push(`missing caller ${rel}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!/requestUploadUrlFromFile|uploadNewVersionFromFile/.test(src)) {
      errors.push(`${rel}: must use requestUploadUrlFromFile / uploadNewVersionFromFile`);
    }
    // Bare requestUploadUrl({ without FromFile is forbidden in product callers
    if (/requestUploadUrl\s*\(/.test(src) && !/requestUploadUrlFromFile/.test(src)) {
      errors.push(`${rel}: bare requestUploadUrl still present`);
    }
  }

  // Systemic: no product file under src/ (except api/docs.ts) may call requestUploadUrl(
  // without also importing/using FromFile in the same file for the upload path.
  for (const abs of walkTsx(SRC)) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
    if (rel === "apps/frontend/src/api/docs.ts") continue;
    if (rel.includes("/__tests__/") || rel.endsWith(".test.tsx") || rel.endsWith(".test.ts")) continue;
    const src = fs.readFileSync(abs, "utf8");
    if (!/\brequestUploadUrl\s*\(/.test(src)) continue;
    if (/\brequestUploadUrlFromFile\b/.test(src)) continue;
    // Allow re-exports / type-only mentions without call
    if (!/\brequestUploadUrl\s*\(\s*\{/.test(src) && !/\brequestUploadUrl\s*\(\s*[a-zA-Z_]/.test(src)) continue;
    errors.push(`${rel}: bare requestUploadUrl(...) call — use requestUploadUrlFromFile`);
  }

  return errors;
}

function selftest() {
  const orig = fs.readFileSync(DOCS_API, "utf8");
  const broken = orig.replace(/crypto\.subtle\.digest\(\s*"SHA-256"/, 'crypto.subtle.digest("SHA-1"');
  if (broken === orig) throw new Error("selftest: could not plant defect");
  fs.writeFileSync(DOCS_API, broken);
  try {
    const errors = check({ docsApi: fs.readFileSync(DOCS_API, "utf8") });
    if (errors.length === 0) throw new Error("selftest: planted defect did not fail");
  } finally {
    fs.writeFileSync(DOCS_API, orig);
  }
  console.log("verify-docs-upload-sha256-required --selftest OK");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = check({ docsApi: fs.readFileSync(DOCS_API, "utf8") });
  if (errors.length) {
    console.error("verify-docs-upload-sha256-required FAIL:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("verify-docs-upload-sha256-required OK — FE upload paths hash before minting upload-url");
}

main();
