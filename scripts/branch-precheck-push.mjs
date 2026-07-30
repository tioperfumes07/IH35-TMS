#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { currentBranch, repoRoot, runGitOrThrow } from "./branch-rebuild-linear.mjs";
import {
  loadCapabilityPolicy,
  validateCapabilitySkip,
} from "./push-gate-capability-policy.mjs";
import {
  VLCI_ENV,
  isLocalVerifyDatabaseUrl,
  validateOwnershipProof,
} from "./vlci-lifecycle.mjs";

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const GATE_RESULT_CATEGORIES = Object.freeze({
  PASS: "pass",
  BRANCH: "branch",
  DIRTY: "dirty",
  CONFLICT: "conflict",
  FRESHNESS: "freshness",
  CAPABILITY: "capability",
  TEST: "test",
});

function tailLines(text, count = 30) {
  return `${text ?? ""}`.split(/\r?\n/).slice(-count).join("\n");
}

function listVerifyScripts(root) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(root, "package.json"), "utf8"));
  return Object.keys(pkg.scripts ?? {})
    .filter((name) => name.startsWith("verify:"))
    .sort();
}

function readVerifyMeta(root) {
  const metaPath = path.resolve(root, "scripts/verify-meta.json");
  if (!fs.existsSync(metaPath)) return [];
  const data = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  return Array.isArray(data.db_gated_verify_scripts) ? data.db_gated_verify_scripts : [];
}

export function discoverVerifyScripts(root, dbGated = []) {
  const gated = new Set(dbGated);
  return listVerifyScripts(root).filter((name) => !gated.has(name));
}

export function isFeatureBranch(branchName) {
  return Boolean(branchName && branchName !== "main" && branchName !== "HEAD");
}

export function behindOriginMainCount(root) {
  return Number(runGitOrThrow(["rev-list", "--count", "HEAD..origin/main"], { cwd: root }) || "0");
}

// Paths where correctness depends on GLOBAL allocation, not on file identity: two branches can touch
// two DIFFERENT migration files and still collide, because the number is the shared resource. Overlap
// by filename cannot see that, so these prefixes are coupled by prefix instead.
export const COUPLED_ALLOCATION_PREFIXES = ["db/migrations/", "scripts/verify-steps/", "package-lock.json"];

// The freshness decision, pure and therefore testable. Kept identical in SPIRIT to
// scripts/verify-branch-fresh.mjs (CI): behind is fine, behind-and-overlapping is not.
export function freshnessVerdict({ behind, mainFiles, branchFiles }) {
  if (!(behind > 0)) return { ok: true, reason: "not behind" };
  const branchSet = new Set(branchFiles);
  const overlap = mainFiles.filter((f) => branchSet.has(f));
  const coupled = COUPLED_ALLOCATION_PREFIXES.filter(
    (prefix) => mainFiles.some((f) => f.startsWith(prefix)) && branchFiles.some((f) => f.startsWith(prefix))
  );
  if (overlap.length === 0 && coupled.length === 0) {
    return { ok: true, reason: `behind ${behind} but no overlap with main` };
  }
  const why = [];
  if (overlap.length) why.push(`shares ${overlap.length} changed file(s) with main: ${overlap.slice(0, 5).join(", ")}`);
  for (const c of coupled) why.push(`both touch ${c} (globally allocated numbering)`);
  return {
    ok: false,
    overlap,
    coupled,
    reason:
      `local branch is ${behind} commit(s) behind origin/main AND overlaps it — ${why.join("; ")}. ` +
      `Rebuild: \`git cherry-pick <sha>\` onto a fresh branch from origin/main, or ` +
      `\`npm run branch:rebuild-linear -- --source <sha> --message "…"\`.`,
  };
}

function runStep(command, label, root, env = process.env) {
  console.log(`[branch:precheck-push] RUN ${label}: ${command}`);
  const res = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", env });
  const merged = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
  if (res.status === 0) return { ok: true, category: GATE_RESULT_CATEGORIES.PASS };
  return {
    ok: false,
    category: GATE_RESULT_CATEGORIES.TEST,
    tail: tailLines(merged, 30),
    label,
  };
}

/**
 * Resolve the precheck step list. Steps come ONLY from an explicit caller option (tests inject via
 * `options.steps`) or the built-in production chain. Environment variables — notably
 * `BRANCH_PRECHECK_STEPS_JSON` — can NEVER inject, empty, or replace the gate steps. That
 * user-settable all-gates bypass (`BRANCH_PRECHECK_STEPS_JSON=[]`) is closed (Rule 18 P0-1): the
 * production CLI is not given `options.steps`, so it always runs `buildPrecheckSteps`.
 */
export function resolvePrecheckSteps(options = {}, root) {
  if (Array.isArray(options.steps)) return options.steps;
  return buildPrecheckSteps(root);
}

