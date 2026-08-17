#!/usr/bin/env node
/**
 * verify-legal-matter-claim-picker-create.mjs
 * LV-LEGAL-MATTER-CLAIM-PICKER-CREATOR-DISABLED — LegalMatterFormFields must
 * allowCreate on insurance_claim EntityPicker (registry + ClaimCreateModal path).
 * insurance_lawsuit must remain allowCreate={false}.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-legal-matter-claim-picker-create";
const TARGET = "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx";

function extractPicker(src, kind) {
  const re = new RegExp(
    `<EntityPicker[\\s\\S]*?kind="${kind}"[\\s\\S]*?\\/>`,
    "m",
  );
  const m = src.match(re);
  return m ? m[0] : null;
}

function analyze(src) {
  const claim = extractPicker(src, "insurance_claim");
  if (!claim) return { ok: false, reason: "missing insurance_claim EntityPicker" };
  if (/allowCreate=\{false\}/.test(claim)) {
    return { ok: false, reason: "insurance_claim still allowCreate={false}" };
  }
  if (!/\ballowCreate\b/.test(claim)) {
    return { ok: false, reason: "insurance_claim missing allowCreate (must be true/default)" };
  }
  const lawsuit = extractPicker(src, "insurance_lawsuit");
  if (!lawsuit) return { ok: false, reason: "missing insurance_lawsuit EntityPicker" };
  if (!/allowCreate=\{false\}/.test(lawsuit)) {
    return { ok: false, reason: "insurance_lawsuit must remain allowCreate={false}" };
  }
  return { ok: true };
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const bad = `
    <EntityPicker kind="insurance_claim" allowCreate={false} />
    <EntityPicker kind="insurance_lawsuit" allowCreate={false} />
  `;
  const good = `
    <EntityPicker kind="insurance_claim" allowCreate />
    <EntityPicker kind="insurance_lawsuit" allowCreate={false} />
  `;
  if (analyze(bad).ok) fail("selftest expected BAD to fail");
  const g = analyze(good);
  if (!g.ok) fail(`selftest expected GOOD: ${g.reason}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const hit = analyze(src);
if (!hit.ok) fail(hit.reason);
console.log(`${LABEL} PASS — insurance_claim allowCreate; lawsuit stays false`);
