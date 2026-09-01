#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-upl06-dot-inspection-create-upload";
const FILES = {
  ui: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
  route: "apps/backend/src/routes/safety/dot-inspections.ts",
  docs: "apps/frontend/src/api/docs.ts",
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
  requireToken("ui", "const pdfEvidenceId = await uploadSourceDocumentFromFile");
  requireToken("ui", 'evidenceFile ? evidenceFile.name : "Inspection PDF"');
  requireToken("ui", "pdf_evidence_id: pdfEvidenceId ?? undefined");
  requireToken("route", "pdf_evidence_id: z.string().uuid().optional()");
  requireToken("route", "AND operating_company_id = $1::uuid");
  requireToken("route", "AND upload_completed_at IS NOT NULL");
  requireToken("route", "body.data.pdf_evidence_id ?? null");
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
    ["shared uploader", "docs", "export async function uploadSourceDocumentFromFile"],
    ["create upload", "ui", "const pdfEvidenceId = await uploadSourceDocumentFromFile"],
    ["PDF control", "ui", 'evidenceFile ? evidenceFile.name : "Inspection PDF"'],
    ["payload FK", "ui", "pdf_evidence_id: pdfEvidenceId ?? undefined"],
    ["route contract", "route", "pdf_evidence_id: z.string().uuid().optional()"],
    ["company scope", "route", "AND operating_company_id = $1::uuid"],
    ["completed upload", "route", "AND upload_completed_at IS NOT NULL"],
    ["persistence", "route", "body.data.pdf_evidence_id ?? null"],
  ];
  for (const [name, file, token] of mutations) {
    if (inspect(mutate(good, file, token)).length === 0) throw new Error(`mutation escaped: ${name}`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length}/${mutations.length})`);
}

const errors = inspect(load());
if (process.argv.includes("--selftest")) selftest();
else if (errors.length) {
  console.error(`${LABEL}: FAIL\n${errors.map((error) => `  - ${error}`).join("\n")}`);
  process.exit(1);
} else console.log(`${LABEL}: PASS — DOT inspection create persists a company-scoped completed PDF evidence FK`);