export function buildPrecheckSteps(root) {
  void root;
  // verify:static is owned once by block-ready (in-process proof). Do not duplicate here.
  // Rule 25: money/DoD fail-fast FIRST — seconds, not 15m of CI — before expensive builds.
  return [
    {
      label: "money-pr-local-gate",
      command: "node scripts/money-pr-local-gate.mjs",
    },
    { label: "build-backend", command: "npm run build:backend" },
    { label: "frontend-tsc", command: "cd apps/frontend && npx tsc -b && cd ../.." },
    {
      label: "block-ready",
      command: "npm run block-ready",
      requiredCapabilities: ["database"],
      serverRequiredCiEquivalent: "ci / build-typecheck",
    },
  ];
}

/**
 * Prove a local verify Postgres is a REAL, authenticated `ih35_verify` database — never a bare TCP
 * listener, the wrong database, the wrong credentials, or a remote/production URL.
 *
 * Sync (spawned child) so precheck capability detection stays synchronous. A URL-string is never
 * proof: only an authenticated `pg` connection to a loopback server whose `current_database()` is
 * exactly `ih35_verify` returns true.
 *
 * Anti-prod (hardline): the host MUST be loopback and is re-checked here before any connection —
 * this probe never opens a socket to a non-local (e.g. Neon prod) endpoint. A raw TCP acceptor
 * fails the pg wire handshake; bad credentials fail authentication; a server reporting any other
 * `current_database()` fails the identity assertion. All of those return false.
 */
export function probeVerifyDatabaseIdentity(url, { timeoutMs = 2000, run = spawnSync } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  // Anti-prod: refuse to even connect to anything that is not loopback.
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return false;
  const port = Number(parsed.port || "5432");
  if (!Number.isInteger(port) || port <= 0) return false;

  // Child speaks the real Postgres wire protocol via `pg`. The safe marker/identity proof is the
  // authenticated `current_database()='ih35_verify'` of the owned ephemeral verify DB (a database
  // name that never exists in production, where current_database() is 'neondb').
  const child = `
const { Client } = require("pg");
const url = process.env.__IH35_VERIFY_PROBE_URL;
const timeoutMs = Number(process.env.__IH35_VERIFY_PROBE_TIMEOUT || "2000");
const client = new Client({
  connectionString: url,
  ssl: false,
  connectionTimeoutMillis: timeoutMs,
  statement_timeout: timeoutMs,
  query_timeout: timeoutMs,
});
let settled = false;
const finish = (code) => {
  if (settled) return;
  settled = true;
  Promise.resolve()
    .then(() => client.end())
    .catch(() => {})
    .finally(() => process.exit(code));
};
const timer = setTimeout(() => finish(1), timeoutMs + 500);
if (typeof timer.unref === "function") timer.unref();
client.connect()
  .then(() => client.query("SELECT current_database() AS db"))
  .then((res) => {
    const db = res && res.rows && res.rows[0] ? res.rows[0].db : null;
    finish(db === "ih35_verify" ? 0 : 1);
  })
  .catch(() => finish(1));
`;
  const res = run(process.execPath, ["-e", child], {
    encoding: "utf8",
    cwd: MODULE_ROOT,
    timeout: timeoutMs + 1500,
    env: {
      ...process.env,
      __IH35_VERIFY_PROBE_URL: url,
      __IH35_VERIFY_PROBE_TIMEOUT: String(timeoutMs),
    },
  });
  return res.status === 0;
}

/**
 * Database capability is true ONLY when a real, authenticated `ih35_verify` Postgres answers:
 *   1) an owned VLCI lifecycle proof selects the eligible owned url AND a live pg identity probe
 *      confirms the owned ephemeral database is actually up, OR
 *   2) a validated local-CI verify url (CI `:54329/ih35_verify` or an ownership-validated url) AND
 *      the same live pg identity probe confirms it.
 * A non-empty DATABASE_URL string (e.g. stale Neon from `.env`) is NEVER enough, and a lock that
 * claims ownership of a database that is not actually live/`ih35_verify` fails closed.
 */
export function detectLocalCapabilities(env = process.env, options = {}) {
  const root = options.root ?? (() => {
    try {
      return repoRoot();
    } catch {
      return process.cwd();
    }
  })();
  const probe =
    typeof options.probeDb === "function"
      ? options.probeDb
      : (url) => probeVerifyDatabaseIdentity(url, { run: options.run });

  const owned = validateOwnershipProof(env, {
    repoRoot: root,
    requireBindings: true,
    isAlive: options.isAlive,
  });
  if (owned.ok === true) {
    // Ownership authorizes WHICH url is eligible; a real authenticated ih35_verify connection then
    // proves the owned ephemeral database is actually live before we authorize running DB gates.
    if (probe(owned.record.url)) {
      return { database: true, databaseSource: "vlci-owned" };
    }
    return { database: false, databaseSource: null };
  }

  const candidates = [env.DATABASE_URL, env.DATABASE_DIRECT_URL, env[VLCI_ENV.DATABASE_URL]]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());

  for (const url of candidates) {
    if (!isLocalVerifyDatabaseUrl(url, env, { repoRoot: root, isAlive: options.isAlive })) {
      continue;
    }
    if (probe(url)) {
      return { database: true, databaseSource: "local-ci-validated" };
    }
  }

  return { database: false, databaseSource: null };
}

