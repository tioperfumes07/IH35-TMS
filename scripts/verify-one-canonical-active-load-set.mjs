#!/usr/bin/env node
// ROUND 31.2 (Lead ruling, 2026-09-23, docs/bus/09-23-2026-LEAD-RULING-LOAD-ACTIVE-SET-NO-
// CANONICAL-DEFINITION.md): TEN places independently declared their own "active load" status
// list, returning FIVE different counts against the same 126 live USMCA loads. The canonical
// definition now lives in ONE module:
// apps/backend/src/dispatch/canonical-active-load-set.ts. This guard is the backstop: it fails
// any OTHER file that (a) inlines a `status NOT IN (...)` / `status <> '...'` gate shaped like a
// load-status filter in the same statement as `mdata.loads`, or (b) declares its own array of
// load-status-enum string literals without calling `assertCanonicalSubset` on it in the same
// file (the mechanism narrower named views — DISPATCH_ON_LOAD_STATUSES, the alert queue, the
// telematics "driver in the truck now" views — use to stay honest subsets rather than becoming
// an eleventh independent definition).
//
// SHRINK-ONLY FOUR-ARM RATCHET against scripts/verify-one-canonical-active-load-set.baseline.json,
// same shape as every other ratchet this session (verify-alwaystrack-parity.mjs,
// verify-fuel-transactions-per-load.mjs):
//   not in baseline, violating                    -> FAIL (new rot)
//   baseline entry got WORSE (more violations)     -> FAIL (debt grew)
//   baseline entry unchanged or better             -> PASS, printed as known debt, never silent
//   baseline entry now CLEAN (file fixed)          -> FAIL "remove me from the baseline"
// Migrating a baselined file to the canonical module and removing it from this baseline is
// welcome any time — that is the shrink half of shrink-only.
//
// Static, no DATABASE_URL needed — pure source-text scan, never reads money data.
export const ALLOW_OFFLINE_SKIP =
  "pure static source-text scan (which .ts files declare/inline a load-status gate) — never " +
  "connects to a database, so there is nothing to silently skip; ROUND 29.9-B's fail-closed law " +
  "governs live-money guards, not a codebase-shape scanner like this one.";
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-one-canonical-active-load-set";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC_DIR = path.join(ROOT, "apps/backend/src");
const CANONICAL_FILE = "dispatch/canonical-active-load-set.ts";
const BASELINE_PATH = path.join(ROOT, "scripts/verify-one-canonical-active-load-set.baseline.json");

// The 15-status canonical vocabulary (mirrors CANONICAL_ACTIVE_LOAD_STATUSES) — used to recognize
// "this array is a load-status list", not to re-derive the canonical decision itself.
const LOAD_STATUS_TOKENS = [
  "booked", "planned", "assigned", "unassigned", "assigned_not_dispatched", "dispatched",
  "at_pickup", "in_transit", "at_delivery", "delivered", "delivered_pending_docs",
  "completed_docs_received", "abandoned", "driver_walkoff", "driver_no_show",
];

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

function listTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Returns a list of violation reasons for one file's source text, or [] if clean.
 * Pure w.r.t. the filesystem read — testable directly against a string.
 */
