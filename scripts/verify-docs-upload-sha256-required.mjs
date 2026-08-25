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

// These product leaves used to call fetch(presigned_url) directly without checking
// Response.ok, then confirm the upload anyway. They must use the canonical helper,
// which throws before confirmation when object storage rejects the PUT.
const FAILURE_AWARE_PUT_CALLERS = [
  "apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx",
  "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx",
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

function check({ docsApi, callerSources = null }) {
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

  for (const rel of FAILURE_AWARE_PUT_CALLERS) {
    const abs = path.join(ROOT, rel);
    const src = callerSources?.[rel] ?? (fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "");
    if (!src.includes("uploadFileToR2")) {
      errors.push(`${rel}: presigned PUT must use uploadFileToR2 so a rejected object-store write cannot be confirmed`);
    }
    if (/fetch\s*\(\s*presigned_url/.test(src)) {
      errors.push(`${rel}: direct fetch(presigned_url) bypasses the canonical failure-aware upload helper`);
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
  const realCallerSources = Object.fromEntries(
    FAILURE_AWARE_PUT_CALLERS.map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), "utf8")]),
  );
  const cases = [
    {
      name: "SHA-256 integrity regression",
      docsApi: orig.replace(/crypto\.subtle\.digest\(\s*"SHA-256"/, 'crypto.subtle.digest("SHA-1"'),
      callerSources: realCallerSources,
    },
    ...FAILURE_AWARE_PUT_CALLERS.map((rel) => ({
      name: `${rel} bypasses failure-aware PUT`,
      docsApi: orig,
      callerSources: {
        ...realCallerSources,
        [rel]: realCallerSources[rel]
          .replace(/await uploadFileToR2\(presigned_url, file, file\.type \|\| "application\/octet-stream"\);/, "await fetch(presigned_url);"),
      },
    })),
  ];
  for (const testCase of cases) {
    const errors = check({ docsApi: testCase.docsApi, callerSources: testCase.callerSources });
    if (errors.length === 0) throw new Error(`selftest: ${testCase.name} planted defect did not fail`);
  }
  console.log(`verify-docs-upload-sha256-required --selftest OK (${cases.length}/${cases.length} planted defects)`);
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
