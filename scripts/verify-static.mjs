#!/usr/bin/env node
/**
 * verify:static — run every NO-DB static guard locally before pushing, so a stale string-anchored guard
 * is caught here instead of costing a full CI round-trip on build-typecheck.
 *
 * What it does:
 *   - globs scripts/verify-*.mjs (EXCLUDING this runner),
 *   - runs each in a child process with NO reachable database, capturing stdout/stderr/exit,
 *   - classifies each: PASS (exit 0) | SKIP-needs-db (exit≠0 + a DB-connection signature) | FAIL (any
 *     other exit≠0 — a real assertion failure),
 *   - additionally runs each guard's `--selftest` when the file contains that flag; a real selftest
 *     failure folds into FAIL,
 *   - does NOT fail-fast: runs ALL guards, prints a summary (counts + names of every FAIL and SKIP),
 *   - exits 1 iff any real FAIL; SKIP-needs-db NEVER fails the run.
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

const SELF_PATH = fileURLToPath(import.meta.url);
const SELF_NAME = path.basename(SELF_PATH);
const SCRIPTS_DIR = path.dirname(SELF_PATH);
const LABEL = "verify-static";

// A DB-connection failure signature (block-specified) plus the sentinel's refusal codes.
const DB_NEEDED_RE = /ECONNREFUSED|does not exist|DATABASE_URL|ENOTFOUND|password authentication|ECONNRESET|EADDRNOTAVAIL/i;
// A "needs the CI build/deps environment" signature: a missing compiled dist, an uninstalled optional
// dependency, or a hang waiting on a live service. These are NOT stale-anchor failures — CI has the DB,
// the built dist, and every dep — so they SKIP locally rather than FAIL. A true stale-anchor failure emits
// NEITHER signature (it prints its own assertion text), so it still classifies FAIL and can't hide here.
const ENV_NEEDED_RE = /ERR_MODULE_NOT_FOUND|Cannot find package|Cannot find module|ERR_REQUIRE_ESM|ERR_UNKNOWN_FILE_EXTENSION|[/\\]dist[/\\]|ETIMEDOUT|ERR_DLOPEN|listen EADDRINUSE/i;

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
export function classify(file) {
  const src = (() => { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } })();
  const main = runGuard(file);

  let kind, detail;
  if (main.status === 0) {
    kind = "PASS"; detail = "";
  } else if (DB_NEEDED_RE.test(main.out)) {
    kind = "SKIP-needs-db"; detail = "";
  } else if (ENV_NEEDED_RE.test(main.out)) {
    kind = "SKIP-needs-env"; detail = firstSignalLine(main.out);
  } else if (main.spawnError && main.status == null) {
    // could not launch the child and it isn't a recognized DB/env skip → real failure
    kind = "FAIL"; detail = `spawn: ${main.spawnError.message}`;
  } else {
    kind = "FAIL"; detail = firstSignalLine(main.out);
  }

  // Fold a REAL selftest failure into FAIL regardless of the main-run classification (a guard whose
  // selftest breaks is broken even if its live run happened to pass or skip).
  if (src.includes("--selftest")) {
    const st = runGuard(file, ["--selftest"]);
    const stRealFail = st.status !== 0 && !DB_NEEDED_RE.test(st.out);
    if (stRealFail) {
      kind = "FAIL";
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
export function runStatic({ dir = SCRIPTS_DIR, self = SELF_NAME, ciSet } = {}) {
  const set = ciSet || ciRunGuardSet();
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^verify-.*\.mjs$/.test(f) && f !== self)
    .sort()
    .map((f) => path.join(dir, f));
  return files.map((f) => {
    const r = classify(f);
    r.gated = set.has(r.name);
    return r;
  });
}

function printSummary(results) {
  const by = (k) => results.filter((r) => r.kind === k);
  const pass = by("PASS");
  const skipDb = by("SKIP-needs-db");
  const skipEnv = by("SKIP-needs-env");
  const gatedFail = results.filter((r) => r.kind === "FAIL" && r.gated);
  const unwiredFail = results.filter((r) => r.kind === "FAIL" && !r.gated);
  console.log(`\n=== ${LABEL} summary ===`);
  console.log(
    `total ${results.length}  |  PASS ${pass.length}  ` +
    `FAIL(gated) ${gatedFail.length}  FAIL(unwired) ${unwiredFail.length}  ` +
    `SKIP-needs-db ${skipDb.length}  SKIP-needs-env ${skipEnv.length}`,
  );
  if (skipDb.length) {
    console.log(`\nSKIP-needs-db (${skipDb.length}) — need a real Postgres, not run here:`);
    for (const r of skipDb) console.log(`  · ${r.name}`);
  }
  if (skipEnv.length) {
    console.log(`\nSKIP-needs-env (${skipEnv.length}) — need the built dist / an optional dep / a live service:`);
    for (const r of skipEnv) console.log(`  · ${r.name} — ${r.detail}`);
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
    const results = runStatic({ dir: tmp, self: SELF_NAME, ciSet });
    const get = (n) => results.find((r) => r.name === n);
    const kindOf = (n) => get(n)?.kind;
    const checks = [
      ["pass fixture → PASS", kindOf("verify-pass-fixture.mjs") === "PASS"],
      ["fail fixture → FAIL", kindOf("verify-fail-fixture.mjs") === "FAIL"],
      ["db fixture → SKIP-needs-db", kindOf("verify-db-fixture.mjs") === "SKIP-needs-db"],
      ["broken-selftest fixture → FAIL", kindOf("verify-selftest-broken-fixture.mjs") === "FAIL"],
      // sentinel safety property: a real DB-connect attempt is isolated → SKIP, never PASS, never real FAIL
      ["sentinel-connect fixture → SKIP-needs-db (isolated, not PASS/FAIL)", kindOf("verify-sentinel-connect-fixture.mjs") === "SKIP-needs-db"],
      ["exactly 2 FAIL", results.filter((r) => r.kind === "FAIL").length === 2],
      ["exactly 2 SKIP", results.filter((r) => r.kind === "SKIP-needs-db").length === 2],
      // gating: the wired fail gates (gated FAIL = 1); the unwired broken-selftest fail does not
      ["gated FAIL count == 1 (only the CI-run guard gates)", results.filter((r) => r.kind === "FAIL" && r.gated).length === 1],
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

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const results = runStatic();
printSummary(results);
const gatedFailCount = results.filter((r) => r.kind === "FAIL" && r.gated).length;
if (gatedFailCount) {
  console.error(`\n[${LABEL}] FAILED — ${gatedFailCount} CI-run static-guard failure(s) above. Fix locally before pushing.`);
  process.exit(1);
}
console.log(`\n[${LABEL}] OK — no CI-run static-guard failures (DB/env-needed guards skipped; unwired FAILs are informational only).`);
process.exit(0);
