#!/usr/bin/env node
/** @independent-input .block-ready/ — scans block artifacts independently of the override declaration. */
// DOC-17 (owner directive 2026-07-11) — lifecycle enforcement: a block is DONE only when it is
// built→wired→linked→merged→DEPLOYED→LIVE-VERIFIED→registry-marked→tracker-reflects. Merged/CI-green ≠ done.
//
// This guard locks the DATA invariant that makes "false-done" impossible in the registry:
//   1. Every docs/trackers/block-status-overrides.json entry marked status=DONE MUST carry a non-empty
//      `evidence` AND a `verified_on` date — no bare DONE without a live proof.
//   2. Every .block-ready/*.json block whose status is a done-state ("done"/"live-verified"/"DONE") MUST
//      have at least one acceptance[] entry that is a LIVE proof — either {"kind":"live"} or a check whose
//      text names a live/prod/deploy/browser/DB proof — so "done" always has an end-to-end proof recorded.
// Static (reads JSON only, no DB/creds) → non-financial. Honest scope: it enforces "no DONE without a
// recorded live proof"; it does not (cannot, per-PR-statically) prove the proof itself — GUARD re-verifies live.
// Self-test: node scripts/verify-block-lifecycle.mjs --selftest
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-block-lifecycle";
const DONE_STATES = new Set(["done", "live-verified", "live", "complete", "completed"]);
const LIVE_RE = /\b(live|prod|production|deploy|health-?sha|healthz|browser|convalidated|recon_runs|db row|endpoint returns|column populated|render(ed)? confirmed)\b/i;

function isDoneStatus(s) {
  return DONE_STATES.has(String(s || "").trim().toLowerCase());
}

/** A block marked done must have a recorded live proof among its acceptance entries. */
export function blockHasLiveProof(block) {
  const acc = Array.isArray(block.acceptance) ? block.acceptance : [];
  return acc.some((a) => {
    if (a && typeof a === "object") {
      if (String(a.kind || "").toLowerCase() === "live") return true;
      if (LIVE_RE.test(String(a.check || ""))) return true;
    }
    return false;
  });
}

export function checkOverrides(overridesJson) {
  const failures = [];
  const list = Array.isArray(overridesJson?.overrides) ? overridesJson.overrides : [];
  for (const o of list) {
    if (String(o.status || "").toUpperCase() === "DONE") {
      if (!o.evidence || !String(o.evidence).trim()) failures.push(`override ${o.id}: status DONE but no evidence`);
      if (!o.verified_on || !String(o.verified_on).trim()) failures.push(`override ${o.id}: status DONE but no verified_on`);
    }
  }
  return failures;
}

/** Docs-only / design-lock blocks deliver a merged DOC, not prod behavior — their "done" proof is the doc on
 *  main, so they are exempt from the live-prod-proof requirement (they still must be merged, which reconcile checks). */
export function isDocsOnlyBlock(block) {
  const cls = String(block.classification || "").toLowerCase();
  if (/docs?-only|design lock|doc-deliverable|documentation/.test(cls)) return true;
  const files = Array.isArray(block.allowed_files) ? block.allowed_files : [];
  if (files.length > 0 && block.db_required === false && block.guard_required === false &&
      files.every((f) => /\.(md|json)$|docs\/|\.block-ready\//i.test(String(f)))) return true;
  return false;
}

export function checkBlockReady(blocks) {
  const failures = [];
  for (const { id, block } of blocks) {
    if (isDoneStatus(block.status) && !isDocsOnlyBlock(block) && !blockHasLiveProof(block)) {
      failures.push(`block ${id}: status "${block.status}" but no live-proof acceptance entry (add {"kind":"live", ...} or a live/prod/deploy/browser proof)`);
    }
  }
  return failures;
}

function scan() {
  const failures = [];
  const ovPath = path.join(ROOT, "docs/trackers/block-status-overrides.json");
  if (fs.existsSync(ovPath)) {
    failures.push(...checkOverrides(JSON.parse(fs.readFileSync(ovPath, "utf8"))));
  }
  const brDir = path.join(ROOT, ".block-ready");
  const blocks = [];
  if (fs.existsSync(brDir)) {
    for (const f of fs.readdirSync(brDir).filter((f) => f.endsWith(".json"))) {
      try {
        const block = JSON.parse(fs.readFileSync(path.join(brDir, f), "utf8"));
        blocks.push({ id: block.block_id || f, block });
      } catch {
        failures.push(`.block-ready/${f}: invalid JSON`);
      }
    }
  }
  failures.push(...checkBlockReady(blocks));
  return { failures, count: blocks.length };
}

function selftest() {
  // Override DONE with evidence + verified_on → OK; without → FAIL.
  if (checkOverrides({ overrides: [{ id: "x", status: "DONE", evidence: "8 FKs convalidated on prod", verified_on: "2026-07-11" }] }).length)
    { console.error(`${LABEL} --selftest FAILED: a DONE override with evidence+verified_on should pass`); process.exit(1); }
  if (checkOverrides({ overrides: [{ id: "y", status: "DONE" }] }).length === 0)
    { console.error(`${LABEL} --selftest FAILED: a DONE override with no evidence must be caught`); process.exit(1); }
  // Done block with a live-proof acceptance → OK; without → FAIL.
  if (checkBlockReady([{ id: "b1", block: { status: "done", acceptance: [{ kind: "live", check: "recon_runs row exists on prod" }] } }]).length)
    { console.error(`${LABEL} --selftest FAILED: a done block with a live proof should pass`); process.exit(1); }
  if (checkBlockReady([{ id: "b2", block: { status: "done", acceptance: [{ check: "code compiles" }] } }]).length === 0)
    { console.error(`${LABEL} --selftest FAILED: a done block with no live proof must be caught`); process.exit(1); }
  // In-progress block with no live proof → OK (not done yet).
  if (checkBlockReady([{ id: "b3", block: { status: "in-progress", acceptance: [{ check: "code compiles" }] } }]).length)
    { console.error(`${LABEL} --selftest FAILED: an in-progress block must not be flagged`); process.exit(1); }
  // Docs-only design-lock block done with no prod proof → OK (its proof is the merged doc).
  if (checkBlockReady([{ id: "d1", block: { status: "done", classification: "ADDITIVE (docs-only design lock)", acceptance: [{ check: "spec committed" }] } }]).length)
    { console.error(`${LABEL} --selftest FAILED: a docs-only design-lock block must be exempt from the live-proof rule`); process.exit(1); }
  console.log(`${LABEL} --selftest — OK (DONE overrides need evidence+verified_on; done blocks need a live-proof acceptance)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const { failures, count } = scan();
  if (failures.length) {
    console.error(`${LABEL} — FAILED`);
    for (const m of failures) console.error(`- ${m}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK (${count} blocks; every DONE verdict carries a live proof)`);
}
