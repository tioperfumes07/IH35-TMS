#!/usr/bin/env node
/**
 * verify:static — run every NO-DB static guard locally before pushing, so a stale string-anchored guard
 * is caught here instead of costing a full CI round-trip on build-typecheck.
 *
 * What it does:
 *   - globs scripts/verify-*.mjs (EXCLUDING this runner),
 *   - a guard declaring `export const REQUIRES_LIVE_DB = "<reason>";` is EXCLUDED entirely — never
 *     spawned, not classified PASS/FAIL/SKIP — because a ROUND-29.9-B live-money guard is DESIGNED
 *     to fail-closed with no live DB, and this sweep's dead-port sentinel would just be asking it a
 *     question it cannot be asked (ruled 2026-09-23, docs/bus/INBOX-CC-1.md). It still runs for
 *     real, live, fail-closed under `money-pr-local-gate.mjs`; see `REQUIRES_LIVE_DB_RE` below,
 *     the mirror of `ALLOW_OFFLINE_SKIP` (verify-no-silent-db-skip.mjs),
 *   - runs every OTHER guard in a child process with NO reachable database, capturing
 *     stdout/stderr/exit,
 *   - classifies each through an explicit capability preflight, never by matching failure text:
 *     PASS | SKIP-capability (only with a named server-required CI equivalent) | FAIL-test |
 *     EXCLUDED-live-db,
 *   - additionally runs each guard's `--selftest` when the file contains that flag; a real selftest
 *     failure folds into FAIL,
 *   - does NOT fail-fast: runs ALL guards, prints a summary (counts + names of every FAIL and SKIP),
 *   - exits 1 iff any real test fails; dirty/conflict/freshness are enforced by branch:precheck-push.
 *
 * Prod-safety: UNSET DATABASE_URL / DATABASE_DIRECT_URL so live-prod guards that SKIP on
 * `if (!databaseUrl)` actually skip (#19418). Pin DOTENV_CONFIG_PATH=/dev/null so dotenv/config
 * cannot reload a real URL from `.env`. libpq PG* still points at 127.0.0.1:59999 so a bare
 * `new Pool()` cannot reach prod. A truthy dead-port DATABASE_URL is FORBIDDEN (selftest).
 *
 * --selftest exercises the runner against temp fixture guards (pass + fail + db-skip).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadCapabilityPolicy,
  validateCapabilityEquivalent,
} from "./push-gate-capability-policy.mjs";
import { extraFailsNotInBaseline, loadHeadBaseline } from "./verify-static-ratchet.mjs";
import { ensureFreshGateStepMap } from "./generate-gate-step-map.mjs";
import { CI_DATABASE_GUARDS } from "./lib/local-db-guard-routing.mjs";

const SELF_PATH = fileURLToPath(import.meta.url);
const SELF_NAME = path.basename(SELF_PATH);
const SCRIPTS_DIR = path.dirname(SELF_PATH);
const LABEL = "verify-static";
const ROOT = path.resolve(SCRIPTS_DIR, "..");
// This is an orchestration runner, not a static guard. It starts its own
// PostgreSQL server and block-ready executes it separately after verify:static.
const NON_STATIC_ORCHESTRATORS = new Set(["verify-local-ci.mjs"]);

export const STATIC_RESULT_CATEGORIES = Object.freeze({
  PASS: "PASS",
  SKIP_CAPABILITY: "SKIP-capability",
  SKIP_SCOPE: "SKIP-scope",
  FAIL_TEST: "FAIL-test",
  EXCLUDED_LIVE_DB: "EXCLUDED-live-db",
  // ROUND 389.4 follow-up (Lead ruling to CC-2, "OPTION 3", 2026-10-04): a guard whose ONLY failure is the canonical
  // "DATABASE_URL not set" refusal is NOT VERIFIABLE HERE in a no-DB local sweep. Opt-in only (the local pre-push
  // fallback sets IH35_STATIC_UNVERIFIABLE_HERE=1); CI and block-ready never do, so there it is still a FAIL.
  // NEVER a pass: printed loudly by name, and CI must still execute each one against a real database.
  UNVERIFIABLE_HERE: "UNVERIFIABLE-here",
});

/** The one failure shape that may become UNVERIFIABLE-here: the canonical no-database refusal and nothing else. */
/** OPTION 3: the UNVERIFIABLE-here relaxation is never honoured in CI (any CI marker present). */
export function unverifiableHereRefusedHere(env) {
  return Boolean(env.CI || env.GITHUB_ACTIONS || env.RENDER);
}

/** The repo's no-credential refusal phrasings (measured 2026-10-04: "not set" ×~170, "is unset" ×16, "required" ×2). */
export const NO_DB_REFUSAL_RE = /DATABASE_URL (?:is )?(?:not set|unset|required)\b/;

export function isDbUnavailableOnly(out) {
  const text = String(out || "");
  if (!NO_DB_REFUSAL_RE.test(text)) return false;
  // Any other failure marker means the guard found something besides the missing database — a real FAIL. Stricter
  // than ✗ alone: a static half that printed "FAIL — …" / "✘" / an Error before the live half refused stays a FAIL.
  const otherMarks = text.split("\n").filter((l) => /✗|✘|\bFAIL\b|\bError\b/.test(l) && !NO_DB_REFUSAL_RE.test(l));
  return otherMarks.length === 0;
}

/**
 * GATE-LIVELOCK-01 — decide whether a guard runs given the current push's changed-file set.
 * `changedFiles === null` means "no scoping requested" (the CI/standalone default: everything
 * runs, matching pre-fix behavior exactly). A guard runs when: its own file is itself among the
 * changed files (its logic changed — must re-verify itself), OR the map marks it alwaysRun (no
 * extractable owned path — fail-safe), OR one of its owned paths intersects a changed file
 * (prefix match either direction, so an owned directory root like "apps/frontend/src" matches a
 * changed file under it, and an owned exact file matches itself).
 */
