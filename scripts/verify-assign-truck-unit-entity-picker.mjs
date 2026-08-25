#!/usr/bin/env node
/** AssignTruckModal — EntityPicker unit (not silent listUnits limit:500 + select). Claim 2150. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-assign-truck-unit-entity-picker";
const FILE = "apps/frontend/src/components/driver-profile/AssignTruckModal.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/EntityPicker/.test(code) || !/kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind="unit"`);
  }
  if (/allowCreate=\{false\}/.test(code)) {
    problems.push(`${FILE}: CREATE chrome must allow inline + Create unit (not allowCreate={false})`);
  }
  if (!/\ballowCreate\b/.test(code)) {
    problems.push(`${FILE}: must set allowCreate for picker-law inline create`);
  }
  if (/listUnits\(/.test(code)) problems.push(`${FILE}: must not call listUnits directly`);
  if (/SelectCombobox/.test(code) || /<select[\s>]/.test(code)) {
    problems.push(`${FILE}: must not use SelectCombobox/select for unit`);
  }
  if (/limit:\s*500/.test(code)) problems.push(`${FILE}: must not silent-fetch limit:500`);
  if (!/catch\s*\(\s*err\s*\)/.test(code)) {
    problems.push(`${FILE}: rejected default-truck assignment must be caught`);
  }
  if (!/userFacingApiError\s*\(\s*err\s*,\s*["']Could not assign default truck["']\s*\)/.test(code)) {
    problems.push(`${FILE}: assignment failure must preserve the backend detail`);
  }
  if (!/role=["']alert["']/.test(code) || !/\{error\}/.test(code)) {
    problems.push(`${FILE}: assignment failure must render an accessible operator alert`);
  }
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) { console.error(LABEL, "SELFTEST FAIL", baseline); process.exit(1); }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-assign-truck-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/driver-profile");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "AssignTruckModal.tsx"), `listUnits({ limit: 500 })\n<SelectCombobox><option/></SelectCombobox>\n`);
    if (!collectProblems(stubRoot).length) { console.error("planted miss"); process.exit(1); }
    fs.writeFileSync(
      path.join(dir, "AssignTruckModal.tsx"),
      `<EntityPicker kind="unit" allowCreate={false} />\n`
    );
    if (!collectProblems(stubRoot).some((p) => /allowCreate/.test(p))) {
      console.error("planted allowCreate={false} miss");
      process.exit(1);
    }
    const live = readRel(ROOT, FILE);
    for (const [name, mutation] of [
      ["catch", live.replace(/\}\s*catch\s*\(err\)\s*\{[\s\S]*?\}\s*finally/, "} finally")],
      ["detail", live.replace(/userFacingApiError\(err,\s*"Could not assign default truck"\)/, '"Could not assign default truck"')],
      ["alert", live.replace(/role="alert"/, 'role="status"')],
    ]) {
      fs.writeFileSync(path.join(dir, "AssignTruckModal.tsx"), mutation);
      if (!collectProblems(stubRoot).length) {
        console.error(`planted ${name} miss`);
        process.exit(1);
      }
    }
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) { console.error(LABEL, "FAIL", problems); process.exit(1); }
  console.log(LABEL, "OK");
}
