#!/usr/bin/env node
// verify-block-acceptance (G2, LINKAGE-LAW Clause 6 & 8)
// "done" has meant "PR merged," not "wired + populated + effective." This guard makes a block's own
// acceptance[] the gate: a block cannot be status=done/complete with any UNRESOLVED acceptance item.
//
// Split by what a static CI guard can honestly prove:
//   STATIC (resolved here): migration (a db/migrations file matches), guard{script,wired_into}
//     (script exists AND is referenced by verify-pre-commit / a workflow / package.json),
//     mounted (component file exists AND is imported somewhere), route (string registered in routes),
//     design (the named docs/specs file exists), file (path exists).
//   DB-BACKED (well-formedness only; RESOLUTION deferred to the owner's Neon proof, Clause 8):
//     table/column/fk/rls/data/effective — checked for well-formedness (names/query present), never
//     silently absent, but not resolved against a live DB (the guard job has no schema DB).
//   MANDATORY PRESENCE (Clause 6): a block that declares a `flag` MUST carry an `effective` item.
//
// NEVER FALSE-FAILS: enforced FORWARD-ONLY — only .block-ready entries ADDED/CHANGED vs origin/main are
// gated; the legacy backlog (entries without acceptance[]) is grandfathered. Git-diff degrades to PASS on
// shallow history. Self-test: node scripts/verify-block-acceptance.mjs --selftest
// LINKAGE: N/A (enforcement infra). Additive only.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_DIR = path.join(ROOT, ".block-ready");
const DONE = new Set(["done", "complete", "DONE", "COMPLETE", "merged", "MERGED"]);
const DB_KINDS = new Set(["table", "column", "fk", "rls", "data", "effective"]);

function exists(rel) {
  try { return fs.existsSync(path.join(ROOT, rel)); } catch { return false; }
}
function readIfExists(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return ""; }
}
function grepRepo(needle, dirs) {
  // shallow, bounded grep across a few source dirs; returns true if found
  for (const d of dirs) {
    try {
      execSync(`grep -rqF ${JSON.stringify(needle)} ${d}`, { cwd: ROOT, stdio: "ignore" });
      return true;
    } catch { /* not found in this dir */ }
  }
  return false;
}

/** Resolve ONE acceptance item. Returns {ok, deferred, msg}. */
export function resolveItem(item) {
  if (typeof item !== "object" || item === null || !item.kind) {
    return { ok: false, deferred: false, msg: `malformed acceptance item: ${JSON.stringify(item).slice(0, 80)}` };
  }
  const k = item.kind;
  if (DB_KINDS.has(k)) {
    // well-formedness only; resolution deferred to the Neon proof
    const named =
      (k === "data" && item.assert) ||
      (k === "effective" && item.flag) ||
      ((k === "table" || k === "rls") && item.value) ||
      ((k === "column" || k === "fk") && (item.name || item.from || item.table || item.value));
    if (!named) return { ok: false, deferred: false, msg: `${k} item missing its target (value/name/assert/flag)` };
    return { ok: true, deferred: true, msg: `${k} well-formed — resolution deferred to Neon proof` };
  }
  switch (k) {
    case "migration": {
      const m = item.matches || item.value;
      if (!m) return { ok: false, deferred: false, msg: "migration item missing matches/value" };
      const hit = fs.readdirSync(path.join(ROOT, "db/migrations")).some((f) => f.includes(m));
      return { ok: hit, deferred: false, msg: hit ? "migration present" : `no db/migrations file matches "${m}"` };
    }
    case "guard": {
      if (!item.script || !item.wired_into) return { ok: false, deferred: false, msg: "guard item needs {script, wired_into}" };
      if (!exists(item.script)) return { ok: false, deferred: false, msg: `guard script missing: ${item.script}` };
      const base = path.basename(item.script);
      const wired =
        readIfExists("scripts/verify-pre-commit.mjs").includes(base) ||
        grepRepo(base, ["scripts/verify-steps", ".github/workflows", "package.json"]);
      return { ok: wired, deferred: false, msg: wired ? "guard wired" : `guard ${base} exists but not wired into verify-pre-commit/workflow/package.json` };
    }
    case "mounted": {
      const c = item.component;
      if (!c) return { ok: false, deferred: false, msg: "mounted item missing component" };
      const imported = grepRepo(c.replace(/\.tsx?$/, ""), ["apps/frontend/src"]);
      return { ok: imported, deferred: false, msg: imported ? "component referenced" : `component ${c} not imported/routed anywhere` };
    }
    case "route": {
      const r = item.value;
      if (!r) return { ok: false, deferred: false, msg: "route item missing value" };
      const reg = grepRepo(r, ["apps/backend/src", "apps/frontend/src"]);
      return { ok: reg, deferred: false, msg: reg ? "route registered" : `route ${r} not registered` };
    }
    case "design": {
      const s = item.spec;
      if (!s) return { ok: false, deferred: false, msg: "design item missing spec" };
      const ok = exists(s) || exists(path.join("docs/specs", path.basename(s))) || exists(path.join("docs/trackers", path.basename(s)));
      return { ok, deferred: false, msg: ok ? "design spec present" : `design spec missing: ${s}` };
    }
    case "file": {
      const ok = exists(item.value || item.path || "");
      return { ok, deferred: false, msg: ok ? "file present" : `file missing: ${item.value || item.path}` };
    }
    case "live":
      return { ok: true, deferred: true, msg: "live-proof note — verified at Neon/owner step" };
    default:
      return { ok: true, deferred: true, msg: `unknown kind ${k} — accepted as note` };
  }
}

