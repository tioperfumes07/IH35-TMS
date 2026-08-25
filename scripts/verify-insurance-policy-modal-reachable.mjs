#!/usr/bin/env node
/**
 * verify-insurance-policy-modal-reachable.mjs
 * LV-INSURANCE-POLICY-MODAL-UNREACHABLE-THEATER — PolicyCreateModal must have a
 * Live entry path that calls setCreateOpen(true); wizard-only Create is not enough
 * when modal/parity leaves remain required.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-insurance-policy-modal-reachable";
const TARGET = "apps/frontend/src/pages/insurance/PoliciesList.tsx";
const POLICY_MODAL = "apps/frontend/src/components/insurance/PolicyCreateModal.tsx";
const ENTITY_PICKER = "apps/frontend/src/components/parity/EntityPicker.tsx";

function analyze(src) {
  if (!/PolicyCreateModal/.test(src)) {
    return { ok: false, reason: "PoliciesList must still mount PolicyCreateModal (never-delete; wire it)" };
  }
  if (!/setCreateOpen\s*\(\s*true\s*\)/.test(src)) {
    return { ok: false, reason: "missing setCreateOpen(true) entry path for PolicyCreateModal" };
  }
  if (!/data-testid=["']policy-create-modal-open["']/.test(src)) {
    return { ok: false, reason: "missing data-testid=policy-create-modal-open on modal opener" };
  }
  if (!/setWizardOpen\s*\(\s*true\s*\)/.test(src)) {
    return { ok: false, reason: "wizard Create path must remain (policies.create / wizard leaf)" };
  }
  return { ok: true };
}

function analyzeCreatedLabel(modalSrc, pickerSrc) {
  if (!/onCreated\(created\?\.id,\s*created\?\.policy_number\s*\?\?\s*form\.policy_number\.trim\(\)\)/.test(modalSrc)) {
    return { ok: false, reason: "PolicyCreateModal must return the persisted policy number with the created id" };
  }
  if (!/onCreated=\{\(id,\s*label\)\s*=>\s*\(id\s*\?\s*handleCreated\(id,\s*label\)/.test(pickerSrc)) {
    return { ok: false, reason: "EntityPicker must preserve the created policy label instead of falling back to its UUID" };
  }
  return { ok: true };
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const bad = `
    const [createOpen, setCreateOpen] = useState(false);
    <Button onClick={() => setWizardOpen(true)}>+ Create policy</Button>
    <PolicyCreateModal open={createOpen} />
  `;
  const good = `
    const [createOpen, setCreateOpen] = useState(false);
    <Button onClick={() => setWizardOpen(true)}>+ Create policy</Button>
    <Button data-testid="policy-create-modal-open" onClick={() => setCreateOpen(true)}>+ Create policy form</Button>
    <PolicyCreateModal open={createOpen} />
  `;
  if (analyze(bad).ok) fail("selftest expected BAD wizard-only to fail");
  const g = analyze(good);
  if (!g.ok) fail(`selftest expected GOOD to pass: ${g.reason}`);
  const goodModal = `onCreated(created?.id, created?.policy_number ?? form.policy_number.trim());`;
  const goodPicker = `onCreated={(id, label) => (id ? handleCreated(id, label) : setCreateOpen(false))}`;
  const labelGood = analyzeCreatedLabel(goodModal, goodPicker);
  if (!labelGood.ok) fail(`selftest expected human-label wiring to pass: ${labelGood.reason}`);
  if (analyzeCreatedLabel(`onCreated(created?.id);`, goodPicker).ok) fail("selftest expected id-only modal callback to fail");
  if (analyzeCreatedLabel(goodModal, `onCreated={(id) => handleCreated(id)}`).ok) fail("selftest expected id-only picker callback to fail");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const hit = analyze(src);
if (!hit.ok) fail(hit.reason);
const labelHit = analyzeCreatedLabel(
  fs.readFileSync(path.join(process.cwd(), POLICY_MODAL), "utf8"),
  fs.readFileSync(path.join(process.cwd(), ENTITY_PICKER), "utf8"),
);
if (!labelHit.ok) fail(labelHit.reason);
console.log(`${LABEL} PASS — PolicyCreateModal is reachable and returns a human policy label to EntityPicker`);