export function guardIsInScope(guardFile, entry, changedFiles) {
  if (changedFiles === null) return true;
  if (changedFiles.some((f) => f === guardFile || f.endsWith("/" + guardFile))) return true;
  if (!entry || entry.alwaysRun) return true;
  for (const owned of entry.ownedPaths ?? []) {
    for (const changed of changedFiles) {
      if (changed === owned || changed.startsWith(owned) || owned.startsWith(changed)) return true;
    }
  }
  return false;
}

/**
 * STOP-THE-THRASH-2026-07-17: package.json edits to register a new verify:* are FORBIDDEN — the
 * ONLY correct wiring path for a new guard is scripts/verify-steps/. ciRunGuardSet() (below) already
 * recognizes that path when deciding whether a guard is CI-run at all. This name resolver — used
 * ONLY for the capability preflight's dbGated lookup — did not get the same update, so a guard wired
 * exclusively via verify-steps (no package.json entry, by design) could never be recognized as
 * db-gated: it would correctly show up as CI-run (gated:true, via ciRunGuardSet's verify-steps scan)
 * but then hard-fail on ECONNREFUSED every static run instead of soft-skipping, because
 * policy.dbGated.has(verifyName) needs a resolvable name first. Fall back to a verify-steps scan,
 * deriving the same "verify:<slug>" shape scripts/verify-meta.json's db_gated_verify_scripts already
 * uses, so existing entries need no reshaping.
 */
function guardVerifyName(file, root = ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const relative = path.relative(root, file).replace(/\\/g, "/");
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    if (name.startsWith("verify:") && String(command).includes(relative)) return name;
  }
  const m = relative.match(/^scripts\/(verify-[a-z0-9-]+)\.mjs$/i);
  if (!m) return null;
  const stepsDir = path.join(SCRIPTS_DIR, "verify-steps");
  let stepFiles;
  try { stepFiles = fs.readdirSync(stepsDir); } catch { return null; }
  for (const f of stepFiles) {
    let txt;
    try { txt = fs.readFileSync(path.join(stepsDir, f), "utf8"); } catch { continue; }
    if (txt.includes(relative)) return `verify:${m[1].slice("verify-".length)}`;
  }
  return null;
}

export function capabilityPreflight(
  file,
  {
    root = ROOT,
    dependenciesAvailable = fs.existsSync(path.join(root, "node_modules")),
    databaseAvailable = false,
    policy = loadCapabilityPolicy(root),
    capabilityAvailability = {
      "pass8-artifact": fs.existsSync(
        path.join(root, "docs/audits/PASS-8-PRE-PROD-SMOKE-RESULTS.json")
      ),
    },
  } = {}
) {
  const verifyName = guardVerifyName(file, root);
  const missing = [];
  if (!dependenciesAvailable) missing.push("dependencies");
  if (verifyName && policy.dbGated.has(verifyName) && !databaseAvailable) missing.push("database");
  if (verifyName) {
    missing.push(
      ...(policy.guardCapabilities?.[verifyName] ?? []).filter(
        (capability) => capabilityAvailability[capability] !== true
      )
    );
  }
  if (missing.length === 0) return { ok: true, missing: [], ciEquivalents: [] };

  const ciEquivalents = missing
    .map((capability) => policy.equivalents[capability])
    .filter(Boolean);
  const policyViolations = missing.flatMap((capability) => {
    const context = policy.equivalents[capability];
    return context
      ? validateCapabilityEquivalent(capability, context, policy)
      : [`capability "${capability}" has no declared CI equivalent`];
  });
  if (policyViolations.length > 0) {
    return {
      ok: false,
      missing,
      ciEquivalents,
      reason: policyViolations.join("; "),
    };
  }
  return { ok: false, missing, ciEquivalents };
}

/**
 * Child env with NO reachable database.
 *
 * Guards that SKIP on `if (!process.env.DATABASE_URL)` (live-prod audits) must see an unset URL.
 * A truthy dead-port sentinel (`127.0.0.1:59999`) made SKIP never fire → uncaught ECONNREFUSED
 * (#19418). We UNSET the URL vars. dotenv/config (override:false) would reload `.env` if the
 * keys were merely absent — so we also pin DOTENV_CONFIG_PATH at /dev/null. libpq/node-pg
 * fallbacks still point at a dead local port so a bare `new Pool()` cannot reach prod.
 */
export const NO_DB_CREDENTIAL_VARS = [
  "DATABASE_URL",
  "DATABASE_DIRECT_URL",
  "DATABASE_URL_READONLY",
  "READONLY_DATABASE_URL",
  "WORKFLOW_RLS_TEST_DATABASE_URL",
  "RESTORED_DATABASE_URL",
  "NEON_API_KEY",
];

export function noDbEnv() {
  const env = { ...process.env };
  for (const k of NO_DB_CREDENTIAL_VARS) delete env[k];
  // ROUND 370 taught lib/require-live-db.mjs to fall back to the gate's read-only credential (read from the owner's
  // key file) when no URL is set. Without this switch every "no-DB" static guard quietly found that credential and
  // queried PRODUCTION — measured 2026-10-04: a 5,739-guard sweep ran hundreds of live reads in parallel, timed out
  // (ETIMEDOUT), and reported live findings as static "new rot". The static sweep never touches a database.
  env.IH35_NO_GATE_CREDENTIAL_FALLBACK = "1";
  env.DOTENV_CONFIG_PATH = "/dev/null";
  env.PGHOST = "127.0.0.1";
  env.PGPORT = "59999";
  env.PGUSER = "verify_static";
  env.PGDATABASE = "verify_static_none";
  env.PGCONNECT_TIMEOUT = "2";
  return env;
}