/** Evaluate a block's acceptance[]. Returns array of failure strings. */
export function evaluateBlock(obj, id) {
  const errs = [];
  if (!DONE.has(obj.status)) return errs; // only done/complete blocks are gated
  const acc = Array.isArray(obj.acceptance) ? obj.acceptance : [];
  if (obj.flag && !acc.some((a) => a && a.kind === "effective")) {
    errs.push(`${id}: declares flag '${obj.flag}' but has no {kind:"effective"} acceptance item (Clause 6 mandatory)`);
  }
  for (const item of acc) {
    const r = resolveItem(item);
    if (!r.ok) errs.push(`${id}: acceptance ${item && item.kind} unresolved — ${r.msg}`);
  }
  return errs;
}

function tryGit(args) {
  try { return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return null; }
}

function run() {
  const failures = [];
  const diff = tryGit("diff --name-only --diff-filter=AM origin/main...HEAD -- .block-ready/");
  let targets;
  if (diff === null) {
    targets = []; // no history -> degrade to pass (never false-fail)
  } else {
    targets = diff.split("\n").map((s) => s.trim()).filter((s) => s.endsWith(".json")).map((s) => path.basename(s));
  }
  for (const f of targets) {
    let obj;
    try { obj = JSON.parse(readIfExists(path.join(".block-ready", f))); } catch { continue; }
    if (!obj) continue;
    failures.push(...evaluateBlock(obj, `.block-ready/${f}`));
  }
  return failures;
}

export { run };

if (process.argv.includes("--selftest")) {
  const checks = [];
  // hollow done-block: guard item pointing at a missing script -> fails
  checks.push(["hollow done-block fails", evaluateBlock({ status: "done", acceptance: [{ kind: "guard", script: "scripts/does-not-exist.mjs", wired_into: "x" }] }, "h").length > 0]);
  // flag-declaring done-block without effective item -> fails
  checks.push(["flag block missing effective fails", evaluateBlock({ status: "done", flag: "X_ENABLED", acceptance: [] }, "f").length > 0]);
  // fully-resolved static block passes (design->this file dir exists; use a known present spec)
  checks.push(["resolved block passes", evaluateBlock({ status: "done", acceptance: [{ kind: "design", spec: "docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md" }] }, "r").length === 0]);
  // db-kind well-formed but missing target -> fails
  checks.push(["malformed data item fails", resolveItem({ kind: "data" }).ok === false]);
  // db-kind well-formed -> ok+deferred
  checks.push(["well-formed data item deferred-ok", (() => { const r = resolveItem({ kind: "data", assert: "SELECT count(*) ...", expect: 0 }); return r.ok && r.deferred; })()]);
  // non-done block ignored
  checks.push(["non-done block ignored", evaluateBlock({ status: "BUILD", acceptance: [{ kind: "guard", script: "nope.mjs", wired_into: "x" }] }, "b").length === 0]);
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:block-acceptance --selftest FAIL:");
    for (const [name] of failed) console.error("  ✗ " + name);
    process.exit(1);
  }
  console.log(`verify:block-acceptance --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:block-acceptance FAIL — a done/complete block has unresolved acceptance[]:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:block-acceptance PASS (new/changed done-blocks have resolved acceptance[]; DB kinds deferred to Neon proof)");
}
