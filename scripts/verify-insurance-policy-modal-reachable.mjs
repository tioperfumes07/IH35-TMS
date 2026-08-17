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
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const hit = analyze(src);
if (!hit.ok) fail(hit.reason);
console.log(`${LABEL} PASS — PolicyCreateModal has setCreateOpen(true) entry path`);
