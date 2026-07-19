#!/usr/bin/env node
/**
 * verify-local-ci-gate-acyclic — locks the pre-push → C5 → local-ci graph as acyclic/single-owner.
 *
 * Plants the 2026-07-19 deadlock class:
 *   branch:precheck-push → verify:static → block-ready C5 → npm run verify:local-ci
 *   (nested full verify:pre-commit + fixed port 54329 contention).
 *
 * Asserts:
 *   (1) verify-meta lists verify:local-ci + verify:static as C5 orchestrator skips
 *   (2) block-ready uses getC5SkipReason / block_ready_c5_skip_orchestrators
 *   (3) verify-local-ci fails closed on nested IH35_VLCI_ACTIVE
 *   (4) verify-local-ci uses dynamic port allocation (not sole fixed 54329 lifecycle)
 *   (5) db-reset accepts VLCI-owned dynamic local ih35_verify URLs via isLocalVerifyDatabaseUrl
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { C5_ORCHESTRATOR_SCRIPTS } from "./vlci-lifecycle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-local-ci-gate-acyclic";

export function check(files) {
  const errs = [];
  const meta = JSON.parse(files.meta);
  const orch = meta.block_ready_c5_skip_orchestrators;
  if (!Array.isArray(orch)) {
    errs.push('verify-meta.json missing block_ready_c5_skip_orchestrators array');
  } else {
    for (const name of C5_ORCHESTRATOR_SCRIPTS) {
      if (!orch.includes(name)) {
        errs.push(`verify-meta.json must list "${name}" in block_ready_c5_skip_orchestrators`);
      }
    }
  }

  if (!files.blockReady.includes("block_ready_c5_skip_orchestrators")) {
    errs.push("block-ready.mjs must read block_ready_c5_skip_orchestrators from verify-meta");
  }
  if (!files.blockReady.includes("getC5SkipReason")) {
    errs.push("block-ready.mjs must expose getC5SkipReason for orchestrator vs C4 skip reasons");
  }
  if (!files.blockReady.includes("orchestrator — single-owner outside C5")) {
    errs.push("block-ready C5 must log orchestrator skip reason (single-owner outside C5)");
  }

  if (!files.localCi.includes("resolveVlciLifecycle") && !files.localCi.includes("IH35_VLCI_ACTIVE")) {
    errs.push("verify-local-ci.mjs must fail closed on nested IH35_VLCI_ACTIVE");
  }
  if (!files.localCi.includes("allocateEphemeralPortSync") && !files.localCi.includes("allocateEphemeralPort")) {
    errs.push("verify-local-ci.mjs must allocate an ephemeral port (no sole fixed-port lifecycle)");
  }
  // Forbid the old fixed-only lifecycle signature as the only port binding path.
  if (/const\s+PORT\s*=\s*54329/.test(files.localCi) && !files.localCi.includes("allocateEphemeralPort")) {
    errs.push("verify-local-ci.mjs still hardcodes PORT=54329 as the sole ephemeral bind port");
  }

  if (!files.dbReset.includes("isLocalVerifyDatabaseUrl")) {
    errs.push("verify-db-reset.mjs must use isLocalVerifyDatabaseUrl (VLCI-owned dynamic ports)");
  }
  if (!files.lifecycle.includes("export function isLocalVerifyDatabaseUrl")) {
    errs.push("vlci-lifecycle.mjs must export isLocalVerifyDatabaseUrl");
  }
  if (!files.lifecycle.includes("export function acquireExclusiveLock")) {
    errs.push("vlci-lifecycle.mjs must export acquireExclusiveLock (single-owner)");
  }
  if (!files.lifecycle.includes("mode: \"reject\"") && !files.lifecycle.includes("mode: 'reject'")) {
    errs.push("vlci-lifecycle.mjs must reject nested ACTIVE invocations");
  }

  return errs;
}

function loadRepoFiles(root = ROOT) {
  return {
    meta: fs.readFileSync(path.join(root, "scripts/verify-meta.json"), "utf8"),
    blockReady: fs.readFileSync(path.join(root, "scripts/block-ready.mjs"), "utf8"),
    localCi: fs.readFileSync(path.join(root, "scripts/verify-local-ci.mjs"), "utf8"),
    dbReset: fs.readFileSync(path.join(root, "scripts/verify-db-reset.mjs"), "utf8"),
    lifecycle: fs.readFileSync(path.join(root, "scripts/vlci-lifecycle.mjs"), "utf8"),
  };
}

export function runGuard(root = ROOT) {
  const errs = check(loadRepoFiles(root));
  return { ok: errs.length === 0, errs };
}

function selftest() {
  const good = {
    meta: JSON.stringify({
      block_ready_c5_skip_orchestrators: ["verify:local-ci", "verify:static"],
    }),
    blockReady:
      'block_ready_c5_skip_orchestrators\nexport function getC5SkipReason(){}\nconsole.log("orchestrator — single-owner outside C5")',
    localCi: 'resolveVlciLifecycle\nallocateEphemeralPortSync\nIH35_VLCI_ACTIVE',
    dbReset: "isLocalVerifyDatabaseUrl(verifyUrl, process.env)",
    lifecycle:
      'export function isLocalVerifyDatabaseUrl(){}\nexport function acquireExclusiveLock(){}\nreturn { mode: "reject", reason: "nested" };',
  };
  const badMeta = {
    ...good,
    meta: JSON.stringify({ block_ready_c5_skip_orchestrators: ["verify:static"] }),
  };
  const badFixedPort = {
    ...good,
    localCi: "const PORT = 54329;\nstartEphemeralPg(pgBin);",
  };
  const g = check(good);
  const b1 = check(badMeta);
  const b2 = check(badFixedPort);
  let bad = 0;
  const say = (ok, n) => {
    if (!ok) bad += 1;
    console.log(`${ok ? "ok  " : "FAIL"}  ${n}`);
  };
  say(g.length === 0, "good fixture passes");
  say(b1.some((e) => e.includes("verify:local-ci")), "missing orchestrator skip flagged");
  say(b2.some((e) => e.includes("54329") || e.includes("ephemeral")), "fixed-only PORT=54329 flagged");
  if (bad) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${bad}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, errs } = runGuard();
  if (!ok) {
    console.error(`[${LABEL}] FAIL:\n         ${errs.join("\n         ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — C5 orchestrator skip + VLCI single-owner/dynamic-port invariants hold.`);
}
