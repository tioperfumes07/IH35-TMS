#!/usr/bin/env node
/** @independent-input origin/main — compares changed overrides with their committed predecessors. */
// ============================================================================
// verify-block-status-overrides-downgrade-only.mjs — STATIC CI GUARD
// ----------------------------------------------------------------------------
// Closes the FAKE-GREEN CLASS at its last remaining entry point.
//
// WHY THIS EXISTS (2026-07-20, found while registering 6 financial blocks):
//   The reconciler classifies a block DONE the moment all its signature files
//   are present on main. It has no database and it NEVER reads acceptance[].
//   So merely registering a block whose code exists but whose TABLES ARE EMPTY
//   auto-promotes it to DONE — manufacturing green from file presence alone.
//   That was neutralized with DOWNGRADE-ONLY override rows.
//
//   But docs/trackers/block-status-overrides.json is applied LAST and takes
//   precedence over everything, including the reconciler's own evidence. So the
//   overrides file is itself an unguarded path to fake green: one row saying
//   {"id":"X","status":"DONE"} silently overrides all evidence, with nothing
//   stopping it. Patching individual blocks does not close that; this does.
//
// THE RULE
//   Downgrades are always allowed — refusing a DONE claim cannot manufacture
//   green, so a row moving a block toward PENDING/NEEDS-VERIFY needs no proof.
//   UPGRADES TOWARD DONE must carry LIVE evidence: a prod/DB/deploy observation.
//   Code-presence language is explicitly REJECTED, because "all files on main"
//   is precisely the signal that created this defect class in the first place.
//
// NEVER FALSE-FAILS the legacy backlog: the live-evidence rule is enforced
//   FORWARD-ONLY — only rows ADDED or CHANGED vs origin/main are gated. The 70
//   pre-existing DONE rows are grandfathered. Structural shape IS checked on
//   every row (all 96 legacy rows already conform, verified 2026-07-20).
//   With no git history (shallow/CI edge) it degrades to shape-only, never a
//   false fail.
//
// Self-test:  node scripts/verify-block-status-overrides-downgrade-only.mjs --selftest
// LINKAGE: N/A (reporting/enforcement infra). Additive only. Read-only.
// ============================================================================
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "docs/trackers/block-status-overrides.json";

/** Truth-rank. A HIGHER rank is a stronger built-claim; moving up needs proof. */
export const STATUS_RANK = {
  PENDING: 0,
  "PENDING (GATED)": 1,
  "NEEDS-VERIFY": 2,
  DONE: 3,
  /** Evaporated / unmeasurable audit findings — not an upgrade path to DONE. */
  "AUDIT-NOTE": 0,
};

/**
 * Evidence that a claim was observed in the REAL SYSTEM — prod DB, a deployed
 * build, a row count, a tie-out. This is what a DONE upgrade must carry.
 */
const LIVE_PROOF =
  /\b(prod|production|live[- ]?verified|live check|neon|row count|rows returned|\d+\s+rows?|health[- ]sha|deployed|deploy sha|observed|queried|tie[- ]?out|to the cent|end[- ]to[- ]end)\b/i;

/**
 * Code-presence language — the exact signal that manufactures fake DONEs.
 * Rejected for an upgrade even if LIVE_PROOF also matches, because a row that
 * leans on file presence is not live proof no matter what else it says.
 */
// NOTE the `\(s\)?` alternatives: the reconciler emits its evidence with LITERAL parens —
// "all 4 file(s) on main", "all 3 named artifact(s) on main". A naive /files? on main/ does NOT
// match "file(s) on main", so that exact real-world string would have slipped past this check.
// Caught by the negative test on 2026-07-20; do not "simplify" these alternatives away.
const CODE_PRESENCE_ONLY =
  /\b(files?(\(s\))? on main|file\(s\) on main|artifacts?(\(s\))? on main|artifact\(s\) on main|title[- ]?match|code[- ]presence|files? present|signature files?)\b/i;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure decision function (unit-tested by --selftest).
 * @returns {string[]} failure messages; empty = allowed.
 */