export function findViolations(relPath, src) {
  if (relPath === CANONICAL_FILE) return [];
  const violations = [];

  // (a) an inline `status NOT IN (...)` / `status <> '...'` gate shaped like a load-status
  // filter, in a statement that also references mdata.loads. Scoped to a sliding window (40
  // lines) around each match so an unrelated status filter later in a long file doesn't false-
  // positive on a `mdata.loads` reference elsewhere in that same file.
  const lines = src.split("\n");
  const inlineGateRe = /status(?:::text)?\s*(?:NOT\s+IN\s*\(|<>\s*')/i;
  for (let i = 0; i < lines.length; i++) {
    if (!inlineGateRe.test(lines[i])) continue;
    const windowStart = Math.max(0, i - 40);
    const windowEnd = Math.min(lines.length, i + 5);
    const window = lines.slice(windowStart, windowEnd).join("\n");
    if (!/mdata\.loads\b/.test(window)) continue;
    // Only count it if the literal(s) on this line are load-status-shaped (draft/cancelled/
    // closed/invoiced/paid or any canonical token) — avoids matching an unrelated status column
    // that happens to share the word "status" near a `mdata.loads` join.
    const literalMatches = lines[i].match(/'([a-z_]+)'/g) || [];
    const looksLikeLoadStatus = literalMatches.some((lit) => {
      const token = lit.slice(1, -1);
      return token === "draft" || token === "cancelled" || token === "closed" || token === "invoiced" || token === "paid" || LOAD_STATUS_TOKENS.includes(token);
    });
    if (looksLikeLoadStatus) {
      violations.push(`line ${i + 1}: inline load-status gate outside the canonical module — "${lines[i].trim().slice(0, 160)}"`);
    }
  }

  // (b) a declared array of >=3 load-status-enum literals, not paired with assertCanonicalSubset
  // in the same file (narrower named views must call it; the canonical module itself is exempt
  // above).
  const arrayRe = /=\s*\[\s*((?:"[a-z_]+"|'[a-z_]+'|\s|,|\/\/[^\n]*\n)+)\]/g;
  let m;
  while ((m = arrayRe.exec(src))) {
    const literals = (m[1].match(/["']([a-z_]+)["']/g) || []).map((s) => s.slice(1, -1));
    const statusLiterals = literals.filter((l) => LOAD_STATUS_TOKENS.includes(l));
    if (statusLiterals.length >= 3 && !src.includes("assertCanonicalSubset")) {
      const lineNo = src.slice(0, m.index).split("\n").length;
      violations.push(`line ${lineNo}: declares a ${statusLiterals.length}-status load-status array without assertCanonicalSubset(...) — narrower views must prove they're a subset of CANONICAL_ACTIVE_LOAD_STATUSES`);
    }
  }

  // (c) ROUND 32.2-CORRECTED: a file using the canonical STATUS half (condition 1) without also
  // using the MONEY half (condition 2, canonicalActiveLoadNotFinishedByMoneyCte /
  // canonicalActiveLoadWhereClause, which already includes it) overcounts — confirmed live,
  // status-only or status+invoice-only both overcounted (33, then still wrong vs the real 9).
  const usesStatusHalf = /\bcanonicalActiveLoadStatusClause\s*\(|\bCANONICAL_ACTIVE_LOAD_STATUSES\b/.test(src);
  const usesMoneyHalf = /\bcanonicalActiveLoadNotFinishedByMoneyCte\s*\(|\bcanonicalActiveLoadWhereClause\s*\(/.test(src);
  if (usesStatusHalf && !usesMoneyHalf) {
    violations.push(
      `uses the canonical STATUS half (condition 1) without the MONEY half (condition 2, ` +
        `canonicalActiveLoadNotFinishedByMoneyCte) — status alone, or status + invoice-only, ` +
        `overcounts on this data (confirmed live: 33 -> the real 9). Use ` +
        `canonicalActiveLoadWhereClause(...) for the complete predicate.`
    );
  }

  return violations;
}

function scan() {
  const files = listTsFiles(SRC_DIR);
  const byFile = new Map();
  for (const abs of files) {
    const rel = path.relative(SRC_DIR, abs).replace(/\\/g, "/");
    const src = fs.readFileSync(abs, "utf8");
    const violations = findViolations(rel, src);
    if (violations.length > 0) byFile.set(rel, violations);
  }
  return byFile;
}

function run() {
  const found = scan();
  const baseline = loadBaseline();
  let failures = 0;

  if (!baseline) {
    if (found.size > 0) {
      console.error(`${LABEL}: FAIL — no baseline file and ${found.size} file(s) violate. Seed the baseline with a written reason, or fix them.`);
      for (const [f, vs] of found) for (const v of vs) console.error(`  ✗ ${f}: ${v}`);
      failures++;
    }
  } else {
    const baselineNames = new Set(Object.keys(baseline.files || {}));
    const foundNames = new Set(found.keys());

    for (const name of foundNames) {
      if (!baselineNames.has(name)) {
        console.error(`${LABEL}: FAIL — new rot, not in baseline: ${name}`);
        for (const v of found.get(name)) console.error(`  ✗ ${v}`);
        failures++;
      } else {
        const baselineCount = baseline.files[name].count;
        const liveCount = found.get(name).length;
        if (liveCount > baselineCount) {
          console.error(`${LABEL}: FAIL — ${name} got WORSE: baseline ${baselineCount} violation(s), live ${liveCount}`);
          failures++;
        } else {
          console.log(`${LABEL}: known debt — ${name}: ${liveCount} violation(s) (baseline ${baselineCount}, established ${baseline.established})`);
        }
      }
    }
    for (const name of baselineNames) {
      if (!foundNames.has(name)) {
        console.error(`${LABEL}: FAIL — ${name} is now CLEAN — remove it from ${path.basename(BASELINE_PATH)} (shrink the ratchet, don't leave stale debt on the books).`);
        failures++;
      }
    }
  }

  if (failures > 0) process.exit(1);
  console.log(`${LABEL}: PASS — ${found.size} known baselined file(s), 0 new violations.`);
}

function selftest() {
  const checks = [];

  const cleanSrc = `
    import { assertCanonicalSubset } from "./canonical-active-load-set.js";
    const NARROW = ["dispatched", "at_pickup", "in_transit"];
    assertCanonicalSubset("NARROW", NARROW);
  `;
  checks.push(["clean file (array + assertCanonicalSubset) -> 0 violations", findViolations("dispatch/clean.ts", cleanSrc).length === 0]);

  const dirtyArraySrc = `
    const ACTIVE_LOAD_STATUSES = ["dispatched", "at_pickup", "in_transit", "at_delivery"];
  `;
  checks.push(["dirty file (array, no assertCanonicalSubset) -> RED, at least 1 violation", findViolations("dispatch/dirty-array.ts", dirtyArraySrc).length >= 1]);

  const dirtyInlineSrc = `
    const q = \`
      SELECT * FROM mdata.loads l
       WHERE l.operating_company_id = $1
         AND l.status NOT IN ('draft', 'cancelled')
    \`;
  `;
  checks.push(["dirty file (inline status gate on mdata.loads) -> RED, at least 1 violation", findViolations("accounting/dirty-inline.ts", dirtyInlineSrc).length >= 1]);

  checks.push(["canonical module itself is exempt", findViolations(CANONICAL_FILE, dirtyInlineSrc).length === 0]);

  const statusOnlySrc = `
    import { canonicalActiveLoadStatusClause } from "./canonical-active-load-set.js";
    const q = \`SELECT * FROM mdata.loads l WHERE \${canonicalActiveLoadStatusClause("l")}\`;
  `;
  checks.push(["ROUND 32.2-CORRECTED: status-half-only file -> RED, at least 1 violation", findViolations("dispatch/status-only.ts", statusOnlySrc).length >= 1]);

  const bothHalvesSrc = `
    import { canonicalActiveLoadWhereClause } from "./canonical-active-load-set.js";
    const q = \`SELECT * FROM mdata.loads l WHERE \${canonicalActiveLoadWhereClause("l")}\`;
  `;
  checks.push(["file using the complete predicate (both halves) -> 0 violations", findViolations("dispatch/both-halves.ts", bothHalvesSrc).length === 0]);

  let bad = 0;
  for (const [name, ok] of checks) { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}`); }
  if (bad) { console.error(`\n${LABEL} SELFTEST FAILED: ${bad}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

const isDirectRun = process.argv[1] && new URL(import.meta.url).pathname === path.resolve(process.argv[1]);
if (isDirectRun) {
  if (process.argv.includes("--selftest")) selftest();
  else run();
}
