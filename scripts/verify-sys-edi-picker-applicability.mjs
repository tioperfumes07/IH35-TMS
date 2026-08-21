#!/usr/bin/env node
/**
 * verify-sys-edi-picker-applicability.mjs
 * SYS-EDI-PICKER-APPLICABILITY-THEATER
 *
 * system.wizard.edi_setup must NOT claim picker_law — EdiSetupWizard has no
 * canonical-entity EntityPicker (partner name free text + ISA/GS/credentials).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-sys-edi-picker-applicability";
const REQ = "docs/specs/scoreboard/modules/system.required.json";
const WIZ = "apps/frontend/src/pages/integrations/edi/EdiSetupWizard.tsx";
const SERVICE = "apps/backend/src/integrations/edi/setup.service.ts";
const LEAF = "system.wizard.edi_setup";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const j = JSON.parse(read(REQ));
  const leaf = (j.leaves ?? []).find((l) => l.id === LEAF);
  if (!leaf) {
    failures.push(`${LEAF} missing from system.required.json`);
    return failures;
  }
  if ((leaf.required ?? []).includes("picker_law")) {
    failures.push(`${LEAF} must not require picker_law (no canonical-entity field)`);
  }
  if (!(leaf.required ?? []).includes("connectivity")) {
    failures.push(`${LEAF} must keep connectivity`);
  }
  const honesty = j.honesty_audit ?? {};
  const block = honesty.edi_picker_law_2026_08_17;
  if (!block) {
    failures.push("honesty_audit.edi_picker_law_2026_08_17 block missing");
  } else {
    const drop = (block.drops ?? []).find((d) => d.id === LEAF);
    if (!drop || !(drop.removed ?? []).includes("picker_law")) {
      failures.push("honesty drop must remove picker_law from system.wizard.edi_setup");
    }
  }
  const wiz = read(WIZ);
  if (/EntityPicker|ReferenceSelect|allowCreate\s*=/.test(wiz)) {
    failures.push("EdiSetupWizard must not mount EntityPicker/ReferenceSelect while picker_law is dropped");
  }
  if (!/partnerName|partner_name|isa_id|gs_id|connectionType/.test(wiz)) {
    failures.push("EdiSetupWizard must still expose partner name / ISA / GS / connection fields");
  }
  if (!wiz.includes('aria-labelledby="configured-edi-partners"') || !wiz.includes("partnersQuery.isError")) {
    failures.push("EdiSetupWizard must render configured partners and honest reload errors outside the create step");
  }
  if (!wiz.includes("Validate configuration") || wiz.includes("Test connection")) {
    failures.push("EDI configuration validation must not claim a live transport connection test");
  }
  const service = read(SERVICE);
  const listBody = service.match(/export async function listPartners[\s\S]*?export async function getPartnerByUuid/)?.[0] ?? "";
  if (!listBody || listBody.includes("connection_config,")) {
    failures.push("public EDI partner list must not return connection_config secrets");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const reqPath = path.join(process.cwd(), REQ);
  const wizPath = path.join(process.cwd(), WIZ);
  const servicePath = path.join(process.cwd(), SERVICE);
  const original = fs.readFileSync(reqPath, "utf8");
  const originalWizard = fs.readFileSync(wizPath, "utf8");
  const originalService = fs.readFileSync(servicePath, "utf8");
  try {
    const j = JSON.parse(original);
    const leaf = (j.leaves ?? []).find((l) => l.id === LEAF);
    if (!leaf) fail("selftest: leaf missing");
    leaf.required = [...new Set([...(leaf.required ?? []), "picker_law"])];
    fs.writeFileSync(reqPath, JSON.stringify(j, null, 2) + "\n");
    const bad = analyze();
    if (!bad.some((m) => /must not require picker_law/.test(m))) {
      fail("selftest expected picker_law reclaim to fail");
    }
  } finally {
    fs.writeFileSync(reqPath, original);
  }
  try {
    fs.writeFileSync(wizPath, originalWizard.replace('aria-labelledby="configured-edi-partners"', 'aria-labelledby="broken"'));
    if (!analyze().some((m) => /render configured partners/.test(m))) fail("selftest expected reload visibility mutation to fail");
    fs.writeFileSync(wizPath, originalWizard);
    fs.writeFileSync(servicePath, originalService.replace("supported_transactions,", "connection_config,\n        supported_transactions,"));
    if (!analyze().some((m) => /must not return connection_config/.test(m))) fail("selftest expected secret projection mutation to fail");
  } finally {
    fs.writeFileSync(wizPath, originalWizard);
    fs.writeFileSync(servicePath, originalService);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD after restore: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = analyze();
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} FAIL: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — edi_setup owes connectivity only (no picker_law)`);
}

main();