export function evaluateRow(row, baseline, { gated }) {
  const errs = [];
  const where = `override "${row?.id ?? "<no id>"}"`;

  // ---- structural shape: enforced on EVERY row (legacy already conforms) ----
  if (!row || typeof row !== "object") return [`${where}: not an object`];
  if (!row.id || typeof row.id !== "string") errs.push(`${where}: missing/invalid id`);
  if (!(row.status in STATUS_RANK)) {
    errs.push(`${where}: status "${row.status}" is not one of ${Object.keys(STATUS_RANK).join(" | ")}`);
    return errs; // rank comparison below is meaningless without a valid status
  }
  if (typeof row.evidence !== "string" || !row.evidence.trim()) errs.push(`${where}: evidence must be a non-empty string`);
  if (!ISO_DATE.test(String(row.verified_on ?? ""))) errs.push(`${where}: verified_on must be YYYY-MM-DD`);

  // ---- live-evidence rule: FORWARD-ONLY (added/changed rows only) ----
  if (!gated) return errs;

  const newRank = STATUS_RANK[row.status];
  const oldRank = baseline && baseline.status in STATUS_RANK ? STATUS_RANK[baseline.status] : null;
  const isUpgrade = oldRank === null ? newRank === STATUS_RANK.DONE : newRank > oldRank;

  // Downgrade or lateral move → always allowed. It cannot manufacture green.
  if (!isUpgrade) return errs;

  const evidence = String(row.evidence ?? "");
  if (CODE_PRESENCE_ONLY.test(evidence)) {
    errs.push(
      `${where}: upgrades to "${row.status}" MUST NOT rest on code-presence evidence ` +
        `("${evidence.match(CODE_PRESENCE_ONLY)[0]}"). File presence is what manufactures fake DONEs — ` +
        `cite a live prod/DB observation instead.`
    );
  } else if (!LIVE_PROOF.test(evidence)) {
    errs.push(
      `${where}: upgrading to "${row.status}" requires LIVE evidence (prod/DB/deploy observation, row count, ` +
        `or tie-out). Got: "${evidence.slice(0, 90)}". Downgrades need no proof; upgrades do.`
    );
  }
  if (evidence.trim().length < 40) {
    errs.push(`${where}: upgrade evidence is too thin (${evidence.trim().length} chars) — record what was actually observed.`);
  }
  return errs;
}

function tryGit(args) {
  try { return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return null; }
}

function baselineRows() {
  const raw = tryGit(`show origin/main:${REL}`);
  if (raw === null) return null; // no history → degrade to shape-only
  try {
    const parsed = JSON.parse(raw);
    const map = new Map();
    for (const r of parsed.overrides || []) map.set(String(r.id).toUpperCase(), r);
    return map;
  } catch { return null; }
}

function run() {
  const abs = path.join(ROOT, REL);
  if (!fs.existsSync(abs)) {
    console.log(`verify:block-status-overrides-downgrade-only — SKIP (${REL} not present)`);
    return [];
  }
  let doc;
  try { doc = JSON.parse(fs.readFileSync(abs, "utf8")); }
  catch (e) { return [`${REL}: invalid JSON — ${e.message}`]; }

  const rows = Array.isArray(doc.overrides) ? doc.overrides : null;
  if (!rows) return [`${REL}: missing "overrides" array`];

  const base = baselineRows();
  const failures = [];
  let gatedCount = 0;

  for (const row of rows) {
    const key = String(row?.id ?? "").toUpperCase();
    const prior = base ? base.get(key) : undefined;
    // gated = this row is NEW or its status CHANGED vs origin/main. If we have no
    // baseline at all, gate nothing (shape-only) rather than false-fail everything.
    const gated = base !== null && (prior === undefined || prior.status !== row?.status);
    if (gated) gatedCount++;
    failures.push(...evaluateRow(row, prior, { gated }));
  }

  if (!failures.length) {
    console.log(
      `verify:block-status-overrides-downgrade-only — PASS (${rows.length} rows; ` +
        `${base === null ? "no baseline → shape-only" : `${gatedCount} added/changed row(s) gated`})`
    );
  }
  return failures;
}

