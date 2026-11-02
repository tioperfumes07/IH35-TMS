#!/usr/bin/env node
/**
 * verify-legal-matter-claim-picker-create.mjs
 * LegalMatterFormFields: insurance_claim allowCreate. ENG-60 (202616310100): insurance.lawsuit and the matter's
 * insurance_lawsuit_id link are retired — a lawsuit IS a legal matter (type lawsuit) — so the form must carry NO
 * insurance_lawsuit picker at all (a picker there would write into a dropped column).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-legal-matter-claim-picker-create";
const TARGET = "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx";

function extractPicker(src, kind) {
  const re = new RegExp(`<EntityPicker[\\s\\S]*?kind="${kind}"[\\s\\S]*?\\/>`, "m");
  const m = src.match(re);
  return m ? m[0] : null;
}

function pickerAllowsCreate(block) {
  if (/allowCreate=\{false\}/.test(block)) return false;
  return /\ballowCreate\b/.test(block);
}

function analyze(src) {
  const claim = extractPicker(src, "insurance_claim");
  if (!claim) return { ok: false, reason: "missing insurance_claim EntityPicker" };
  if (!pickerAllowsCreate(claim)) {
    return { ok: false, reason: "insurance_claim must allowCreate (true/default)" };
  }
  if (extractPicker(src, "insurance_lawsuit")) {
    return { ok: false, reason: "insurance_lawsuit picker must not exist (ENG-60: insurance.lawsuit + insurance_lawsuit_id retired)" };
  }
  return { ok: true };
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const badClaim = `
    <EntityPicker kind="insurance_claim" allowCreate={false} />
  `;
  const badLawsuit = `
    <EntityPicker kind="insurance_claim" allowCreate />
    <EntityPicker kind="insurance_lawsuit" allowCreate={false} />
  `;
  const good = `
    <EntityPicker kind="insurance_claim" allowCreate />
  `;
  if (analyze(badClaim).ok) fail("selftest expected BAD claim to fail");
  if (analyze(badLawsuit).ok) fail("selftest expected BAD lawsuit to fail");
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
console.log(`${LABEL} PASS — insurance_claim allowCreate; no insurance_lawsuit picker (ENG-60 retired)`);
