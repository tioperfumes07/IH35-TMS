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
import { ciRunGuardSet, runStatic, STATIC_RESULT_CATEGORIES } from "./verify-static.mjs";
import { ensureFreshGateStepMap } from "./generate-gate-step-map.mjs";

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
// two DIFFERENT migration files and still collide, because the NUMBER is the shared resource, not the
// filename. Overlap-by-filename cannot see that, so these are coupled by prefix instead.
//
// TOOL-F02 (2026-07-30): db/migrations/ is NO LONGER coupled by directory. The earlier comment here
// claimed "the rule is strictly above main's current max, so ANY migration landing on main invalidates
// a branch's number — there is no safe narrowing". That was asserted, never verified, and it is WRONG.
//
// scripts/db-migrate.mjs is LEDGER-BASED, not max-number-based:
//     for (const migration of diskMigrations) { if (ledgerByFile.has(migration)) continue; ... }
// It applies every migration NOT ALREADY IN THE LEDGER, over a filename-sorted list
// (lib/migration-filename-validation.mjs: readdirSync(...).filter(isMigrationFile).sort()). There is
// no comparison against a maximum anywhere in that file. So a migration numbered BELOW main's current
// max still applies correctly when its branch merges later — it is simply "not in the ledger yet".
//
// That unverified rule was the single biggest source of forced rebases: every migration PR was
// invalidated by every other migration merge, so N open migration PRs cost N^2 rebuilds. Same N^2
// shape as the zero-behind rule and the verify-steps directory coupling, for the same reason — a
// proxy standing in for the thing actually being protected.
//
// What IS actually protected, and still is:
//   · TWO BRANCHES PICKING THE SAME FILENAME -> still blocked below, by number, not by directory.
//     (Also independently prevented by the per-lane bands: Claude HH 00-11, Cursor HH 12-23.)
//   · ORDER DEPENDENCIES between migrations -> caught by the fresh-database apply that every PR
//     already runs (verify:db:reset in ci/build-typecheck), which replays ALL migrations from scratch
//     in filename order. If a lower-numbered migration depended on a higher-numbered one, that job
//     fails. Branch freshness never checked this and could not have.
//
// package-lock.json stays coupled: a lockfile is one resolved graph, not a set of independent lines.
export const COUPLED_ALLOCATION_PREFIXES = ["package-lock.json"];

// scripts/verify-steps/ is DIFFERENT, and treating it like db/migrations/ was wrong. Verify-step
// numbers are not "above the max" — they are claimed from a banded namespace (Claude odd, Cursor even)
// and recorded in CLAIMED-NUMBERS.json. Two branches adding steps 1795 and 1806 do not collide in any
// way; only two branches claiming the SAME number do. Coupling the whole directory made every guard PR
// block every other guard PR — the N^2 treadmill relocated from "any file" to "this directory", which
// is worse, because essentially every quality PR in this repo adds a guard.
//
// So: conflict on a step number only when the two sides claim the SAME number. The filenames carry the
// claim (`scripts/verify-steps/1795-*.mjs`), so the file list is the claim list.
const STEP_DIR = "scripts/verify-steps/";
const CLAIMED_REGISTRY = "scripts/verify-steps/CLAIMED-NUMBERS.json";

