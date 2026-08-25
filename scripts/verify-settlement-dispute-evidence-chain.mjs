#!/usr/bin/env node
import { readFileSync } from "node:fs";

const FILES = {
  modal: "apps/frontend/src/pages/drivers/SettlementDisputeModal.tsx",
  api: "apps/frontend/src/api/driverFinance.ts",
  route: "apps/backend/src/driver-finance/settlement-dispute.routes.ts",
  service: "apps/backend/src/driver-finance/settlement-dispute.service.ts",
};

export function problems(files) {
  const failures = [];
  const modal = files.modal ?? "";
  const api = files.api ?? "";
  const route = files.route ?? "";
  const service = files.service ?? "";
  if (modal.includes('/api/v1/docs/files/upload"')) failures.push("legacy best-effort multipart upload remains");
  if (!modal.includes("requestUploadUrlFromFile")) failures.push("modal does not mint canonical upload URL");
  if (!modal.includes('entity_links: [{ entity_type: "settlement", entity_id: settlement_id }]')) failures.push("evidence file is not linked to its selected-company settlement");
  if (!modal.includes('method: "PUT"') || !modal.includes("if (!put.ok)")) failures.push("R2 PUT is not failure-aware");
  if (!modal.includes("await confirmUpload(upload.file_id)")) failures.push("evidence upload is not confirmed");
  if (!modal.includes("evidence_file_ids: evidenceFileIds")) failures.push("confirmed file ids do not reach dispute submit");
  if (!api.includes("evidence_file_ids?: string[]")) failures.push("frontend dispute contract omits evidence file ids");
  if (!route.includes("evidence_file_ids: z.array(z.string().uuid()).max(10)")) failures.push("backend dispute schema does not validate evidence ids");
  if (!/FROM docs\.files f[\s\S]{0,900}f\.operating_company_id = \$1::uuid[\s\S]{0,900}f\.upload_completed_at IS NOT NULL/.test(service)) failures.push("writer does not validate completed files in the selected company");
  if (!/docs\.file_links fl[\s\S]{0,400}fl\.entity_type = 'settlement'[\s\S]{0,250}fl\.entity_id = \$3::uuid/.test(service)) failures.push("writer does not require the canonical settlement link");
  if (!service.includes("evidence.rows.length !== evidenceFileIds.length")) failures.push("writer accepts partial/missing evidence sets");
  if (!/evidence_r2_paths[\s\S]{0,180}\$7::text\[\]/.test(service)) failures.push("validated canonical paths are not persisted atomically on the dispute");
  return failures;
}

const production = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, readFileSync(file, "utf8")]));

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["settlement link", { ...production, modal: production.modal.replace('entity_type: "settlement"', 'entity_type: "load"') }],
    ["PUT status", { ...production, modal: production.modal.replace("if (!put.ok)", "if (false)") }],
    ["confirm", { ...production, modal: production.modal.replace("await confirmUpload(upload.file_id)", "void upload.file_id") }],
    ["submit ids", { ...production, modal: production.modal.replace("evidence_file_ids: evidenceFileIds", "evidence_file_ids: []") }],
    ["company scope", { ...production, service: production.service.replace("f.operating_company_id = $1::uuid", "f.operating_company_id = f.operating_company_id") }],
    ["completed gate", { ...production, service: production.service.replace("f.upload_completed_at IS NOT NULL", "true") }],
    ["settlement reverse", { ...production, service: production.service.replace("fl.entity_type = 'settlement'", "fl.entity_type = 'load'") }],
    ["all-files gate", { ...production, service: production.service.replace("evidence.rows.length !== evidenceFileIds.length", "false") }],
    ["atomic persistence", { ...production, service: production.service.replace("evidence_r2_paths, opened_by_driver", "opened_by_driver") }],
  ];
  const missed = mutations.filter(([, fixture]) => problems(fixture).length === 0);
  if (missed.length) {
    console.error(`verify-settlement-dispute-evidence-chain SELFTEST FAILED: ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-settlement-dispute-evidence-chain selftest PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = problems(production);
if (failures.length) {
  console.error(`verify-settlement-dispute-evidence-chain FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-settlement-dispute-evidence-chain PASS — upload, confirm, selected-company settlement link, and dispute persistence are one fail-loud chain");
