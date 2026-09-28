#!/usr/bin/env node
// ROUND 203/205 (owner, 2026-09-28) — verify-truck-line-surface-tokens-locked.mjs
//
// Owner: "white background, wrong contrast between elements... tokens for surface/border/text."
// TruckLineBoard.tsx had drifted off the LOCKED GLOBAL-TYPE-SIZE-BASELINE.md palette for its own
// surface/border/text roles: #C7D2DC instead of the locked border #E5E7EB, #F4F7FA instead of the
// locked page background #F7F8FA, #374151/#1F2937 instead of the locked secondary/primary text
// #1F2A44/#0F1219. This guard does NOT restrict the file to only 8 hexes (unlike
// verify-banking-controls-boxed-and-tokenized.mjs) — this board legitimately carries many other
// deliberate, locked semantic colors (GREEN/RED/NAVY status, the verbatim-locked tractor/trailer
// SVG illustration, exception/on-time tints) that are correct as-is and must not be flagged. It
// instead asserts the four RETIRED/drifted values never reappear, and that the file actually wires
// its border/secondary-text roles to the shared apps/frontend/src/design/locked-baseline-tokens.ts
// module (not just a coincidental hex match) so the two never drift apart again.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-truck-line-surface-tokens-locked";
export const ALLOW_OFFLINE_SKIP = "pure static source-shape check, no live data involved";

const TARGET_FILE = "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx";
const TOKENS_FILE = "apps/frontend/src/design/locked-baseline-tokens.ts";

// The exact drifted values this round replaced — none of these may ever reappear in the target file.
const RETIRED_HEX = ["#C7D2DC", "#F4F7FA", "#374151", "#1F2937"];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function checkFile(src) {
  const failures = [];
  const clean = stripComments(src);
  for (const hex of RETIRED_HEX) {
    if (clean.toUpperCase().includes(hex.toUpperCase())) {
      failures.push(`retired/drifted hex ${hex} reappeared — must be one of the locked baseline tokens instead`);
    }
  }
  if (!/from ["']\.\.\/\.\.\/design\/locked-baseline-tokens["']/.test(clean)) {
    failures.push("does not import from ../../design/locked-baseline-tokens — border/text roles must reference the shared locked module, not a coincidental hex match");
  }
  if (!/LOCKED_BORDER/.test(clean) || !/LOCKED_TEXT_SECONDARY/.test(clean)) {
    failures.push("does not reference LOCKED_BORDER and LOCKED_TEXT_SECONDARY from the shared tokens module");
  }
  return failures;
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, TARGET_FILE), "utf8");
  if (checkFile(good).length !== 0) {
    console.error(`${LABEL} SELFTEST FAILED: real current file must pass with 0 failures, got: ${checkFile(good).join("; ")}`);
    process.exit(1);
  }
  for (const hex of RETIRED_HEX) {
    const mutated = good + `\nconst plantedDrift = "${hex}";\n`;
    const failures = checkFile(mutated);
    if (!failures.some((f) => f.includes(hex))) {
      console.error(`${LABEL} SELFTEST FAILED: planting retired hex ${hex} was not caught`);
      process.exit(1);
    }
  }
  const strippedImport = good.replace(/import \{ LOCKED_BORDER, LOCKED_TEXT_SECONDARY \} from "\.\.\/\.\.\/design\/locked-baseline-tokens";\n?/, "");
  if (checkFile(strippedImport).length === 0) {
    console.error(`${LABEL} SELFTEST FAILED: removing the locked-tokens import must be caught`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 4 retired hexes caught, missing import caught, real file passes`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

function main() {
  const targetPath = path.join(ROOT, TARGET_FILE);
  const tokensPath = path.join(ROOT, TOKENS_FILE);
  const failures = [];
  if (!fs.existsSync(tokensPath)) {
    failures.push(`${TOKENS_FILE} does not exist — the shared locked baseline tokens module must exist.`);
  }
  if (!fs.existsSync(targetPath)) {
    failures.push(`${TARGET_FILE} does not exist.`);
  } else {
    failures.push(...checkFile(fs.readFileSync(targetPath, "utf8")));
  }
  if (failures.length) {
    console.error(`${LABEL}: FAIL — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — no retired/drifted surface/border/text hex remains, border + secondary-text roles wired to the shared locked baseline tokens module.`);
}

main();
