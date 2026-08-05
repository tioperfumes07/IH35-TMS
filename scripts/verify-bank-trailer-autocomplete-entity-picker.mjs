#!/usr/bin/env node
/**
 * Banking TrailerAutocomplete — EntityPicker kind=trailer (not custom listUnits include=trailers).
 * Cursor even claim: 2432.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-trailer-autocomplete-entity-picker";
const FILE = "apps/frontend/src/components/banking/TrailerAutocomplete.tsx";

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
  if (!/EntityPicker[\s\S]*?kind=["']trailer["']/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind=trailer`);
  }
  if (!/data-trailer-autocomplete/.test(code)) {
    problems.push(`${FILE}: must keep data-trailer-autocomplete`);
  }
  if (/listUnits\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits — use EntityPicker`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-bank-trailer-ac-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/banking");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "TrailerAutocomplete.tsx"),
      `import { useQuery } from "@tanstack/react-query";
import { listUnits } from "../../api/mdata";
export function TrailerAutocomplete() {
  useQuery({ queryFn: () => listUnits({ include: "trailers" }) });
  return <div data-trailer-autocomplete="true"><input /></div>;
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
  console.log(`${LABEL} OK — TrailerAutocomplete EntityPicker kind=trailer`);
}
