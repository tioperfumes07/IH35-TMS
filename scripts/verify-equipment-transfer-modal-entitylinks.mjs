#!/usr/bin/env node
/**
 * EquipmentTransferModal must EntityLink selected trailer + from/to drivers
 * (Exact Leaves dispatch.modal.equipment_transfer:driver|trailer).
 *
 * FAIL: EntityPicker values only — no EntityLink strip.
 * PASS: data-testid=equipment-transfer-modal-entitylinks with EntityLink kinds.
 *
 * Self-test: node scripts/verify-equipment-transfer-modal-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-equipment-transfer-modal-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/EquipmentTransferModal.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function checkSource(src) {
  assert(/EntityLinkOrTombstone/.test(src), "must import/use EntityLinkOrTombstone");
  assert(
    /data-testid=["']equipment-transfer-modal-entitylinks["']/.test(src),
    "must expose equipment-transfer-modal-entitylinks"
  );
  assert(/kind=["']trailer["']/.test(src), "must EntityLink kind=trailer");
  assert(/kind=["']driver["']/.test(src), "must EntityLink kind=driver");
  assert(/onChange=\{\(next, option\)/.test(src), "pickers must retain the canonical selected option label");
  assert(/id=\{equipmentUuid\}\s+name=\{equipmentOption\?\.label\}/.test(src), "trailer FK must be coupled to its selected label");
  assert(/id=\{fromDriver\}\s+name=\{fromDriverOption\?\.label\}/.test(src), "from-driver FK must be coupled to its selected label");
  assert(/id=\{toDriver\}\s+name=\{toDriverOption\?\.label\}/.test(src), "to-driver FK must be coupled to its selected label");
  assert(!/entityLabel\(null,\s*(?:equipmentUuid|fromDriver|toDriver)/.test(src), "must not fabricate selected labels from UUIDs");
  assert(/const scopeGenerationRef = useRef\(0\)/.test(src), "modal must own a scope generation");
  assert(/\[open, operatingCompanyId\]/.test(src), "modal must reset on company/open transitions");
  assert(/setEquipmentUuid\(""\)[\s\S]*setFromDriver\(""\)[\s\S]*setToDriver\(""\)[\s\S]*setLocation\(""\)[\s\S]*setError\(null\)/.test(src), "scope reset must clear the entire transfer draft");
  assert(/const submittedPayload = \{[\s\S]*operating_company_id: submittedCompanyId[\s\S]*equipment_uuid: equipmentUuid[\s\S]*to_driver_uuid: toDriver/.test(src), "submit must snapshot company and transfer identities");
  assert(/body: \{[\s\S]*\.\.\.submittedPayload/.test(src), "writer must consume only the submitted payload snapshot");
  assert(/scopeGenerationRef\.current !== submittedGeneration\) return/.test(src), "late success must not close a replacement scope");
  assert(/scopeGenerationRef\.current === submittedGeneration\)[\s\S]*setError/.test(src), "late failure must not contaminate a replacement scope");
  assert(/<Modal open=\{open\} onClose=\{closeUnlessBusy\}/.test(src), "modal dismissal must be locked while pending");
  assert((src.match(/disabled=\{busy\}/g) ?? []).length >= 6, "kind, three pickers, location, and submit must lock while pending");
}

function check() {
  checkSource(fs.readFileSync(FILE, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const mutations = [
    [/data-testid=["']equipment-transfer-modal-entitylinks["']/, 'data-testid="planted-missing"'],
    [/name=\{fromDriverOption\?\.label\}/, "name={fromDriver}"],
    [/const scopeGenerationRef = useRef\(0\)/, "const scopeGenerationRef = { current: 0 }"],
    [/\[open, operatingCompanyId\]/, "[open]"],
    [/setEquipmentUuid\(""\)/, "setEquipmentUuid(equipmentUuid)"],
    [/operating_company_id: submittedCompanyId/, "operating_company_id: operatingCompanyId"],
    [/\.\.\.submittedPayload/, "operating_company_id: operatingCompanyId"],
    [/scopeGenerationRef\.current !== submittedGeneration\) return/, "false) return"],
    [/scopeGenerationRef\.current === submittedGeneration\) \{/, "true) {"],
    [/<Modal open=\{open\} onClose=\{closeUnlessBusy\}/, "<Modal open={open} onClose={onClose}"],
    [/disabled=\{busy\}/, "disabled={false}"],
  ];
  for (const [pattern, replacement] of mutations) {
    const broken = original.replace(pattern, replacement);
    assert(broken !== original, `--selftest plant must mutate ${pattern}`);
    let failed = false;
    try { checkSource(broken); } catch { failed = true; }
    assert(failed, `--selftest expected FAIL for ${pattern}`);
  }
  check();
  console.log(`${LABEL}: OK — selftest PASS (${mutations.length} mutations)`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