// Repo root — needed to read .gitattributes for the union-merge exemption below.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── THE REBASE TREADMILL, KILLED AT THE ROOT (2026-07-31) ────────────────────────────────────────
// A file with a UNION merge driver cannot produce a conflict — that is the entire point of declaring
// it in .gitattributes. Yet this gate hardcoded a single exemption (CLAIMED_REGISTRY) while
// .gitattributes declared ELEVEN union paths. The other ten still counted as "overlap", so any PR
// touching one was forced to rebase every time another such PR merged — force-push, which CANCELS the
// in-flight CI run, then a fresh run. Measured on 2026-07-31 over the last 60 `ci` runs: 15 CANCELLED
// vs 10 genuine failures. docs/module-completion/lists-picker-partials.md alone appears in 26 of the
// last 60 merges and is union-merged, so every LST-PICKER PR was rebuilding every other one.
//
// Deriving the exemption FROM .gitattributes keeps the two lists in agreement permanently: adding a
// new union path to .gitattributes now automatically exempts it here. Hardcoding one filename is what
// let them drift in the first place.
//
// This does NOT weaken the gate. Real semantic clashes are still caught by their own checks, which
// union merging cannot resolve: same verify-step number (stepCollisions), same migration number
// (migrationCollisions), and coupled allocations (package-lock.json). Only "both sides edited a file
// that merges automatically" stops being treated as a conflict — because it never was one.
export function unionMergedPatterns(gitattributesText) {
  const patterns = [];
  for (const raw of String(gitattributesText || "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (!/\bmerge=\S*union\S*/.test(line)) continue;
    const pattern = line.split(/\s+/)[0];
    if (pattern) patterns.push(pattern);
  }
  return [...new Set(patterns)];
}

/** Minimal gitattributes glob: `*` matches within a path segment, `**` across segments. */
export function matchesUnionPattern(file, pattern) {
  if (!pattern.includes("*")) return file === pattern || file.endsWith("/" + pattern);
  const rx = new RegExp(
    "^" +
      pattern
        .split("**").map((seg) => seg.split("*").map((x) => x.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
        .join(".*") +
      "$"
  );
  return rx.test(file);
}

export function isUnionMerged(file, patterns) {
  return patterns.some((p) => matchesUnionPattern(file, p));
}

export function stepNumbersIn(files) {
  const out = new Set();
  for (const f of files) {
    const m = /^scripts\/verify-steps\/(\d+)-/.exec(f);
    if (m) out.add(m[1]);
  }
  return out;
}

// The migration NUMBER is the shared resource, not the directory. Two branches adding 202610270000 and
// 202610280000 collide in no way; two branches both adding 202610270000 do.
export function migrationNumbersIn(files) {
  const out = new Set();
  for (const f of files) {
    const m = /^db\/migrations\/(\d+)_/.exec(f);
    if (m) out.add(m[1]);
  }
  return out;
}

// The freshness decision, pure and therefore testable. Kept identical in SPIRIT to
// scripts/verify-branch-fresh.mjs (CI): behind is fine, behind-and-overlapping is not.
export function freshnessVerdict({ behind, mainFiles, branchFiles, unionPatterns = [] }) {
  if (!(behind > 0)) return { ok: true, reason: "not behind" };

  const mainSteps = stepNumbersIn(mainFiles);
  const branchSteps = stepNumbersIn(branchFiles);
  const stepCollisions = [...branchSteps].filter((n) => mainSteps.has(n));

  const mainMigrations = migrationNumbersIn(mainFiles);
  const branchMigrations = migrationNumbersIn(branchFiles);
  const migrationCollisions = [...branchMigrations].filter((n) => mainMigrations.has(n));

  // CLAIMED-NUMBERS.json is an append-only union registry. Both sides touching it is the NORMAL case
  // for any two guard PRs and is not a conflict on its own — the merge driver already treats only the
  // `claimed` subtree as strict, and only a same-key clash inside it is real. The observable proxy for
  // a same-key clash is a step-number collision, so the registry is excluded from plain file overlap
  // and judged by stepCollisions instead. If the numbers are disjoint, the registry union-merges.
  const branchSet = new Set(branchFiles);
  const overlap = mainFiles.filter(
    (f) =>
      branchSet.has(f) &&
      f !== CLAIMED_REGISTRY &&
      // union-merged paths cannot conflict — see the block above
      !isUnionMerged(f, unionPatterns) &&
      !(f.startsWith(STEP_DIR) && stepNumbersIn([f]).size > 0) &&
      !(f.startsWith("db/migrations/") && migrationNumbersIn([f]).size > 0)
  );

  const coupled = COUPLED_ALLOCATION_PREFIXES.filter(
    (prefix) => mainFiles.some((f) => f.startsWith(prefix)) && branchFiles.some((f) => f.startsWith(prefix))
  );

  if (overlap.length === 0 && coupled.length === 0 && stepCollisions.length === 0 && migrationCollisions.length === 0) {
    return { ok: true, reason: `behind ${behind} but no overlap with main` };
  }

  const why = [];
  if (overlap.length) why.push(`shares ${overlap.length} changed file(s) with main: ${overlap.slice(0, 5).join(", ")}`);
  for (const c of coupled) why.push(`both touch ${c} (globally allocated numbering)`);
  if (stepCollisions.length) why.push(`both claim verify-step number(s) ${stepCollisions.join(", ")}`);
  if (migrationCollisions.length) why.push(`both claim migration number(s) ${migrationCollisions.join(", ")}`);

  return {
    ok: false,
    overlap,
    coupled,
    stepCollisions,
    migrationCollisions,
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
  // verify:static is owned once by block-ready (in-process proof). Do not duplicate here.
  // Rule 25: money/DoD fail-fast FIRST — seconds, not 15m of CI — before expensive builds.
  return [
    {
      label: "money-pr-local-gate",
      command: "node scripts/money-pr-local-gate.mjs",
    },
    { label: "build-backend", command: "npm run build:backend" },
    { label: "frontend-tsc", command: "node scripts/generate-module-completion-data.mjs && cd apps/frontend && npx tsc -b && cd ../.." },
    {
      label: "block-ready",
      command: "npm run block-ready",
      requiredCapabilities: ["database"],
      serverRequiredCiEquivalent: "ci / build-typecheck",
    },
    // TOOL-F05: a branch that ADDS A MIGRATION must have applied it to a real database before push.
    // This is deliberately NOT done by making `block-ready` unskippable — that step additionally
    // requires a registered .block-ready manifest, and coupling migrations to registry ceremony would
    // trade one blocker for another. What was actually missing is narrower and exact: the SQL had
    // never run anywhere. `verify:db:reset` replays every migration from scratch and needs only the
    // database.
    //
    // No local database and the branch adds a migration -> this step FAILS (no CI equivalent named on
    // purpose), because deferring it to CI is precisely what put three broken migrations into CI and
    // one into production on 2026-07-30, where it blocked every deploy for ~5.5 hours.
    // Deliberately NO requiredCapabilities: this step must not participate in the capability system at
    // all. Declaring "database" would make the global capability decide it, and the moment that
    // capability is true `block-ready` also starts running — which additionally demands a registered
    // .block-ready manifest. Migration safety would then depend on registry ceremony, which is the
    // "one blocker traded for another" this fix exists to avoid.
    //
    // Instead the command speaks for itself: verify-db-reset.mjs already refuses, loudly and safely,
    // unless DATABASE_URL points at a local verify database (localhost + ih35_verify), and it prints
    // exactly what to do. No database -> the push stops with actionable guidance; database up -> the
    // full from-scratch replay runs. Either way the SQL is never pushed unapplied.
    ...(branchAddsMigration(root)
      ? [
          {
            label: "migration-db-replay",
            // TOOL-F06: the URL is supplied BY THE STEP, not taken from the environment.
            //
            // TOOL-F05 declared no requiredCapabilities so that migration safety would not depend on
            // the global "database" capability — because the moment that capability is true,
            // `block-ready` also runs and demands a registered .block-ready manifest. That reasoning
            // was right and the implementation still leaked: the step needs DATABASE_URL, so the only
            // way to satisfy it was to export DATABASE_URL globally, which turns the capability true
            // and drags block-ready in anyway. The coupling returned by the exact side door I said I
            // had closed. Found by hitting it on a real migration branch (LEASE-01), not by re-reading
            // the code.
            //
            // Supplying the URL inline keeps the environment clean: the capability detector never sees
            // a global DATABASE_URL, block-ready keeps its CI-equivalent skip, and the replay still
            // runs. verify-db-reset.mjs independently refuses anything that is not a local verify
            // database, so this cannot be pointed at prod.
            command:
              "DATABASE_URL=postgres://verify:verify@127.0.0.1:54329/ih35_verify npm run verify:db:reset",
          },
        ]
      : []),
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

/**
 * TOOL-F05 — a branch that ADDS A MIGRATION may not skip the database-gated step.
 *
 * WHY. `block-ready` declares requiredCapabilities: ["database"] with a
 * serverRequiredCiEquivalent of "ci / build-typecheck", so with no local database it SKIPS and defers
 * to CI. For most changes that is a reasonable trade. For a MIGRATION it is how broken SQL reaches
 * CI — and, on 2026-07-30, production: three migrations failed on their first CI run (a NOT NULL
 * column omitted from an INSERT, an assertion that aborted on an empty database) and a fourth failed
 * in Render's preDeploy and blocked EVERY deploy for ~5.5 hours, including another agent's.
 *
 * The database was provisionable the whole time: `npm run verify:db:start` (docker-compose.verify.yml,
 * postgres:16-alpine on :54329, tmpfs). Running `verify:db:reset` locally replays every migration in
 * about a minute. Each of those failures was a one-minute local check traded for a fifteen-minute CI
 * round trip — and in one case a production outage.
 *
 * So: migrations lose the skip. Everything else keeps it.
 */
export function branchAddsMigration(root, baseRef = "origin/main") {
  try {
    const out = runGitOrThrow(
      ["diff", "--name-only", "--diff-filter=A", `${baseRef}...HEAD`, "--", "db/migrations/"],
      { cwd: root }
    );
    return out.split("\n").some((f) => f.trim().endsWith(".sql"));
  } catch {
    return false; // cannot tell -> do not invent a blocker
  }
}

export function preflightStep(step, capabilities, policy, context = {}) {
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
    const unionPatterns = unionMergedPatterns(
      fs.existsSync(path.join(REPO_ROOT, ".gitattributes"))
        ? fs.readFileSync(path.join(REPO_ROOT, ".gitattributes"), "utf8")
        : ""
    );
    const verdict = freshnessVerdict({ behind, mainFiles, branchFiles, unionPatterns });
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
    const preflight = preflightStep(step, capabilities, capabilityPolicy, {
      addsMigration: branchAddsMigration(root),
    });
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

/**
 * GATE-LIVELOCK-01 STEP 2 — kill the race between the local gate and a busy main.
 *
 * Scoping (STEP 1) shrinks the gate from ~53min to low minutes, but on a busy queue that is
 * still not zero: a FRESHNESS rejection (branch behind AND overlapping origin/main) can still
 * happen. The naive fix — rebase, then run the WHOLE gate again — just repeats the same 53min
 * risk on the rebuilt branch. Instead: on a FRESHNESS failure, rebase onto origin/main, then
 * re-verify ONLY the guards whose owned paths intersect the files main advanced by (NOT the
 * whole gate, NOT even this branch's own diff, which already passed and did not change) — using
 * the exact same runStatic()/guardIsInScope() machinery STEP 1 built, just pointed at a
 * different, much smaller file set. If that delta touches nothing any guard owns, no guard runs
 * at all and the retry proceeds immediately. Bounded to 3 attempts; a real rebase conflict (or
 * still-stale after 3 tries) stops the loop and reports the exact blocker — it never loops
 * unboundedly.
 */
export function computeMainDeltaFiles(root) {
  const mergeBase = runGitOrThrow(["merge-base", "HEAD", "origin/main"], { cwd: root });
  return runGitOrThrow(["diff", "--name-only", `${mergeBase}..origin/main`], { cwd: root })
    .split("\n")
    .filter(Boolean);
}

/** True iff at least one non-alwaysRun guard's owned path intersects `files`. alwaysRun guards
 * already ran in this hook's own prior full pass and are not re-triggered by a delta-only
 * check — see the module comment above for why. */
export function deltaTouchesAnyGuard(files, stepMap) {
  if (files.length === 0) return false;
  return Object.entries(stepMap.entries).some(([, entry]) => {
    if (entry.alwaysRun) return false;
    return entry.ownedPaths.some((owned) => files.some((f) => f === owned || f.startsWith(owned) || owned.startsWith(f)));
  });
}

/**
 * ONE rebase + delta-scoped re-check. The bounded-3-attempts loop lives in main(), which calls
 * this once per retry and re-runs runPrecheckPush() from the top afterward (its own freshness
 * check is the authoritative "are we caught up now" answer — a race could still leave us behind
 * again, which is exactly why main()'s loop, not this function, owns the attempt count).
 */
export function attemptStaleBaseRecovery(root) {
  const deltaFiles = computeMainDeltaFiles(root);
  if (deltaFiles.length === 0) {
    // Nothing to catch up on after all (race resolved itself) — freshness will pass now.
    return { ok: true, ranGuards: false };
  }
  console.log(
    `[branch:precheck-push] stale-base recovery: rebasing onto origin/main ` +
    `(${deltaFiles.length} file(s) main advanced by)`
  );
  const rebase = spawnSync("git", ["rebase", "origin/main"], { cwd: root, encoding: "utf8" });
  if (rebase.status !== 0) {
    spawnSync("git", ["rebase", "--abort"], { cwd: root, encoding: "utf8" });
    return {
      ok: false,
      reason: `git rebase origin/main failed (real conflict, not auto-resolved; aborted cleanly) — ` +
        `resolve by hand: ${tailLines(`${rebase.stdout || ""}\n${rebase.stderr || ""}`, 20)}`,
    };
  }
  const { map: stepMap } = ensureFreshGateStepMap({ dir: path.join(root, "scripts") });
  if (!deltaTouchesAnyGuard(deltaFiles, stepMap)) {
    console.log(`[branch:precheck-push] delta touches no guard's owned path — no re-run needed`);
    return { ok: true, ranGuards: false };
  }
  const results = runStatic({
    dir: path.join(root, "scripts"),
    changedFiles: deltaFiles,
    stepMap,
    ciSet: ciRunGuardSet(root),
  });
  const gatedFails = results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST && r.gated);
  if (gatedFails.length) {
    return {
      ok: false,
      reason: `${gatedFails.length} guard(s) touching what main just advanced now fail: ${gatedFails.map((r) => r.name).join(", ")}`,
    };
  }
  console.log(
    `[branch:precheck-push] delta-scoped re-check clean ` +
    `(${results.filter((r) => r.kind !== STATIC_RESULT_CATEGORIES.SKIP_SCOPE).length} guard(s) touched)`
  );
  return { ok: true, ranGuards: true };
}

function main() {
  // Production CLI takes NO caller step override and NO env fetch-skip: `BRANCH_PRECHECK_STEPS_JSON`
  // and `IH35_BRANCH_TOOLING_SKIP_FETCH` are ignored here so no user-settable env can suppress the
  // freshness fetch or the gate steps (Rule 18 P0-1 — the combined all-gates bypass is closed).
  const root = repoRoot();
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts + 1; attempt++) {
    const result = runPrecheckPush();
    if (result.ok) {
      console.log(result.message);
      return;
    }
    if (result.category !== GATE_RESULT_CATEGORIES.FRESHNESS || attempt > maxAttempts) {
      console.error(`branch:precheck-push FAIL category=${result.category}: ${result.reason}`);
      if (result.tail) {
        console.error("Last output:");
        console.error(result.tail);
      }
      process.exit(1);
    }
    const recovery = attemptStaleBaseRecovery(root);
    if (!recovery.ok) {
      console.error(`branch:precheck-push FAIL category=freshness: stale-base recovery failed: ${recovery.reason}`);
      process.exit(1);
    }
    // loop: re-run runPrecheckPush() from the top now that we are rebased onto origin/main.
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
