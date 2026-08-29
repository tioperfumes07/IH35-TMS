#!/usr/bin/env node
/**
 * verify:static — run every NO-DB static guard locally before pushing, so a stale string-anchored guard
 * is caught here instead of costing a full CI round-trip on build-typecheck.
 *
 * What it does:
 *   - globs scripts/verify-*.mjs (EXCLUDING this runner),
 *   - runs each in a child process with NO reachable database, capturing stdout/stderr/exit,
 *   - classifies each through an explicit capability preflight, never by matching failure text:
 *     PASS | SKIP-capability (only with a named server-required CI equivalent) | FAIL-test,
 *   - additionally runs each guard's `--selftest` when the file contains that flag; a real selftest
 *     failure folds into FAIL,
 *   - does NOT fail-fast: runs ALL guards, prints a summary (counts + names of every FAIL and SKIP),
 *   - exits 1 iff any real test fails; dirty/conflict/freshness are enforced by branch:precheck-push.
 *
 * ★ Prod-safety deviation from the block's literal "UNSET DATABASE_URL": simply unsetting is UNSAFE here.
 * The repo has a root .env and several guards `import 'dotenv/config'`; with the vars unset, dotenv would
 * reload DATABASE_URL/DATABASE_DIRECT_URL from .env and a DB guard could connect to whatever it points at
 * (the §1.5 prod-connection landmine). Instead we POINT the DB env at a guaranteed-dead local sentinel
 * (127.0.0.1:59999). dotenv (override:false by default) will not overwrite an already-set var, so guards
 * can never reach a real database: DB guards fail fast with ECONNREFUSED → SKIP-needs-db. Same
 * classification as a true unset, with zero risk of touching prod. Also neutralizes libpq PG* fallbacks.
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
  FAIL_TEST: "FAIL-test",
});

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

/** Child env with NO reachable database (dead-port sentinel; see the prod-safety note above). */
function noDbEnv() {
  const env = { ...process.env };
  const SENTINEL = "postgresql://verify_static:none@127.0.0.1:59999/verify_static_none";
  env.DATABASE_URL = SENTINEL;
  env.DATABASE_DIRECT_URL = SENTINEL;
  // libpq / node-pg default fallbacks → also point at the dead port so a bare new Pool() can't reach a
  // real local postgres either.
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

/** Classify a single guard file. Pure w.r.t. the filesystem read of the guard's own source. */
export function classify(file, options = {}) {
  const src = (() => { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } })();
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
  const stepsDir = path.join(SCRIPTS_DIR, "verify-steps");
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
} = {}) {
  const set = ciSet || ciRunGuardSet();
  const sharedClassifyOptions = { ...(classifyOptions ?? {}) };
  // Live capability verification is intentionally authoritative but must run once per sweep, not once
  // per ~1,100 guard files. A repeated network lookup is both unbounded and vulnerable to mid-run drift.
  if (!sharedClassifyOptions.preflight && !sharedClassifyOptions.policy) {
    sharedClassifyOptions.policy = policyLoader(
      sharedClassifyOptions.root ?? ROOT
    );
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^verify-.*\.mjs$/.test(f) && f !== self && !NON_STATIC_ORCHESTRATORS.has(f))
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
  return files.map((f) => {
    const r = classify(f, sharedClassifyOptions);
    r.gated = set.has(r.name);
    return r;
  });
}

function printSummary(results) {
  const by = (k) => results.filter((r) => r.kind === k);
  const pass = by(STATIC_RESULT_CATEGORIES.PASS);
  const skipped = by(STATIC_RESULT_CATEGORIES.SKIP_CAPABILITY);
  const gatedFail = results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST && r.gated);
  const unwiredFail = results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST && !r.gated);
  console.log(`\n=== ${LABEL} summary ===`);
  console.log(
    `total ${results.length}  |  PASS ${pass.length}  ` +
    `FAIL-test(gated) ${gatedFail.length}  FAIL-test(unwired) ${unwiredFail.length}  ` +
    `SKIP-capability ${skipped.length}`,
  );
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

    // Mock CI-run set: only the fail fixture is "wired" → its FAIL must gate; the broken-selftest FAIL is
    // unwired → informational (proves the gate keys off CI membership, not raw FAIL count).
    const ciSet = new Set(["verify-fail-fixture.mjs"]);
    const results = runStatic({
      dir: tmp,
      self: SELF_NAME,
      ciSet,
      classifyOptions: { preflight: { ok: true, missing: [], ciEquivalents: [] } },
    });
    const get = (n) => results.find((r) => r.name === n);
    const kindOf = (n) => get(n)?.kind;
    const checks = [
      ["pass fixture → PASS", kindOf("verify-pass-fixture.mjs") === STATIC_RESULT_CATEGORIES.PASS],
      ["fail fixture → FAIL-test", kindOf("verify-fail-fixture.mjs") === STATIC_RESULT_CATEGORIES.FAIL_TEST],
      ["DATABASE_URL text fixture → FAIL-test", kindOf("verify-db-fixture.mjs") === STATIC_RESULT_CATEGORIES.FAIL_TEST],
      ["broken-selftest fixture → FAIL-test", kindOf("verify-selftest-broken-fixture.mjs") === STATIC_RESULT_CATEGORIES.FAIL_TEST],
      ["local-CI orchestrator excluded from static sweep", get("verify-local-ci.mjs") === undefined],
      // sentinel safety property: a real DB-connect attempt is isolated → SKIP, never PASS, never real FAIL
      ["sentinel-connect fixture → FAIL-test without explicit preflight", kindOf("verify-sentinel-connect-fixture.mjs") === STATIC_RESULT_CATEGORIES.FAIL_TEST],
      ["exactly 4 FAIL-test", results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST).length === 4],
      // gating: the wired fail gates (gated FAIL = 1); the unwired broken-selftest fail does not
      ["gated FAIL count == 1 (only the CI-run guard gates)", results.filter((r) => r.kind === STATIC_RESULT_CATEGORIES.FAIL_TEST && r.gated).length === 1],
      ["wired fail is gated", get("verify-fail-fixture.mjs")?.gated === true],
      ["unwired fail not gated", get("verify-selftest-broken-fixture.mjs")?.gated === false],
    ];
    let bad = 0;
    for (const [n, ok] of checks) { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${n}`); }
    if (bad) { console.error(`\n${LABEL} SELFTEST FAILED: ${bad}`); process.exit(1); }
    console.log(`\n${LABEL} SELFTEST PASS`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === SELF_PATH;
if (isDirectRun) {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  const results = runStatic();
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
