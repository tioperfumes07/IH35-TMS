#!/usr/bin/env node
/**
 * ACCT-F5657 — owner ruling C2b (2026-07-26, "IT IS 2500 NOW") raised the driver escrow cap from
 * $2,000 to $2,500. The backend constant (escrow-resolver.service.ts's ESCROW_CAP_CENTS = 250_000)
 * and its own guard (verify-settlement-escrow-cap.mjs, which only scans .ts files under
 * apps/backend/src/driver-finance and apps/backend/src/accounting/settlement-posting) were both
 * already correct — but two OTHER surfaces outside that guard's scan scope (a .tsx display page and
 * a standalone .mjs proof script) still carried the superseded $2,000 literal: the settlement-close
 * screen showed "Cap $2,000" / a wrong "% to cap" to the person actually closing the settlement, and
 * an owner-facing net-zero attestation script was proving balance against the wrong cap.
 *
 * FAIL if either file still carries the superseded 2000-dollar / 200_000-cent literal. PASS when
 * both read 2500 / 250_000.
 *
 * Run:  node scripts/verify-escrow-cap-display-not-stale.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-cap-display-not-stale";

const FRONTEND_FILE = "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx";
const PROOF_SCRIPT_FILE = "scripts/proof/settlement-payrun-netzero.mjs";

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function analyzeFrontendSource(src) {
  const failures = [];
  const code = strip(src);
  if (!/const ESCROW_CAP_DOLLARS = 2500;/.test(code)) {
    failures.push(`${FRONTEND_FILE}: ESCROW_CAP_DOLLARS must be 2500 (owner ruling C2b) — a stale value here shows the wrong cap to the person closing a settlement (ACCT-F5657).`);
  }
  return failures;
}

export function analyzeProofScriptSource(src) {
  const failures = [];
  const code = strip(src);
  if (!/const ESCROW_CAP_CENTS = 250_000;/.test(code)) {
    failures.push(`${PROOF_SCRIPT_FILE}: ESCROW_CAP_CENTS must be 250_000 (owner ruling C2b) — a stale value here proves net-zero against the wrong cap (ACCT-F5657).`);
  }
  return failures;
}

export function run() {
  const frontend = fs.readFileSync(path.join(ROOT, FRONTEND_FILE), "utf8");
  const proofScript = fs.readFileSync(path.join(ROOT, PROOF_SCRIPT_FILE), "utf8");
  return [...analyzeFrontendSource(frontend), ...analyzeProofScriptSource(proofScript)];
}

if (process.argv.includes("--selftest")) {
  const goodFrontendFailures = analyzeFrontendSource("const ESCROW_CAP_DOLLARS = 2500;");
  if (goodFrontendFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture (frontend) FAILED: ${goodFrontendFailures.join("; ")}`);
  }
  if (!analyzeFrontendSource("const ESCROW_CAP_DOLLARS = 2000;").length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (frontend, stale $2,000) should FAIL but passed`);
  }

  const goodProofFailures = analyzeProofScriptSource("const ESCROW_CAP_CENTS = 250_000;");
  if (goodProofFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture (proof script) FAILED: ${goodProofFailures.join("; ")}`);
  }
  if (!analyzeProofScriptSource("const ESCROW_CAP_CENTS = 200_000;").length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (proof script, stale 200_000) should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly for both files`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — the settlement-close display and the standalone proof script both use the current $2,500 escrow cap`);
