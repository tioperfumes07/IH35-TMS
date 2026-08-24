#!/usr/bin/env node
/**
 * verify-users-create-picker-applicability.mjs
 * LV-USERS-CREATE-PICKER-LAW-FALSE-REQUIRED
 *
 * users.create must NOT claim picker_law — Create User drawer has Name/Email/Role
 * enum/password fields only (no canonical entity FK / EntityPicker / + Add new).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-users-create-picker-applicability";
const REQ = "docs/specs/scoreboard/modules/users.required.json";
const PAGE = "apps/frontend/src/pages/Users.tsx";
const LEAF = "create";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const j = JSON.parse(read(REQ));
  const leaf = (j.leaves ?? []).find((l) => l.id === LEAF);
  if (!leaf) {
    failures.push(`${LEAF} missing from users.required.json`);
    return failures;
  }
  if ((leaf.required ?? []).includes("picker_law")) {
    failures.push(`${LEAF} must not require picker_law (no canonical-entity field)`);
  }
  if (!(leaf.required ?? []).includes("connectivity")) {
    failures.push(`${LEAF} must keep connectivity`);
  }
  const honesty = j.honesty_audit ?? {};
  const block = honesty.create_picker_law_2026_08_17;
  if (!block) {
    failures.push("honesty_audit.create_picker_law_2026_08_17 block missing");
  } else {
    const drop = (block.drops ?? []).find((d) => d.id === LEAF);
    if (!drop || !(drop.removed ?? []).includes("picker_law")) {
      failures.push("honesty drop must remove picker_law from create");
    }
  }
  const page = read(PAGE);
  // Create User drawer region — no EntityPicker / ReferenceSelect / allowCreate entity chrome.
  if (!/title=\"Create User\"/.test(page)) {
    failures.push("Users.tsx must still mount Create User drawer title");
  }
  if (/EntityPicker|ReferenceSelect/.test(page)) {
    failures.push("Users.tsx must not mount EntityPicker/ReferenceSelect while create picker_law is dropped");
  }
  if (!page.includes("Select an operating company before creating a user")) {
    failures.push("Users.tsx + Create User must toast when no operating company — opening the drawer anyway was a silent POST");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const reqPath = path.join(process.cwd(), REQ);
  const original = fs.readFileSync(reqPath, "utf8");
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
  console.log(`${LABEL} PASS — users.create owes connectivity (+qbo_chrome) only (no picker_law)`);
}

main();