export function preflightStep(step, capabilities, policy) {
  const missing = (step.requiredCapabilities ?? []).filter(
    (capability) => capabilities[capability] !== true
  );
  if (missing.length === 0) return { action: "run", missing: [] };
  if (!step.serverRequiredCiEquivalent) {
    return {
      action: "fail",
      missing,
      reason: `missing ${missing.join(", ")} without a named server-required CI equivalent`,
    };
  }
  const policyViolations = validateCapabilitySkip(
    missing,
    step.serverRequiredCiEquivalent,
    policy
  );
  if (policyViolations.length > 0) {
    return {
      action: "fail",
      missing,
      reason: policyViolations.join("; "),
    };
  }
  return {
    action: "skip-capability",
    missing,
    ciEquivalent: step.serverRequiredCiEquivalent,
  };
}

export function runPrecheckPush(options = {}) {
  const root = options.root ?? repoRoot();
  const env = options.env ?? process.env;
  const branch = options.branch ?? currentBranch(root);
  if (!isFeatureBranch(branch)) {
    return {
      ok: false,
      category: GATE_RESULT_CATEGORIES.BRANCH,
      reason: "not on a feature branch",
      step: "branch-guard",
    };
  }

  const unmerged = runGitOrThrow(["diff", "--name-only", "--diff-filter=U"], { cwd: root });
  const gitDir = runGitOrThrow(["rev-parse", "--git-dir"], { cwd: root });
  const stateDir = path.resolve(root, gitDir);
  // REBASE_HEAD is deliberately NOT in this list. git writes it during a rebase and LEAVES IT
  // BEHIND after the rebase completes successfully — it is a convenience ref to the commit being
  // replayed, not an in-progress marker. Treating it as one made this gate fail every push that
  // followed any rebase, with `category=conflict: merge/rebase/cherry-pick operation is still in
  // progress`, on a completely clean tree (observed 2026-07-22: rebase reported "Successfully
  // rebased", `git status --porcelain` empty, `diff --diff-filter=U` empty, no rebase-merge/
  // rebase-apply directory — and the gate still refused the push until .git/REBASE_HEAD was
  // deleted by hand). That is a false positive that pushes authors toward --no-verify, which is
  // exactly how a real gate stops being trusted.
  //
  // The authoritative in-progress markers are kept: MERGE_HEAD and CHERRY_PICK_HEAD are removed by
  // git on completion/abort, and rebase-merge/rebase-apply are the directories git uses for an
  // interrupted rebase. Unmerged paths are still checked separately below, so a genuinely
  // conflicted tree is still refused.
  const hasOperationState = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"]
    .some((marker) => fs.existsSync(path.join(stateDir, marker)));
  if (unmerged || hasOperationState) {
    return {
      ok: false,
      category: GATE_RESULT_CATEGORIES.CONFLICT,
      reason: unmerged
        ? `unresolved conflict(s): ${unmerged.split(/\r?\n/).join(", ")}`
        : "merge/rebase/cherry-pick operation is still in progress",
      step: "conflict-guard",
    };
  }

  const dirty = runGitOrThrow(["status", "--porcelain"], { cwd: root });
  if (dirty) {
    return {
      ok: false,
      category: GATE_RESULT_CATEGORIES.DIRTY,
      reason: "working tree must be clean before push verification",
      step: "dirty-guard",
      tail: tailLines(dirty, 30),
    };
  }
  if (!options.skipFetch) {
    const fetch = runStep("git fetch origin", "git-fetch", root, env);
    if (!fetch.ok) {
      return {
        ...fetch,
        category: GATE_RESULT_CATEGORIES.CAPABILITY,
        reason: "git fetch origin failed",
        step: "git-fetch",
      };
    }
  }
  // FRESHNESS BY OVERLAP, NOT BY DISTANCE — aligned with scripts/verify-branch-fresh.mjs (CI).
  //
  // This gate used to fail whenever the branch was ANY commits behind origin/main. CI stopped doing
  // that (the overlap rule, docs/specs/BRANCH-TOOLING.md §N), but this local gate did not, so the two
  // enforcement points disagreed: CI would happily merge a behind-but-non-overlapping branch that
  // this hook refused to even push. With a busy queue that means a rebuild after every unrelated
  // merge — the exact N^2 treadmill the overlap rule was written to kill. Measured on 2026-07-29: two
  // full rebuilds of branches whose file sets did not intersect main's changes at all.
  //
  // Being behind is fine. Being behind ON THE SAME FILES is not, and neither is touching a path where
  // the allocation is global (migration numbers, verify-step numbers, the lockfile).
  const behind = behindOriginMainCount(root);
  if (behind > 0) {
    const mergeBase = runGitOrThrow(["merge-base", "HEAD", "origin/main"], { cwd: root });
    const mainFiles = runGitOrThrow(["diff", "--name-only", `${mergeBase}..origin/main`], { cwd: root })
      .split("\n")
      .filter(Boolean);
    const branchFiles = runGitOrThrow(["diff", "--name-only", `${mergeBase}..HEAD`], { cwd: root })
      .split("\n")
      .filter(Boolean);
    const verdict = freshnessVerdict({ behind, mainFiles, branchFiles });
    if (!verdict.ok) {
      return {
        ok: false,
        category: GATE_RESULT_CATEGORIES.FRESHNESS,
        reason: verdict.reason,
        step: "branch-freshness",
      };
    }
  }

  if (!env.GITHUB_BASE_SHA && !env.BRANCH_FRESH_BASE_SHA) {
    env.GITHUB_BASE_SHA = runGitOrThrow(["merge-base", "HEAD", "origin/main"], { cwd: root });
  }

  const steps = resolvePrecheckSteps(options, root);
  const capabilities =
    options.capabilities ??
    detectLocalCapabilities(env, {
      root,
      probeDb: options.probeDb,
      isAlive: options.isAlive,
      run: options.run,
    });
  const needsCapabilityPolicy = steps.some(
    (step) => (step.requiredCapabilities ?? []).length > 0
  );
  const capabilityPolicy = needsCapabilityPolicy
    ? options.capabilityPolicy ?? loadCapabilityPolicy(root)
    : null;
  const skippedCapabilities = [];
  let blockReadyRan = false;
  for (const step of steps) {
    const preflight = preflightStep(step, capabilities, capabilityPolicy);
    if (preflight.action === "fail") {
      return {
        ok: false,
        category: GATE_RESULT_CATEGORIES.CAPABILITY,
        reason: preflight.reason,
        step: step.label,
      };
    }
    if (preflight.action === "skip-capability") {
      const detail = `${preflight.missing.join("+")} → ${preflight.ciEquivalent}`;
      console.log(`[branch:precheck-push] SKIP-CAPABILITY ${step.label}: ${detail}`);
      skippedCapabilities.push({ step: step.label, ...preflight });
      continue;
    }
    const result = runStep(step.command, step.label, root, env);
    if (!result.ok) {
      console.error(
        `branch:precheck-push FAIL category=${result.category} at step: ${step.label}`
      );
      if (result.tail) console.error(result.tail);
      return {
        ok: false,
        category: result.category,
        reason: `${step.label} failed`,
        step: step.label,
        tail: result.tail,
      };
    }
    if (step.label === "block-ready") blockReadyRan = true;
  }
  // block-ready owns verify:static in-process. If it was capability-skipped, run static once here
  // so push still has static coverage — never duplicate when block-ready already ran.
  if (!blockReadyRan && steps.some((s) => s.label === "block-ready")) {
    const staticResult = runStep("node scripts/verify-static.mjs", "verify-static-fallback", root, env);
    if (!staticResult.ok) {
      console.error(
        `branch:precheck-push FAIL category=${staticResult.category} at step: verify-static-fallback`
      );
      if (staticResult.tail) console.error(staticResult.tail);
      return {
        ok: false,
        category: staticResult.category,
        reason: "verify-static-fallback failed (block-ready was capability-skipped)",
        step: "verify-static-fallback",
        tail: staticResult.tail,
      };
    }
  }
  const sha = runGitOrThrow(["rev-parse", "HEAD"], { cwd: root });
  const message = `READY TO PUSH: ${branch} at ${sha}`;
  console.log(message);
  return {
    ok: true,
    category: GATE_RESULT_CATEGORIES.PASS,
    branch,
    sha,
    message,
    skippedCapabilities,
  };
}

function main() {
  // Production CLI takes NO caller step override and NO env fetch-skip: `BRANCH_PRECHECK_STEPS_JSON`
  // and `IH35_BRANCH_TOOLING_SKIP_FETCH` are ignored here so no user-settable env can suppress the
  // freshness fetch or the gate steps (Rule 18 P0-1 — the combined all-gates bypass is closed).
  const result = runPrecheckPush();
  if (!result.ok) {
    console.error(`branch:precheck-push FAIL category=${result.category}: ${result.reason}`);
    if (result.tail) {
      console.error("Last output:");
      console.error(result.tail);
    }
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
