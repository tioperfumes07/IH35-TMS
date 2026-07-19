#!/usr/bin/env node
/**
 * verify-local-ci-gate-acyclic — locks the pre-push → C5 → local-ci graph as acyclic/single-owner
 * and the unforgeable VLCI ownership / static-sweep proof invariants.
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
    errs.push("verify-meta.json missing block_ready_c5_skip_orchestrators array");
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
    errs.push("block-ready.mjs must expose getC5SkipReason");
  }
  if (!files.blockReady.includes("orchestrator — single-owner outside C5")) {
    errs.push("block-ready C5 must log orchestrator skip reason");
  }
  if (!files.blockReady.includes("ensureVerifyStaticOnce")) {
    errs.push("block-ready.mjs must call ensureVerifyStaticOnce (static once / fail closed)");
  }
  if (!files.staticProof.includes("Symbol.for") && !files.staticProof.includes("Symbol.for(")) {
    errs.push("static-sweep-proof.mjs must use Symbol.for in-process proof (not env)");
  }
  if (!files.staticProof.includes("export function ensureVerifyStaticOnce")) {
    errs.push("static-sweep-proof.mjs must export ensureVerifyStaticOnce");
  }

  if (!files.precheck.includes("verify:static is owned once by block-ready") &&
      !files.precheck.includes("Do not duplicate")) {
    errs.push("branch-precheck-push must document that verify:static is not duplicated");
  }
  if (/label:\s*["']verify-static["']/.test(files.precheck) && files.precheck.includes("buildPrecheckSteps")) {
    // buildPrecheckSteps must not list verify-static as a primary step
    const buildMatch = files.precheck.match(/export function buildPrecheckSteps[\s\S]*?^}/m);
    if (buildMatch && buildMatch[0].includes("verify-static")) {
      errs.push("buildPrecheckSteps must not include verify-static (block-ready owns it)");
    }
  }

  if (!files.lifecycle.includes("export function validateOwnershipProof")) {
    errs.push("vlci-lifecycle.mjs must export validateOwnershipProof");
  }
  if (!files.lifecycle.includes("export function createOwnerSession")) {
    errs.push("vlci-lifecycle.mjs must export createOwnerSession");
  }
  if (!files.lifecycle.includes("IH35_VLCI_TOKEN") && !files.lifecycle.includes('TOKEN: "IH35_VLCI_TOKEN"')) {
    errs.push("vlci-lifecycle.mjs must define IH35_VLCI_TOKEN");
  }
  if (!files.lifecycle.includes("LOCK_PATH override rejected") && !files.lifecycle.includes("override rejected")) {
    errs.push("vlci-lifecycle.mjs must reject IH35_VLCI_LOCK_PATH overrides");
  }
  if (!files.lifecycle.includes("installLifecycleCleanupHandlers")) {
    errs.push("vlci-lifecycle.mjs must export installLifecycleCleanupHandlers");
  }
  if (
    !files.lifecycle.includes("export function createPrivateTempRoot") ||
    !files.lifecycle.includes("fs.mkdtempSync") ||
    !files.lifecycle.includes("PRIVATE_DIR_MODE = 0o700")
  ) {
    errs.push("vlci-lifecycle.mjs must atomically create a private 0700 run root");
  }
  if (
    !files.lifecycle.includes("PRIVATE_FILE_MODE = 0o600") ||
    !files.lifecycle.includes("O_NOFOLLOW") ||
    !files.lifecycle.includes("O_EXCL")
  ) {
    errs.push("vlci lock files must use 0600 exclusive no-follow creation");
  }
  if (/path\.join\(\s*os\.tmpdir\(\)[\s\S]{0,100}\.lock/.test(files.lifecycle)) {
    errs.push("vlci lock must not be created directly in the shared OS temp directory");
  }
  // Free-env ownership must not authorize via OWNED===\"1\" alone in isLocalVerifyDatabaseUrl
  if (/env\[VLCI_ENV\.OWNED\]\s*===\s*["']1["']/.test(files.lifecycle) &&
      files.lifecycle.includes("return env[VLCI_ENV.OWNED]")) {
    errs.push("isLocalVerifyDatabaseUrl must not authorize via OWNED=1 alone");
  }

  if (!files.localCi.includes("startEphemeralPgWithRetry")) {
    errs.push("verify-local-ci.mjs must use startEphemeralPgWithRetry (port TOCTOU)");
  }
  if (!files.localCi.includes("installLifecycleCleanupHandlers")) {
    errs.push("verify-local-ci.mjs must install SIGINT/SIGTERM cleanup handlers");
  }
  if (!files.localCi.includes("createOwnerSession")) {
    errs.push("verify-local-ci.mjs must createOwnerSession (token+lock bound)");
  }
  if (!files.localCi.includes("tempRoot: session.tempRoot")) {
    errs.push("verify-local-ci.mjs must create PostgreSQL data under the private owner temp root");
  }
  if (/mkdtempSync\(\s*path\.join\(\s*os\.tmpdir\(\)\s*,\s*["']vlci-pgdata-/.test(files.localCi)) {
    errs.push("verify-local-ci.mjs must not create PostgreSQL data directly in shared OS temp");
  }
  if (/const\s+PORT\s*=\s*54329/.test(files.localCi) && !files.localCi.includes("allocateEphemeralPort")) {
    errs.push("verify-local-ci.mjs still hardcodes PORT=54329 as the sole ephemeral bind port");
  }

  if (!files.dbReset.includes("isLocalVerifyDatabaseUrl")) {
    errs.push("verify-db-reset.mjs must use isLocalVerifyDatabaseUrl");
  }
  if (!files.dbReset.includes("repoRoot")) {
    errs.push("verify-db-reset.mjs must pass repoRoot into isLocalVerifyDatabaseUrl for proof");
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
    staticProof: fs.readFileSync(path.join(root, "scripts/static-sweep-proof.mjs"), "utf8"),
    precheck: fs.readFileSync(path.join(root, "scripts/branch-precheck-push.mjs"), "utf8"),
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
      'block_ready_c5_skip_orchestrators\nexport function getC5SkipReason(){}\nconsole.log("orchestrator — single-owner outside C5")\nensureVerifyStaticOnce',
    localCi:
      "createOwnerSession\nstartEphemeralPgWithRetry(pgBin, { tempRoot: session.tempRoot })\ninstallLifecycleCleanupHandlers\nallocateEphemeralPort",
    dbReset: "isLocalVerifyDatabaseUrl(verifyUrl, process.env, { repoRoot: REPO_ROOT })",
    lifecycle:
      'TOKEN: "IH35_VLCI_TOKEN"\nconst PRIVATE_DIR_MODE = 0o700;\nconst PRIVATE_FILE_MODE = 0o600;\nconst O_NOFOLLOW = 1;\nconst O_EXCL = 2;\nfs.mkdtempSync();\nexport function createPrivateTempRoot(){}\nexport function validateOwnershipProof(){}\nexport function createOwnerSession(){}\noverride rejected\ninstallLifecycleCleanupHandlers\nreturn { mode: "reject" };',
    staticProof: 'Symbol.for("ih35.verifyStatic.sweepProof")\nexport function ensureVerifyStaticOnce(){}',
    precheck:
      "export function buildPrecheckSteps() {\n  // verify:static is owned once by block-ready. Do not duplicate here.\n  return [{ label: \"block-ready\" }];\n}",
  };
  const badOwned = {
    ...good,
    lifecycle: good.lifecycle + '\nreturn env[VLCI_ENV.OWNED] === "1";',
  };
  // Force the anti-pattern into isLocalVerifyDatabaseUrl-shaped code
  badOwned.lifecycle = `
export function isLocalVerifyDatabaseUrl(verifyUrl, env) {
  if (port === "54329") return true;
  return env[VLCI_ENV.OWNED] === "1";
}
export function validateOwnershipProof(){}
export function createOwnerSession(){}
override rejected
installLifecycleCleanupHandlers
TOKEN: "IH35_VLCI_TOKEN"
return { mode: "reject" };
`;
  const badMeta = {
    ...good,
    meta: JSON.stringify({ block_ready_c5_skip_orchestrators: ["verify:static"] }),
  };
  const badTemp = {
    ...good,
    lifecycle: good.lifecycle.replace("export function createPrivateTempRoot(){}", ""),
  };
  const g = check(good);
  const b1 = check(badMeta);
  const b2 = check(badOwned);
  const b3 = check(badTemp);
  let bad = 0;
  const say = (ok, n) => {
    if (!ok) bad += 1;
    console.log(`${ok ? "ok  " : "FAIL"}  ${n}`);
  };
  say(g.length === 0, `good fixture passes (${g.join("; ")})`);
  say(b1.some((e) => e.includes("verify:local-ci")), "missing orchestrator skip flagged");
  say(b2.some((e) => e.includes("OWNED=1")), "OWNED=1 free-env authorize flagged");
  say(b3.some((e) => e.includes("private 0700")), "insecure temp-root fixture flagged");
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
  console.log(`[${LABEL}] OK — acyclic C5 + unforgeable VLCI ownership + static-once proof invariants hold.`);
}
