#!/usr/bin/env node
/**
 * POD Review load filter — EntityPicker kind=load (not listDispatchLoads limit:50 + <select>).
 * Cursor even claim: 2466.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pod-review-load-entity-picker";
const FILE = "apps/frontend/src/pages/dispatch/PodReviewPage.tsx";

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
    problems.push(`${FILE}: load filter must use EntityPicker kind=load`);
  }
  if (/listDispatchLoads\s*\(/.test(code)) {
    problems.push(`${FILE}: must not silent-fetch listDispatchLoads for the load filter`);
  }
  if (/data-testid=["']pod-load-filter["'][\s\S]{0,80}<select/.test(code) || /<select[\s\S]{0,120}pod-load-filter/.test(code)) {
    problems.push(`${FILE}: must not use native <select> for load filter`);
  }
  if (!/allowCreate=\{false\}/.test(code)) {
    problems.push(`${FILE}: load FILTER must pass allowCreate={false}`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-pod-load-ep-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/dispatch");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "PodReviewPage.tsx"),
      `listDispatchLoads({ limit: 50 })\n<select data-testid="pod-load-filter">{loadOptions.map(...)}</select>`,
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
  console.log(`${LABEL} OK — PodReview load EntityPicker`);
}
