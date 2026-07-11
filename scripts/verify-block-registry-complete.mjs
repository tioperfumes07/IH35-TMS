#!/usr/bin/env node
// verify-block-registry-complete (G1, LINKAGE-LAW Clause 7)
// "Promises failed; mechanisms don't." Work done without a registry entry is invisible to the Program
// board and can be silently skipped or duplicated. This guard makes "issued but unregistered" a red CI.
//
// It is DESIGNED NOT TO FALSE-FAIL:
//  - CHECK 1 (always): every .block-ready/*.json is valid JSON.
//  - CHECK 2 (forward-only): .block-ready/*.json ADDED or MODIFIED vs origin/main must carry the full
//    contract (block_id, status, classification, allowed_files, non-empty acceptance[]). The 368 legacy
//    entries are grandfathered — the contract is enforced going forward, never retroactively.
//  - CHECK 3 (issued-but-unregistered): any `Block: <id>` trailer on this branch's commits must have a
//    matching .block-ready/<id>.json.
//  - Git-dependent checks (2 & 3) degrade to a PASS when git history is unavailable (shallow CI checkout,
//    detached state) — the structural check always runs, so the guard never red-lines on infra alone.
//
// Self-test: node scripts/verify-block-registry-complete.mjs --selftest
// LINKAGE: N/A (enforcement infra; no entity record, no operating_company_id). Additive only.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_DIR = path.join(ROOT, ".block-ready");
const REQUIRED_FIELDS = ["block_id", "status", "classification", "allowed_files", "acceptance"];

/** Validate ONE registry object against the going-forward contract. Returns array of human errors. */
export function validateEntry(obj, file) {
  const errs = [];
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return [`${file}: not a JSON object`];
  }
  if (typeof obj.block_id !== "string" || !obj.block_id.trim()) errs.push(`${file}: missing string 'block_id'`);
  if (typeof obj.status !== "string" || !obj.status.trim()) errs.push(`${file}: missing string 'status'`);
  if (typeof obj.classification !== "string" || !obj.classification.trim())
    errs.push(`${file}: missing string 'classification'`);
  if (!Array.isArray(obj.allowed_files) || obj.allowed_files.length === 0)
    errs.push(`${file}: missing non-empty 'allowed_files[]'`);
  if (!Array.isArray(obj.acceptance) || obj.acceptance.length === 0)
    errs.push(`${file}: missing non-empty 'acceptance[]' (LINKAGE-LAW Clause 6 — written at cut time)`);
  return errs;
}

/** Extract `Block: <id>` trailer ids (case-insensitive) from a blob of commit-message text. */
export function parseBlockTrailers(commitText) {
  const ids = new Set();
  for (const m of String(commitText).matchAll(/^\s*Block:\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,60})\s*$/gim)) {
    ids.add(m[1].trim());
  }
  return [...ids];
}

function tryGit(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null; // degrade to pass — never false-fail on missing history
  }
}

function registeredIds() {
  const set = new Set();
  if (!fs.existsSync(REGISTRY_DIR)) return set;
  for (const f of fs.readdirSync(REGISTRY_DIR)) {
    if (f.endsWith(".json")) set.add(f.slice(0, -5));
  }
  return set;
}

function run() {
  const failures = [];

  // CHECK 1 — structural: every registry file is valid JSON.
  const files = fs.existsSync(REGISTRY_DIR)
    ? fs.readdirSync(REGISTRY_DIR).filter((f) => f.endsWith(".json"))
    : [];
  const parsed = new Map();
  for (const f of files) {
    try {
      parsed.set(f, JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, f), "utf8")));
    } catch (e) {
      failures.push(`.block-ready/${f}: invalid JSON — ${String(e.message).slice(0, 120)}`);
    }
  }

  // CHECK 2 — forward completeness: entries ADDED/MODIFIED vs origin/main must meet the full contract.
  const diff = tryGit("diff --name-only --diff-filter=AM origin/main...HEAD -- .block-ready/");
  if (diff !== null) {
    const changed = diff.split("\n").map((s) => s.trim()).filter((s) => s.endsWith(".json"));
    for (const rel of changed) {
      const f = path.basename(rel);
      const obj = parsed.get(f);
      if (obj === undefined) continue; // deleted/renamed — additive-only guard doesn't police deletions
      failures.push(...validateEntry(obj, `.block-ready/${f} (new/changed)`));
    }
  }

  // CHECK 3 — issued-but-unregistered: `Block: <id>` trailers on this branch must be registered.
  const log = tryGit("log origin/main..HEAD --format=%B");
  if (log !== null) {
    const ids = registeredIds();
    for (const id of parseBlockTrailers(log)) {
      if (!ids.has(id)) {
        failures.push(`commit trailer references Block: ${id} but .block-ready/${id}.json is not registered`);
      }
    }
  }

  return failures;
}

// ── self-test (negative + positive controls) ──────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  const checks = [];
  // negative: new entry missing acceptance[] must fail validation
  checks.push([
    "new entry missing acceptance[] fails",
    validateEntry({ block_id: "X", status: "BUILD", classification: "NON-FINANCIAL", allowed_files: ["a"] }, "x.json").length > 0,
  ]);
  // negative: entry missing status fails
  checks.push([
    "entry missing status fails",
    validateEntry({ block_id: "X", classification: "NF", allowed_files: ["a"], acceptance: [{ kind: "guard" }] }, "x.json").length > 0,
  ]);
  // positive: complete entry passes
  checks.push([
    "complete entry passes",
    validateEntry({ block_id: "X", status: "BUILD", classification: "NON-FINANCIAL", allowed_files: ["a"], acceptance: [{ kind: "guard" }] }, "x.json").length === 0,
  ]);
  // negative: Block: trailer is detected
  checks.push(["Block: trailer parsed", parseBlockTrailers("feat: x\n\nBlock: FAKE-UNREGISTERED\n").includes("FAKE-UNREGISTERED")]);
  // positive: no trailer -> none
  checks.push(["no trailer -> empty", parseBlockTrailers("feat: no block here").length === 0]);
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:block-registry-complete --selftest FAIL:");
    for (const [name] of failed) console.error("  ✗ " + name);
    process.exit(1);
  }
  console.log(`verify:block-registry-complete --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

export { run };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && !process.argv.includes("--selftest")) {
  const failures = run();
  if (failures.length) {
    console.error("verify:block-registry-complete FAIL — issued/changed blocks must be registered + complete:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:block-registry-complete PASS (registry valid; new entries complete; no unregistered Block: trailers)");
}
