#!/usr/bin/env node
/**
 * Banking LoadAutocomplete — EntityPicker kind=load (not custom listLoads dropdown).
 * Cursor even claim: 2430.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-load-autocomplete-entity-picker";
const FILE = "apps/frontend/src/components/banking/LoadAutocomplete.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/EntityPicker[\s\S]*?kind=["']load["']/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind=load`);
  }
  if (!/data-load-autocomplete/.test(code)) {
    problems.push(`${FILE}: must keep data-load-autocomplete`);
  }
  if (/listLoads\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listLoads — use EntityPicker`);
  }
  if (/useQuery/.test(code)) {
    problems.push(`${FILE}: must not use local useQuery roster — EntityPicker owns fetch`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-bank-load-ac-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/banking");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "LoadAutocomplete.tsx"),
      `import { useQuery } from "@tanstack/react-query";
import { listLoads } from "../../api/loads";
export function LoadAutocomplete() {
  useQuery({ queryFn: () => listLoads({}) });
  return <div data-load-autocomplete="true"><input /></div>;
}`,
    );
    if (!collectProblems(stubRoot).length) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(stubRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — LoadAutocomplete EntityPicker kind=load`);
}
