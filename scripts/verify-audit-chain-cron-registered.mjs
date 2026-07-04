#!/usr/bin/env node
/**
 * verify-audit-chain-cron-registered.mjs
 * CI guard for G10-C1: the tamper-evident audit hash-chain verifier must stay WIRED.
 *
 * Regression it prevents: verifyEventChain() (apps/backend/src/audit/audit-chain-verify.service.ts) was
 * built but nothing invoked it — ops.audit_chain_verifications sat permanently empty, so a tamper of the
 * legal-evidence event log could sit undetected. This guard fails if that dead-code state ever returns.
 *
 * FAILS IF ANY OF:
 *   1. verifyEventChain has NO non-test, non-definition caller in apps/backend/src (dead code again).
 *   2. The cron tick service does not call verifyEventChain.
 *   3. The cron entrypoint (run-audit-chain-verify) is not registered as a render.yaml cron startCommand.
 *   4. The entrypoint does not invoke the tick service (wiring severed).
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const errors = [];

const SERVICE = "apps/backend/src/audit/audit-chain-verify.service.ts";
const TICK = "apps/backend/src/audit/audit-chain-verify.cron.service.ts";
const ENTRY = "apps/backend/src/audit/run-audit-chain-verify.ts";
const RENDER = "render.yaml";
const ENTRY_DIST = "dist/audit/run-audit-chain-verify.js";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    errors.push(`MISSING FILE: ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

// --- 1 + 2: verifyEventChain must have a real (non-test) caller ------------------------------------
// Enumerate every file under apps/backend/src that references verifyEventChain, excluding the definition
// file itself and any test/spec files. At least one such caller must remain.
let callerFiles = [];
try {
  const out = execSync(
    `grep -rl --include='*.ts' 'verifyEventChain' apps/backend/src`,
    { cwd: ROOT, encoding: "utf8" },
  );
  callerFiles = out.split("\n").map((s) => s.trim()).filter(Boolean);
} catch {
  // grep exits 1 when there are no matches — leave callerFiles empty (handled below).
}
const nonTestCallers = callerFiles.filter(
  (f) =>
    f !== SERVICE &&
    !/\.test\.ts$/.test(f) &&
    !/\.spec\.ts$/.test(f) &&
    !f.includes("/__tests__/"),
);
if (nonTestCallers.length === 0) {
  errors.push(
    "verifyEventChain has NO non-test caller in apps/backend/src — the audit-chain verifier is dead code again (G10-C1 regression).",
  );
}

const tick = read(TICK);
if (tick && !/verifyEventChain\s*\(/.test(tick)) {
  errors.push(`${TICK} does not call verifyEventChain() — the cron tick is not wired to the verifier.`);
}

// --- 3: render.yaml must register the cron entrypoint ---------------------------------------------
const render = read(RENDER);
if (render) {
  const registered =
    render.includes(ENTRY_DIST) && /type:\s*cron/.test(render) && /name:\s*audit-chain-verify/.test(render);
  if (!registered) {
    errors.push(
      `render.yaml does not register the audit-chain-verify cron (expected a 'type: cron' service named ` +
        `'audit-chain-verify' with startCommand running '${ENTRY_DIST}').`,
    );
  }
}

// --- 4: entrypoint must invoke the tick service --------------------------------------------------
const entry = read(ENTRY);
if (entry && !/runAuditChainVerifyTick\s*\(/.test(entry)) {
  errors.push(`${ENTRY} does not call runAuditChainVerifyTick() — the cron entrypoint is not wired.`);
}

if (errors.length > 0) {
  console.error("verify-audit-chain-cron-registered: FAIL");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log(
  `verify-audit-chain-cron-registered: OK (verifyEventChain wired via ${nonTestCallers.join(", ")}; ` +
    `render.yaml cron 'audit-chain-verify' → ${ENTRY_DIST})`,
);
