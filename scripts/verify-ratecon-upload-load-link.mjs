#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const files = {
  hook: "apps/frontend/src/pages/dispatch/components/book-load-v4/useRateConExtraction.ts",
  modal: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  api: "apps/frontend/src/api/dispatch.ts",
  route: "apps/backend/src/dispatch/loads.routes.ts",
  service: "apps/backend/src/dispatch/book-load.service.ts",
};

function violations(source) {
  const failures = [];
  const needs = (key, pattern, label) => {
    if (!pattern.test(source[key])) failures.push(`${files[key]}: ${label}`);
  };

  needs("hook", /onPrefill\([\s\S]*fileId:\s*up\.file_id,[\s\S]*r2Key:\s*up\.r2_key/, "shared intake must retain docs.files id and R2 key");
  const fileIdBindings = source.modal.match(/setValue\("rate_confirmation_file_id",\s*uploadedFile\.fileId/g) ?? [];
  if (fileIdBindings.length !== 2) failures.push(`${files.modal}: both Section A and Section E must bind the uploaded file id (found ${fileIdBindings.length})`);
  needs("modal", /rate_confirmation_file_id:\s*values\.rate_confirmation_file_id\s*\|\|\s*undefined/, "booking payload must carry the docs.files id");
  needs("api", /rate_confirmation_file_id\?:\s*string/, "frontend booking contract must declare file id");
  needs("route", /rate_confirmation_file_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/, "backend route must validate file id as UUID");
  needs("service", /f\.operating_company_id\s*=\s*\$2::uuid[\s\S]*f\.upload_completed_at\s+IS NOT NULL[\s\S]*f\.deleted_at\s+IS NULL/, "booking must validate completed, live, entity-scoped docs.files row");
  needs("service", /rateConfirmationFile\?\.r2_key\s*\?\?\s*input\.ocr_source_pdf_r2_key/, "load R2 key must derive from validated docs.files row");
  needs("service", /INSERT INTO docs\.file_links[\s\S]*'load'[\s\S]*rateConfirmationFile\.id[\s\S]*String\(load\.id\)/, "booking transaction must create the load reverse-link");
  needs("service", /code\s*=\s*'rate_confirmation'/, "linked document must use the canonical rate-confirmation category");
  return failures;
}

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

if (process.argv.includes("--selftest")) {
  const broken = { ...source, hook: source.hook.replace("fileId: up.file_id", "fileId: undefined") };
  if (violations(broken).length === 0) {
    console.error("FAIL: selftest mutation (discarded docs.files id) was not detected");
    process.exit(1);
  }
  const brokenLink = { ...source, service: source.service.replace("INSERT INTO docs.file_links", "INSERT INTO docs.unlinked_files") };
  if (violations(brokenLink).length === 0) {
    console.error("FAIL: selftest mutation (missing load link) was not detected");
    process.exit(1);
  }
  console.log("PASS: selftest detects discarded upload identity and missing load link");
  process.exit(0);
}

const failures = violations(source);
if (failures.length) {
  console.error(["FAIL: rate-confirmation upload is not vertically linked", ...failures.map((x) => `- ${x}`)].join("\n"));
  process.exit(1);
}
console.log("PASS: both rate-con controls preserve docs.files identity through atomic load linkage");
