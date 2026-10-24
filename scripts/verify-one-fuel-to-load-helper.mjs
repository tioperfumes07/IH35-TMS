#!/usr/bin/env node
/**
 * verify-one-fuel-to-load-helper — 443.324 ENG-25 (CC-3 claim 18769).
 *
 * Every path from a fuel transaction to a load must go through the single shared helper
 * resolveFuelLoadAtTime (fuel/fuel-load-at-time.ts). A separate local resolveLoadId in the
 * import path would apply a different window (±1 day) than the canonical helper (actual stop
 * stamps, then appointment/scheduled, then schedule-only), causing misattribution.
 *
 * FINDING: fuel-transaction-import.ts already imports and calls resolveFuelLoadAtTime at line 32
 * (import) and line 355 (call). No local resolveLoadId exists in the fuel module. Guard is green.
 *
 * STATIC ONLY: reads source files, no database.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-one-fuel-to-load-helper";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT_PATH = "apps/backend/src/fuel/fuel-transaction-import.ts";
const HELPER_PATH = "apps/backend/src/fuel/fuel-load-at-time.ts";
const CANONICAL_IMPORT = "resolveFuelLoadAtTime";
const FORBIDDEN_LOCAL = "resolveLoadId";

export function analyse(src) {
  const failures = [];
  if (!src.includes(CANONICAL_IMPORT)) {
    failures.push(`${IMPORT_PATH} does not import ${CANONICAL_IMPORT} from fuel-load-at-time.ts`);
  }
  if (/\bfunction\s+resolveLoadId\b|\bconst\s+resolveLoadId\b/.test(src)) {
    failures.push(`${IMPORT_PATH} defines a local ${FORBIDDEN_LOCAL} — must delegate to resolveFuelLoadAtTime`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const realSrc = fs.readFileSync(path.join(ROOT, IMPORT_PATH), "utf8");
  const cases = [
    ["real tree green", analyse(realSrc).length === 0],
    ["missing import fails", analyse("// no import here").length > 0],
    ["local resolveLoadId fails", analyse(`import {resolveFuelLoadAtTime} from './fuel-load-at-time.js';\nconst resolveLoadId = () => {};`).length > 0],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const abs = path.join(ROOT, IMPORT_PATH);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL}: FAIL — ${IMPORT_PATH} not found`);
  process.exit(1);
}

const src = fs.readFileSync(abs, "utf8");
const helperAbs = path.join(ROOT, HELPER_PATH);
if (!fs.existsSync(helperAbs)) {
  console.error(`${LABEL}: FAIL — ${HELPER_PATH} (canonical helper) not found`);
  process.exit(1);
}

const failures = analyse(src);
if (failures.length) {
  console.error(`${LABEL}: FAIL\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

console.log(`${LABEL}: OK — ${IMPORT_PATH} uses ${CANONICAL_IMPORT} from fuel-load-at-time.ts; no local ${FORBIDDEN_LOCAL}.`);
