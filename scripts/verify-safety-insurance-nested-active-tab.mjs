#!/usr/bin/env node
/**
 * INS-CLAIMS-ROUTE — SafetyLayout must prefix-match /safety/insurance/* to the insurance
 * tab id, not fall through to driver-files chrome (Cascade USMCA wire FAIL 2026-08-09).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-insurance-nested-active-tab";
const FILE = "apps/frontend/src/pages/safety/SafetyLayout.tsx";

function audit(src) {
  const problems = [];
  const hasPrefix = src.includes("startsWith(`${route}/`)");
  const hasLongest = /route\.length/.test(src) && /\.sort\(/.test(src);
  if (!hasPrefix) problems.push("missing path.startsWith(`${route}/`) prefix match");
  if (!hasLongest) problems.push("missing longest-prefix sort by route.length");
  if (src.includes("if (tab.route === path) return tab.id;") && !hasPrefix) {
    problems.push("exact-only tab.route === path without prefix match");
  }
  return problems;
}

function main() {
  const abs = path.join(ROOT, FILE);
  const src = fs.readFileSync(abs, "utf8");

  if (process.argv.includes("--selftest")) {
    const planted = src.replaceAll("startsWith(`${route}/`)", "/* PLANTED_REMOVED_PREFIX */");
    const plantedProblems = audit(planted);
    if (!plantedProblems.some((p) => /prefix match/.test(p))) {
      console.error(`${LABEL} SELFTEST FAIL: planted removal not detected`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS`);
    process.exit(0);
  }

  const problems = audit(src);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n` + problems.map((p) => `  ✗ ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
