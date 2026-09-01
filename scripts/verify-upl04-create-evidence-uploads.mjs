#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-upl04-create-evidence-uploads";
const FILES = {
  docs: "apps/frontend/src/api/docs.ts",
  drugUi: "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
  hosUi: "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx",
  companyUi: "apps/frontend/src/pages/safety/components/CompanyViolationCreateModal.tsx",
  drugRoute: "apps/backend/src/safety/drug-program.routes.ts",
  hosRoute: "apps/backend/src/routes/safety/hos-violations.ts",
  companyRoute: "apps/backend/src/safety/company-violations.routes.ts",
};

function load() {
  return Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
}

function inspect(src) {
  const errors = [];
  const requireToken = (file, token) => {
    if (!src[file].includes(token)) errors.push(`${file}: missing ${token}`);
  };
  requireToken("docs", "export async function uploadSourceDocumentFromFile");
  for (const file of ["drugUi", "hosUi", "companyUi"]) {
    requireToken(file, "uploadSourceDocumentFromFile");
    requireToken(file, 'type="file"');
    requireToken(file, "source_doc_id");
  }
  for (const file of ["drugRoute", "hosRoute", "companyRoute"]) {
    requireToken(file, "source_doc_id");
  }
  requireToken("drugRoute", "body.data.source_doc_id ?? null");
  requireToken("hosRoute", "body.data.source_doc_id ?? null");
  requireToken("companyRoute", "body.data.source_doc_id ?? null");
  return errors;
}

function mutate(good, file, token) {
  if (!good[file].includes(token)) throw new Error(`selftest anchor missing: ${file}:${token}`);
  return { ...good, [file]: good[file].replace(token, "PLANTED_MISSING") };
}

function selftest() {
  const good = load();
  const baseline = inspect(good);
  if (baseline.length) throw new Error(`good fixture rejected: ${baseline.join("; ")}`);
  const mutations = [
    ["shared helper", "docs", "export async function uploadSourceDocumentFromFile"],
    ["drug UI", "drugUi", 'type="file"'],
    ["HOS UI", "hosUi", 'type="file"'],
    ["company UI", "companyUi", 'type="file"'],
    ["drug persistence", "drugRoute", "body.data.source_doc_id ?? null"],
    ["HOS persistence", "hosRoute", "body.data.source_doc_id ?? null"],
    ["company persistence", "companyRoute", "body.data.source_doc_id ?? null"],
  ];
  for (const [name, file, token] of mutations) {
    if (inspect(mutate(good, file, token)).length === 0) throw new Error(`mutation escaped: ${name}`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length}/${mutations.length})`);
}

const errors = inspect(load());
if (process.argv.includes("--selftest")) selftest();
else if (errors.length) {
  console.error(`${LABEL}: FAIL\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
} else console.log(`${LABEL}: PASS — three live safety create paths persist optional evidence through the shared uploader`);
