#!/usr/bin/env node
/**
 * LV-REFERENCESELECT-CANNOT-BIND-A-LABEL: ReferenceSelect must accept an `id` prop and forward it to
 * the underlying Combobox input so that `<label htmlFor={...}>` binds correctly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/frontend/src/components/parity/ReferenceSelect.tsx");
const SELFTEST = process.argv.includes("--selftest");

function fail(msg) {
  console.error(`[verify-referenceselect-id-binding] ${msg}`);
  process.exit(1);
}

function run() {
  const src = fs.readFileSync(FILE, "utf8");
  const checks = [
    ["id in props type", /id\?:\s*string/.test(src)],
    ["id destructured", /\bid\b/.test(src)],
    ["id forwarded to Combobox", /<Combobox[\s\S]{0,200}?id\s*=\s*\{id\}/.test(src)],
    ["id prop documented", /C1-A11Y|htmlFor|label/i.test(src)],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length > 0) {
    fail(`ReferenceSelect id binding incomplete: ${missing.join(", ")}`);
  }
  return { ok: true, message: "ReferenceSelect accepts id and forwards it to Combobox" };
}

if (SELFTEST) {
  const { ok, message } = run();
  console.log(`verify-referenceselect-id-binding --selftest ${ok ? "PASS" : "FAIL"}: ${message}`);
  process.exit(ok ? 0 : 1);
}

const { ok, message } = run();
console.log(`verify-referenceselect-id-binding OK — ${message}`);
process.exit(ok ? 0 : 1);
