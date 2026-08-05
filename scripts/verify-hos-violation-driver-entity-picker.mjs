#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hos-violation-driver-entity-picker";
const FILE = "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/EntityPicker[\s\S]*?kind=["']driver["']/.test(code)) problems.push(`${FILE}: EntityPicker kind=driver`);
  if (/DriverPickerWithCreate/.test(code)) problems.push(`${FILE}: no DriverPickerWithCreate`);
  return problems;
}
if (process.argv.includes("--selftest")) {
  if (collectProblems().length) process.exit(1);
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-hos-violation-driver-entity-picker-"));
  try {
    fs.mkdirSync(path.join(stubRoot, path.dirname(FILE)), { recursive: true });
    fs.writeFileSync(path.join(stubRoot, FILE), "<DriverPickerWithCreate />");
    if (!collectProblems(stubRoot).length) process.exit(1);
  } finally { fs.rmSync(stubRoot, { recursive: true, force: true }); }
  console.log(LABEL, "SELFTEST OK");
} else {
  const p = collectProblems();
  if (p.length) { console.error(p); process.exit(1); }
  console.log(LABEL, "OK");
}