function runGuard(file, args = []) {
  const res = spawnSync(process.execPath, [file, ...args], {
    env: noDbEnv(),
    encoding: "utf8",
    // Static guards finish in <2s; anything still running at 25s is waiting on a service it can't reach
    // here → killed, and its ETIMEDOUT classifies SKIP-needs-env (not a stale-anchor FAIL).
    timeout: 25000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const out = `${res.stdout || ""}${res.stderr || ""}${res.error ? `\n${res.error.code || ""} ${res.error.message || ""}` : ""}`;
  return { status: res.status, out, spawnError: res.error };
}

function firstSignalLine(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
  const marked = lines.find((l) => l.includes("✗") || /FAILED|Error|assert/i.test(l));
  return (marked || lines[lines.length - 1] || "").slice(0, 200);
}

// REQUIRES_LIVE_DB — the mirror of ALLOW_OFFLINE_SKIP (scripts/verify-no-silent-db-skip.mjs),
// ruled 2026-09-23 (docs/bus/INBOX-CC-1.md, "your verify-static question is ruled"). A
// ROUND-29.9-B live-money guard is DESIGNED to fail-closed with no live DB — verify-static's
// dead-port sentinel asks it a question it cannot be asked and then records the answer as a
// finding, which is a false positive in the sweep, not a defect in the guard. A guard declaring
// `export const REQUIRES_LIVE_DB = "<reason>";` is EXCLUDED from this sweep entirely — not
// spawned, not classified PASS/FAIL/SKIP, out of context — while money-pr-local-gate.mjs still
// runs it for real against a live DATABASE_URL (still fails closed where it actually runs), and
// verify-no-silent-db-skip.mjs (03d) still catches any guard that silently exits 0 with no DB. A
// declaration, not an escape hatch: it touches no owner-protected baseline and weakens nothing.
const REQUIRES_LIVE_DB_RE = /export\s+const\s+REQUIRES_LIVE_DB\s*=\s*["'`]([^"'`]*)["'`]/;

/** Classify a single guard file. Pure w.r.t. the filesystem read of the guard's own source. */
export function classify(file, options = {}) {
  const rel = path.relative(ROOT, path.resolve(file));
  if (Object.hasOwn(CI_DATABASE_GUARDS, rel)) {
    const mode = CI_DATABASE_GUARDS[rel];
    const result = mode ? runGuard(file, [mode]) : null;
    return {
      file, name: path.basename(file),
      kind: result && result.status !== 0 ? STATIC_RESULT_CATEGORIES.FAIL_TEST : STATIC_RESULT_CATEGORIES.SKIP_CAPABILITY,
      detail: result && result.status !== 0 ? firstSignalLine(result.out)
        : `database → ci / required-live-load-guard; ${mode ? `${mode} assertion executed` : 'no static assertion'}; NOT live proof`,
    };
  }
  const src = (() => { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } })();
  const requiresLiveDb = src.match(REQUIRES_LIVE_DB_RE);
  if (requiresLiveDb) {
    return {
      file,
      name: path.basename(file),
      kind: STATIC_RESULT_CATEGORIES.EXCLUDED_LIVE_DB,
      detail: requiresLiveDb[1],
    };
  }
  const preflight = options.preflight ?? capabilityPreflight(file, options);
  if (!preflight.ok) {
    if (
      preflight.reason ||
      !preflight.ciEquivalents ||
      preflight.ciEquivalents.length !== preflight.missing.length
    ) {
      return {
        file,
        name: path.basename(file),
        kind: STATIC_RESULT_CATEGORIES.FAIL_TEST,
        detail: preflight.reason,
      };
    }
    return {
      file,
      name: path.basename(file),
      kind: STATIC_RESULT_CATEGORIES.SKIP_CAPABILITY,
      detail: `${preflight.missing.join("+")} → ${[...new Set(preflight.ciEquivalents)].join(", ")}`,
    };
  }
  const main = runGuard(file);

  let kind, detail;
  if (main.status === 0) {
    kind = STATIC_RESULT_CATEGORIES.PASS; detail = "";
  } else if (main.spawnError && main.status == null) {
    kind = STATIC_RESULT_CATEGORIES.FAIL_TEST; detail = `spawn: ${main.spawnError.message}`;
  } else if (options.unverifiableHereOk === true && isDbUnavailableOnly(main.out)) {
    kind = STATIC_RESULT_CATEGORIES.UNVERIFIABLE_HERE; detail = firstSignalLine(main.out);
  } else {
    kind = STATIC_RESULT_CATEGORIES.FAIL_TEST; detail = firstSignalLine(main.out);
  }

  // Fold a REAL selftest failure into FAIL regardless of the main-run classification (a guard whose
  // selftest breaks is broken even if its live run happened to pass or skip).
  if (src.includes("--selftest")) {
    const st = runGuard(file, ["--selftest"]);
    if (st.status !== 0) {
      kind = STATIC_RESULT_CATEGORIES.FAIL_TEST;
      detail = detail ? `${detail}; --selftest failed` : `--selftest failed: ${firstSignalLine(st.out)}`;
    }
  }

  return { file, name: path.basename(file), kind, detail };
}

/**
 * The set of guard FILES that CI's build-typecheck actually EXECUTES (parity target): every guard reachable
 * from a package.json `verify:*` script that is referenced by another script (the verify:arch-design chain
 * etc.), plus any guard file named directly in a workflow or a verify-steps step. A guard NOT in this set is
 * unwired — CI never runs it, so a local failure of it is out of scope for CI parity (informational, not
 * gated). Derived at runtime so it self-maintains as guards are wired/unwired.
 */
export function ciRunGuardSet(root = path.resolve(SCRIPTS_DIR, "..")) {
  const set = new Set();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const scripts = pkg.scripts || {};
    const nameToFile = {};
    for (const [k, v] of Object.entries(scripts)) {
      if (!k.startsWith("verify:")) continue;
      const m = String(v).match(/scripts\/(verify-[a-z0-9-]+\.mjs)/i);
      if (m) nameToFile[k.slice("verify:".length)] = m[1];
    }
    const allScriptText = Object.values(scripts).join("\n");
    for (const mm of allScriptText.matchAll(/verify:([a-z0-9-]+)/gi)) {
      const f = nameToFile[mm[1]];
      if (f) set.add(f);
    }
  } catch { /* no package.json (e.g. selftest temp dir) → empty set */ }
  const chunks = [];
  const wfDir = path.join(root, ".github/workflows");
  try { for (const f of fs.readdirSync(wfDir)) chunks.push(fs.readFileSync(path.join(wfDir, f), "utf8")); } catch {}
  // GATE-LIVELOCK-01: was hardcoded to SCRIPTS_DIR (this project's real scripts/ dir) even when a
  // caller passed a different `root` — dormant in production (every real caller invokes this with
  // no args), but it makes a custom-`root` call (a test fixture, GATE-LIVELOCK-01's stale-base
  // delta re-check against a fixture repo) silently read the WRONG project's verify-steps/, never
  // its own. `root`'s own scripts/verify-steps now, consistent with every other path here.
  const stepsDir = path.join(root, "scripts/verify-steps");
  try { for (const f of fs.readdirSync(stepsDir)) chunks.push(fs.readFileSync(path.join(stepsDir, f), "utf8")); } catch {}
  for (const txt of chunks) for (const mm of txt.matchAll(/verify-[a-z0-9-]+\.mjs/gi)) set.add(mm[0]);
  return set;
}

/** Run all static guards in a directory. Returns the results array (no process.exit — testable). Each
 *  result is annotated `gated` = is this guard part of the CI-run set (a local FAIL of it should fail us). */
export function runStatic({
  dir = SCRIPTS_DIR,
  self = SELF_NAME,
  ciSet,
  classifyOptions,
  policyLoader = loadCapabilityPolicy,
  // GATE-LIVELOCK-01: null (default) = no scoping, every guard runs — the CI/standalone shape,
  // unchanged from before this feature existed. An array = the local pre-push scoped path; each
  // guard not in scope becomes a cheap SKIP-scope result instead of a spawned child process.
  changedFiles = null,
  stepMap = null,
  // ROUND-P0-FACTORING-NAV (2026-09-14): a single-guard diagnostic run, e.g.
  // `node scripts/verify-static.mjs --only verify-factoring-nav-reachable`. Accepts the guard's
  // basename with or without the `verify-`/`.mjs` decoration so a human can type the short form.
  // Purely a filter on which files get spawned — does not change scoping/baseline semantics for
  // the (subset of) guards that do run.
  only = null,
} = {}) {
  const set = ciSet || ciRunGuardSet();
  const scopeMap = changedFiles !== null ? (stepMap ?? ensureFreshGateStepMap({ dir }).map) : null;
  const sharedClassifyOptions = { ...(classifyOptions ?? {}) };
  // Live capability verification is intentionally authoritative but must run once per sweep, not once
  // per ~1,100 guard files. A repeated network lookup is both unbounded and vulnerable to mid-run drift.
  if (!sharedClassifyOptions.preflight && !sharedClassifyOptions.policy) {
    sharedClassifyOptions.policy = policyLoader(
      sharedClassifyOptions.root ?? ROOT
    );
  }
  const onlyBase = only
    ? (only.startsWith("verify-") ? only : `verify-${only}`).replace(/(\.mjs)?$/, ".mjs")
    : null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^verify-.*\.mjs$/.test(f) && f !== self && !NON_STATIC_ORCHESTRATORS.has(f))
    .filter((f) => (onlyBase ? f === onlyBase : true))
    .sort()
    // docs/module-completion/<module>.md is GENERATED from the .json beside it and is no longer
    // committed (it conflicted on every merge). Four guards READ those files —
    // verify-banking-fail-registry, verify-projection-flags-off-by-design,
    // verify-bank-econ-04-honesty-keep and verify-bankfeed-je-match. In CI the generator is
    // verify-step 1431 and every reader is 1467+, so ordering holds there. This sweep runs
    // ALPHABETICALLY, where "bank*" sorts before "module-completion" — so the readers would run
    // against files that do not exist yet and fail for a reason that has nothing to do with them.
    // Hoisting the generator to the front makes the local sweep agree with CI.
    .sort((a, b) => {
      const gen = "verify-module-completion.mjs";
      if (a === gen) return -1;
      if (b === gen) return 1;
      return 0;
    })
    .map((f) => path.join(dir, f));
  // Pre-push runs this under husky with stdout fully buffered (not a TTY). With ~4,767 guards
  // and no progress, the process looks hung for minutes (an agent read a prior silent run as
  // "hung" — GATE-LIVELOCK-01). Progress prints every 10 steps with elapsed wall-clock seconds,
  // stderr is line-buffered even when piped.
  const total = files.length;
  const startedAt = Date.now();
  return files.map((f, i) => {
    const n = i + 1;
    const base = path.basename(f);
    if (n === 1 || n === total || n % 10 === 0) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      process.stderr.write(`[verify-static] ${n}/${total} (${elapsed}s elapsed) ${base}\n`);
    }
    if (scopeMap && !guardIsInScope(base, scopeMap.entries[base], changedFiles)) {
      return { name: base, kind: STATIC_RESULT_CATEGORIES.SKIP_SCOPE, detail: "not touched by this push's changed files", gated: set.has(base) };
    }
    const r = classify(f, sharedClassifyOptions);
    r.gated = set.has(r.name);
    return r;
  });
}

function printSummary(results) {
  const by = (k) => results.filter((r) => r.kind === k);
  const pass = by(STATIC_RESULT_CATEGORIES.PASS);
  const skipped = by(STATIC_RESULT_CATEGORIES.SKIP_CAPABILITY);
  const skippedScope = by(STATIC_RESULT_CATEGORIES.SKIP_SCOPE);
  const excludedLiveDb = by(STATIC_RESULT_CATEGORIES.EXCLUDED_LIVE_DB);
  const unverifiableHere = by(STATIC_RESULT_CATEGORIES.UNVERIFIABLE_HERE);
  const gatedFail = results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST && r.gated);
  const unwiredFail = results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST && !r.gated);
  console.log(`\n=== ${LABEL} summary ===`);
  console.log(
    `total ${results.length}  |  PASS ${pass.length}  ` +
    `FAIL-test(gated) ${gatedFail.length}  FAIL-test(unwired) ${unwiredFail.length}  ` +
    `SKIP-capability ${skipped.length}  SKIP-scope ${skippedScope.length}  ` +
    `EXCLUDED-live-db ${excludedLiveDb.length}  UNVERIFIABLE-here ${unverifiableHere.length}`,
  );
  if (unverifiableHere.length) {
    // STDERR on purpose: the push fallback (static-sweep-proof.mjs) pipes stdout and keeps only its last 500 chars,
    // and only on failure. stderr is inherited, so this list reaches the person pushing, every time, by name.
    console.error(
      `\n!!! UNVERIFIABLE-here (${unverifiableHere.length}) — NOT A PASS. Each failed ONLY because this local sweep has no ` +
      `DATABASE_URL (verify-static strips it by design). CI MUST still execute every one of these against a real database. ` +
      `WARNING: a guard that becomes unverifiable just by unsetting an env var is exactly how a dead guard hides — ` +
      `this list is printed by name so none can:`
    );
    for (const r of unverifiableHere) console.error(`  ?? ${r.name} — ${r.detail}`);
  }
  if (excludedLiveDb.length) {
    console.log(
      `\nEXCLUDED-live-db (${excludedLiveDb.length}) — declares REQUIRES_LIVE_DB, out of context for a ` +
      `no-DB sweep; still runs for real under money-pr-local-gate.mjs with a live DATABASE_URL:`
    );
    for (const r of excludedLiveDb) console.log(`  · ${r.name} — ${r.detail}`);
  }
  if (skippedScope.length) {
    console.log(
      `\nSKIP-scope (${skippedScope.length}) — path-scoped local pre-push only, NEVER how CI runs this ` +
      `(GATE_FULL=1 forces every guard; CI always globs the full unchanged set):`
    );
    for (const r of skippedScope) console.log(`  · ${r.name}`);
  }
  if (skipped.length) {
    console.log(`\nSKIP-capability (${skipped.length}) — explicit preflight + server-required equivalent:`);
    for (const r of skipped) console.log(`  · ${r.name} — ${r.detail}`);
  }
  if (unwiredFail.length) {
    console.log(`\nUNWIRED FAIL (${unwiredFail.length}) — INFORMATIONAL ONLY, does NOT fail this run (CI does not run these; pre-existing orphan/stale guards):`);
    for (const r of unwiredFail) console.log(`  · ${r.name} — ${r.detail}`);
  }
  if (gatedFail.length) {
    console.log(`\nFAIL (${gatedFail.length}) — CI-run static guard(s) failing; FIX before pushing:`);
    for (const r of gatedFail) console.log(`  ✗ ${r.name} — ${r.detail}`);
  }
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-static-selftest-"));
  try {
    fs.writeFileSync(path.join(tmp, "verify-pass-fixture.mjs"), `console.log("fixture OK"); process.exit(0);\n`);
    fs.writeFileSync(path.join(tmp, "verify-fail-fixture.mjs"), `console.error("  ✗ deliberate stale-anchor assertion"); process.exit(1);\n`);
    fs.writeFileSync(path.join(tmp, "verify-db-fixture.mjs"), `console.error("connect ECONNREFUSED 127.0.0.1:59999"); process.exit(1);\n`);
    // OPTION 3 fixtures: the canonical no-DB refusal alone, and the same refusal beside a real finding.
    fs.writeFileSync(path.join(tmp, "verify-nodb-refusal-fixture.mjs"), `console.error("x: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP."); process.exit(1);\n`);
    fs.writeFileSync(path.join(tmp, "verify-nodb-plus-finding-fixture.mjs"), `console.error("  ✗ 3 orphan rows"); console.error("x: FAIL — DATABASE_URL not set"); process.exit(1);\n`);
    fs.writeFileSync(path.join(tmp, "verify-local-ci.mjs"), `console.error("orchestrator must not run in static sweep"); process.exit(1);\n`);
    // a guard whose live run passes but whose --selftest is broken → must classify FAIL
    fs.writeFileSync(
      path.join(tmp, "verify-selftest-broken-fixture.mjs"),
      `if (process.argv.includes("--selftest")) { console.error("selftest broke"); process.exit(1); }\nconsole.log("live OK"); process.exit(0);\n`,
    );
    // ★ SAFETY LOCK: a guard that ACTUALLY opens a DB connection using the injected env must be isolated by
    // the sentinel → refused → classified SKIP-needs-db. If the sentinel ever regresses (env not injected,
    // port reachable), this fixture would CONNECT and exit 0 → classify PASS → the assertion below fails.
    fs.writeFileSync(
      path.join(tmp, "verify-sentinel-connect-fixture.mjs"),
      `import net from "node:net";\n` +
      `const s = net.connect(Number(process.env.PGPORT), process.env.PGHOST);\n` +
      `s.on("connect", () => { console.log("CONNECTED — sentinel failed to isolate"); s.destroy(); process.exit(0); });\n` +
      `s.on("error", (e) => { console.error(\`connect \${e.code} \${process.env.PGHOST}:\${process.env.PGPORT}\`); process.exit(1); });\n`,
    );

    // REQUIRES_LIVE_DB fixture — a planted failure (would exit 1 with an uncaught-looking crash if
    // ever spawned) declaring the exclusion. If the mechanism regresses and this guard actually
    // runs, it must show up as FAIL — the checks below assert it never does.
    fs.writeFileSync(
      path.join(tmp, "verify-requires-live-db-fixture.mjs"),
      `export const REQUIRES_LIVE_DB = "planted: must never run in a no-DB sweep";\n` +
      `console.error("planted: must never run — REQUIRES_LIVE_DB was not honored"); process.exit(1);\n`,
    );

    // Mock CI-run set: only the fail fixture is "wired" → its FAIL must gate; the broken-selftest FAIL is
    // unwired → informational (proves the gate keys off CI membership, not raw FAIL count).
    const ciSet = new Set(["verify-fail-fixture.mjs"]);
    const results = runStatic({
      dir: tmp,
      self: SELF_NAME,
      ciSet,
      classifyOptions: { preflight: { ok: true, missing: [], ciEquivalents: [] } },
    });
    const optedIn = runStatic({
      dir: tmp,
      self: SELF_NAME,
      ciSet: new Set(["verify-fail-fixture.mjs", "verify-nodb-refusal-fixture.mjs"]),
      classifyOptions: { preflight: { ok: true, missing: [], ciEquivalents: [] }, unverifiableHereOk: true },
    });
    const get = (n) => results.find((r) => r.name === n);
    const kindOf = (n) => get(n)?.kind;
    const isolated = noDbEnv();
    const checks = [
      ["noDbEnv unsets DATABASE_URL (SKIP path for live-prod audits)", !isolated.DATABASE_URL],
      ["noDbEnv unsets DATABASE_DIRECT_URL", !isolated.DATABASE_DIRECT_URL],
      ["noDbEnv strips every credential variable a guard reads", NO_DB_CREDENTIAL_VARS.every((k) => isolated[k] === undefined)],
      ["noDbEnv disables the gate read-only credential fallback (ROUND 370)", isolated.IH35_NO_GATE_CREDENTIAL_FALLBACK === "1"],
      ["a guard under noDbEnv cannot resolve the gate credential", spawnSync(process.execPath, ["--input-type=module", "-e", `import { resolveGateReadonlyDbUrl } from ${JSON.stringify(new URL("./lib/gate-db-credential.mjs", import.meta.url).href)}; process.stdout.write(String(resolveGateReadonlyDbUrl() === undefined));`], { env: { ...isolated, DATABASE_URL_READONLY: undefined }, encoding: "utf8" }).stdout === "true"],
      ["noDbEnv never sets a truthy dead-port DATABASE_URL", !/59999/.test(String(isolated.DATABASE_URL || ""))],
      ["pass fixture → PASS", kindOf("verify-pass-fixture.mjs") === STATIC_RESULT_CATEGORIES.PASS],
      ["fail fixture → FAIL-test", kindOf("verify-fail-fixture.mjs") === STATIC_RESULT_CATEGORIES.FAIL_TEST],
      ["DATABASE_URL text fixture → FAIL-test", kindOf("verify-db-fixture.mjs") === STATIC_RESULT_CATEGORIES.FAIL_TEST],
      // OPTION 3 (UNVERIFIABLE-here): only the canonical no-DB refusal, only when opted in, never with another ✗.
      ["matcher: canonical no-DB refusal alone is the unavailable shape", isDbUnavailableOnly("x: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP.") === true],
      ["no-DB refusal fixture is FAIL-test when NOT opted in (CI / block-ready shape)", kindOf("verify-nodb-refusal-fixture.mjs") === STATIC_RESULT_CATEGORIES.FAIL_TEST],
      ["no-DB refusal fixture is UNVERIFIABLE-here ONLY when opted in", classify(path.join(tmp, "verify-nodb-refusal-fixture.mjs"), { preflight: { ok: true, missing: [], ciEquivalents: [] }, unverifiableHereOk: true }).kind === STATIC_RESULT_CATEGORIES.UNVERIFIABLE_HERE],
      ["a real finding beside the no-DB refusal stays FAIL-test even when opted in", classify(path.join(tmp, "verify-nodb-plus-finding-fixture.mjs"), { preflight: { ok: true, missing: [], ciEquivalents: [] }, unverifiableHereOk: true }).kind === STATIC_RESULT_CATEGORIES.FAIL_TEST],
      ["CI refuses the relaxation (CI=true)", unverifiableHereRefusedHere({ CI: "true" }) === true],
      ["CI refuses the relaxation (GITHUB_ACTIONS)", unverifiableHereRefusedHere({ GITHUB_ACTIONS: "true" }) === true],
      ["a local shell may opt in", unverifiableHereRefusedHere({}) === false],
      ["UNVERIFIABLE-here is never PASS", STATIC_RESULT_CATEGORIES.UNVERIFIABLE_HERE !== STATIC_RESULT_CATEGORIES.PASS],
      ["a ✗ finding beside the no-DB line stays a real FAIL", isDbUnavailableOnly("  ✗ found 3 orphan rows\nx: FAIL — DATABASE_URL not set") === false],
      ["matcher: 'DATABASE_URL required' thrown Error is the unavailable shape", isDbUnavailableOnly("file:///x.mjs:9\n  throw new Error(`x: DATABASE_URL required; --selftest is not live proof`);\n  ^\nError: x: DATABASE_URL required; --selftest is not live proof\n    at file:///x.mjs:9:9\nNode.js v22") === true],
      ["matcher: 'DATABASE_URL is unset' is the unavailable shape", isDbUnavailableOnly("x: FAIL — DATABASE_URL is unset") === true],
      ["a static FAIL line beside the refusal stays a real FAIL", isDbUnavailableOnly("x: FAIL — static: 2 SUMs unfiltered\nx: FAIL — DATABASE_URL not set") === false],
      ["a ✘ line beside the refusal stays a real FAIL", isDbUnavailableOnly("✘ phantom relation\nDATABASE_URL not set") === false],
      ["no refusal phrase at all is never the unavailable shape", isDbUnavailableOnly("x: FAIL — something") === false],
      ["a connect error is NOT the no-DB refusal", isDbUnavailableOnly("connect ECONNREFUSED 127.0.0.1:59999") === false],
      ["broken-selftest fixture → FAIL-test", kindOf("verify-selftest-broken-fixture.mjs") === STATIC_RESULT_CATEGORIES.FAIL_TEST],
      ["local-CI orchestrator excluded from static sweep", get("verify-local-ci.mjs") === undefined],
      // sentinel safety property: a real DB-connect attempt is isolated → SKIP, never PASS, never real FAIL
      ["sentinel-connect fixture → FAIL-test without explicit preflight", kindOf("verify-sentinel-connect-fixture.mjs") === STATIC_RESULT_CATEGORIES.FAIL_TEST],
      // 4 original FAIL fixtures + the 2 OPTION 3 no-DB fixtures, which are FAIL-test when NOT opted in.
      ["exactly 6 FAIL-test (not opted in)", results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST).length === 6],
      ["0 UNVERIFIABLE-here when NOT opted in", results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.UNVERIFIABLE_HERE).length === 0],
      // Opted in (the push fallback): exactly the bare refusal moves to UNVERIFIABLE-here; the one with a real
      // finding stays FAIL-test, and an UNVERIFIABLE-here row never gates, even when its guard is CI-wired.
      ["opted in: exactly 5 FAIL-test", optedIn.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST).length === 5],
      ["opted in: exactly 1 UNVERIFIABLE-here (the bare refusal)", optedIn.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.UNVERIFIABLE_HERE).map((r) => r.name).join() === "verify-nodb-refusal-fixture.mjs"],
      // `gated` = CI-run membership. The wired refusal KEEPS it (CI must still execute it with a real database)
      // but never enters the push-blocking set, which is FAIL-test AND gated, and it is never PASS.
      ["opted in: wired UNVERIFIABLE-here stays CI-run (gated membership kept)", optedIn.find((r) => r.name === "verify-nodb-refusal-fixture.mjs")?.gated === true],
      ["opted in: UNVERIFIABLE-here never in the blocking set, never PASS", optedIn.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST && r.gated).map((r) => r.name).join() === "verify-fail-fixture.mjs" && optedIn.find((r) => r.name === "verify-nodb-refusal-fixture.mjs")?.kind !== STATIC_RESULT_CATEGORIES.PASS],
      // gating: the wired fail gates (gated FAIL = 1); the unwired broken-selftest fail does not
      ["gated FAIL count == 1 (only the CI-run guard gates)", results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST && r.gated).length === 1],
      ["wired fail is gated", get("verify-fail-fixture.mjs")?.gated === true],
      ["unwired fail not gated", get("verify-selftest-broken-fixture.mjs")?.gated === false],
      // REQUIRES_LIVE_DB: excluded, never spawned (the planted exit-1 must never surface as FAIL),
      // reason string captured verbatim, never counted toward gated or unwired FAIL.
      ["REQUIRES_LIVE_DB fixture → EXCLUDED-live-db, not FAIL-test", kindOf("verify-requires-live-db-fixture.mjs") === STATIC_RESULT_CATEGORIES.EXCLUDED_LIVE_DB],
      ["REQUIRES_LIVE_DB reason captured verbatim", get("verify-requires-live-db-fixture.mjs")?.detail === "planted: must never run in a no-DB sweep"],
      ["REQUIRES_LIVE_DB fixture never counted as FAIL-test (still exactly 6)", results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST).length === 6],
    ];

    // GATE-LIVELOCK-01 scoping selftest — guardIsInScope() as a pure-function unit test, plus a
    // full runStatic() pass proving an out-of-scope guard becomes SKIP-scope without being
    // spawned (a planted fixture that would exit 1 if actually run must NOT appear as FAIL).
    const ownedMap = { entries: { "verify-owned-fixture.mjs": { ownedPaths: ["apps/backend/src/x.ts"], alwaysRun: false } } };
    fs.writeFileSync(path.join(tmp, "verify-owned-fixture.mjs"), `console.error("planted: must never run when out of scope"); process.exit(1);\n`);
    const outOfScopeResults = runStatic({
      dir: tmp,
      self: SELF_NAME,
      ciSet: new Set(),
      classifyOptions: { preflight: { ok: true, missing: [], ciEquivalents: [] } },
      changedFiles: ["docs/unrelated.md"],
      stepMap: ownedMap,
    });
    const inScopeResults = runStatic({
      dir: tmp,
      self: SELF_NAME,
      ciSet: new Set(),
      classifyOptions: { preflight: { ok: true, missing: [], ciEquivalents: [] } },
      changedFiles: ["apps/backend/src/x.ts"],
      stepMap: ownedMap,
    });
    const outOfScope = outOfScopeResults.find((r) => r.name === "verify-owned-fixture.mjs");
    const inScope = inScopeResults.find((r) => r.name === "verify-owned-fixture.mjs");
    const scopingChecks = [
      ["guardIsInScope: null changedFiles never scopes", guardIsInScope("x.mjs", { ownedPaths: ["apps/x"] }, null) === true],
      ["guardIsInScope: alwaysRun always runs even with no overlap", guardIsInScope("x.mjs", { alwaysRun: true, ownedPaths: [] }, ["docs/unrelated.md"]) === true],
      ["guardIsInScope: missing map entry fails safe to run (never invented as out-of-scope)", guardIsInScope("x.mjs", undefined, ["docs/unrelated.md"]) === true],
      ["guardIsInScope: own filename in the diff always runs", guardIsInScope("verify-x.mjs", { ownedPaths: ["docs/y"] }, ["scripts/verify-x.mjs"]) === true],
      ["guardIsInScope: no overlap, not alwaysRun, own file not changed → out of scope", guardIsInScope("verify-x.mjs", { ownedPaths: ["apps/a"] }, ["docs/unrelated.md"]) === false],
      ["out-of-scope guard classified SKIP-scope, never spawned/FAIL", outOfScope?.kind === STATIC_RESULT_CATEGORIES.SKIP_SCOPE],
      ["in-scope guard with matching diff actually runs and is classified", inScope?.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST],
    ];
    checks.push(...scopingChecks);

    let bad = 0;
    for (const [n, ok] of checks) { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${n}`); }
    if (bad) { console.error(`\n${LABEL} SELFTEST FAILED: ${bad}`); process.exit(1); }
    console.log(`\n${LABEL} SELFTEST PASS`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * GATE-LIVELOCK-01: resolve scoping from the environment. `IH35_GATE_DIFF_FILES` is a newline-
 * separated changed-file list set ONLY by the local pre-push caller (static-sweep-proof.mjs) —
 * unset here means "run everything", the exact pre-fix default, so a bare
 * `node scripts/verify-static.mjs` (a human, CI, or any other caller) is never scoped by
 * accident. `GATE_FULL=1` always wins and forces every guard regardless of the diff env.
 */
export function resolveChangedFilesFromEnv(env = process.env) {
  if (env.GATE_FULL === "1" || env.GATE_FULL === "true") return null;
  const raw = env.IH35_GATE_DIFF_FILES;
  if (raw === undefined || raw === null) return null;
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === SELF_PATH;
if (isDirectRun) {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  const changedFiles = resolveChangedFilesFromEnv();
  if (changedFiles !== null) {
    console.log(
      `[${LABEL}] SCOPED local pre-push run — ${changedFiles.length} changed file(s). ` +
      `GATE_FULL=1 forces every guard; CI never scopes.`
    );
  }
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] ?? null : null;
  if (only) {
    console.log(`[${LABEL}] --only ${only} — single-guard diagnostic run, not the CI/pre-push shape.`);
  }
  // Opt-in ONLY via the local pre-push fallback (static-sweep-proof defaultRunStatic). CI never sets it.
  const unverifiableHereOk = process.env.IH35_STATIC_UNVERIFIABLE_HERE === "1";
  // OPTION 3 hard limit: CI must execute every guard with a real database, so the relaxation is refused there.
  if (unverifiableHereOk && unverifiableHereRefusedHere(process.env)) {
    console.error(`[${LABEL}] FAIL — IH35_STATIC_UNVERIFIABLE_HERE=1 is set in CI. UNVERIFIABLE-here is a local pre-push fallback only; CI must run every guard with a database. Unset it.`);
    process.exit(1);
  }
  if (unverifiableHereOk) {
    console.error(`[${LABEL}] IH35_STATIC_UNVERIFIABLE_HERE=1 — local pre-push fallback: no-database refusals are reported as UNVERIFIABLE-here (NOT a pass; CI still runs them).`);
  }
  const results = runStatic({ changedFiles, only, classifyOptions: unverifiableHereOk ? { unverifiableHereOk: true } : undefined });
  printSummary(results);
  const gatedFails = results.filter(
    (r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST && r.gated
  );
  const gatedFailCount = gatedFails.length;
  let baseline = null;
  try {
    baseline = loadHeadBaseline();
  } catch {
    baseline = null;
  }
  if (baseline?.status === "seeded") {
    const extra = extraFailsNotInBaseline(
      gatedFails.map((r) => r.name),
      baseline,
    );
    if (extra.length) {
      console.error(
        `\n[${LABEL}] FAILED — ${extra.length} gated fail(s) NOT in VERIFY-STATIC-BASELINE (new rot; do not grow the JSON):\n  ${extra.join("\n  ")}`,
      );
      process.exit(1);
    }
    console.log(
      `\n[${LABEL}] OK — GR-1 seeded: ${gatedFailCount} known baseline fail(s), 0 new names. Shrink the JSON when a name goes green.`,
    );
    process.exit(0);
  }
  if (gatedFailCount) {
    console.error(`\n[${LABEL}] FAILED — ${gatedFailCount} CI-run static-guard failure(s) above. Fix locally before pushing.`);
    process.exit(1);
  }
  console.log(`\n[${LABEL}] OK — no CI-run static-guard failures (capability skips are explicit; unwired FAIL-test results are informational only).`);
}