// ------------------------------------------------------------------ selftest --
if (process.argv.includes("--selftest")) {
  const D = "2026-07-20";
  const live = "verified live on prod Neon: 3 rows returned for TRANSP, tie-out to the cent";
  const codeish = "all 4 file(s) on main";
  const checks = [
    // downgrades and lateral moves are always allowed
    ["downgrade DONE→NEEDS-VERIFY allowed with weak evidence",
      evaluateRow({ id: "A", status: "NEEDS-VERIFY", evidence: "not a verdict — awaiting GUARD", verified_on: D }, { status: "DONE" }, { gated: true }).length === 0],
    ["lateral NEEDS-VERIFY→NEEDS-VERIFY allowed",
      evaluateRow({ id: "A", status: "NEEDS-VERIFY", evidence: "still unverified", verified_on: D }, { status: "NEEDS-VERIFY" }, { gated: true }).length === 0],
    // upgrades require live evidence
    ["upgrade to DONE with live evidence allowed",
      evaluateRow({ id: "A", status: "DONE", evidence: live, verified_on: D }, { status: "NEEDS-VERIFY" }, { gated: true }).length === 0],
    ["upgrade to DONE with NO live evidence REJECTED",
      evaluateRow({ id: "A", status: "DONE", evidence: "looks built, seems fine to me honestly", verified_on: D }, { status: "NEEDS-VERIFY" }, { gated: true }).length > 0],
    ["upgrade to DONE on CODE-PRESENCE evidence REJECTED",
      evaluateRow({ id: "A", status: "DONE", evidence: codeish, verified_on: D }, { status: "NEEDS-VERIFY" }, { gated: true }).length > 0],
    // REGRESSION PIN (2026-07-20): the reconciler's real evidence uses literal parens,
    // "all 4 file(s) on main". A naive /files? on main/ misses it. These two cases exist so a
    // future regex "cleanup" cannot silently reopen the code-presence loophole.
    ["code-presence with LITERAL parens 'file(s) on main' REJECTED",
      evaluateRow({ id: "A", status: "DONE", evidence: "all 4 file(s) on main, looks complete to me", verified_on: D }, { status: "NEEDS-VERIFY" }, { gated: true }).length > 0],
    ["code-presence REJECTED even when live-proof words are ALSO present",
      evaluateRow({ id: "A", status: "DONE", evidence: "verified live on prod Neon; all 4 file(s) on main so it is done", verified_on: D }, { status: "NEEDS-VERIFY" }, { gated: true }).length > 0],
    ["named artifact(s) on main REJECTED",
      evaluateRow({ id: "A", status: "DONE", evidence: "all 3 named artifact(s) on main, tie-out looks right", verified_on: D }, { status: "NEEDS-VERIFY" }, { gated: true }).length > 0],
    ["upgrade to DONE on title-match REJECTED",
      evaluateRow({ id: "A", status: "DONE", evidence: "PR #2521 title-match only", verified_on: D }, { status: "NEEDS-VERIFY" }, { gated: true }).length > 0],
    ["BRAND-NEW row straight to DONE without live evidence REJECTED",
      evaluateRow({ id: "A", status: "DONE", evidence: "done", verified_on: D }, undefined, { gated: true }).length > 0],
    ["brand-new row to NEEDS-VERIFY allowed (not an upgrade to DONE)",
      evaluateRow({ id: "A", status: "NEEDS-VERIFY", evidence: "awaiting verification", verified_on: D }, undefined, { gated: true }).length === 0],
    ["upgrade PENDING→NEEDS-VERIFY still needs live evidence",
      evaluateRow({ id: "A", status: "NEEDS-VERIFY", evidence: "hunch", verified_on: D }, { status: "PENDING" }, { gated: true }).length > 0],
    ["thin live-ish evidence REJECTED (under 40 chars)",
      evaluateRow({ id: "A", status: "DONE", evidence: "prod ok", verified_on: D }, { status: "PENDING" }, { gated: true }).length > 0],
    // shape, enforced regardless of gating
    ["invalid status REJECTED", evaluateRow({ id: "A", status: "SHIPPED", evidence: live, verified_on: D }, undefined, { gated: false }).length > 0],
    ["missing verified_on REJECTED", evaluateRow({ id: "A", status: "DONE", evidence: live }, undefined, { gated: false }).length > 0],
    ["empty evidence REJECTED", evaluateRow({ id: "A", status: "DONE", evidence: "  ", verified_on: D }, undefined, { gated: false }).length > 0],
    ["bad date format REJECTED", evaluateRow({ id: "A", status: "DONE", evidence: live, verified_on: "07/20/2026" }, undefined, { gated: false }).length > 0],
    // ungated legacy rows are not subjected to the live-evidence rule
    ["legacy DONE row (ungated) passes on code-presence evidence",
      evaluateRow({ id: "A", status: "DONE", evidence: codeish, verified_on: D }, { status: "DONE" }, { gated: false }).length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:block-status-overrides-downgrade-only --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:block-status-overrides-downgrade-only --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const failures = run();
  if (failures.length) {
    console.error("verify:block-status-overrides-downgrade-only FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    console.error(
      "\n  Downgrades never need proof. An UPGRADE toward DONE does — cite a live prod/DB observation,\n" +
        "  never file presence. This guard exists because file-presence classification manufactured\n" +
        "  fake DONEs on financial blocks (2026-07-20)."
    );
    process.exit(1);
  }
}
