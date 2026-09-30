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
  //
  // FIX (2026-09-30, CC-3): the header comment above says "in the same statement as
  // `mdata.loads`" but the original implementation approximated "same statement" with a blind
  // ±40-line window, which produces two real false-positive classes, both confirmed live on
  // apps/backend/src/dispatch/manual-delivery-authorization.routes.ts:
  //   (1) an EARLIER, unrelated, already-closed SQL template happens to mention mdata.loads
  //       within 40 lines of a LATER, separate query's status gate on a different table
  //       (there: `mdata.load_stops` status, not `mdata.loads` status).
  //   (2) the SAME query joins mdata.loads but the status gate is on a DIFFERENT table's
  //       alias (there: `i.status` on an invoices join, not the `l` alias bound to mdata.loads).
  // Both are fixed below by (a) scoping the proximity check to the nearest enclosing
  // backtick-delimited template literal (the actual SQL statement) instead of a blind line
  // window, falling back to the old window when no enclosing template is found, and (b) when
  // the status token carries an alias prefix, resolving that alias via the statement's own
  // FROM/JOIN clauses and skipping when it resolves to a table other than mdata.loads.
  const lines = src.split("\n");
  const lineStartOffsets = [];
  {
    let offset = 0;
    for (const line of lines) {
      lineStartOffsets.push(offset);
      offset += line.length + 1;
    }
  }
  function enclosingTemplateLiteral(offset) {
    const start = src.lastIndexOf("`", offset);
    const end = src.indexOf("`", offset);
    if (start === -1 || end === -1 || start > offset) return null;
    return { start, end };
  }
  function resolveAlias(statement, alias) {
    const re = new RegExp(`\\b(?:FROM|JOIN)\\s+([a-z_][a-z0-9_.]*)\\s+(?:AS\\s+)?${alias}\\b`, "i");
    const found = statement.match(re);
    return found ? found[1] : null;
  }
  const inlineGateRe = /(?:([a-z_][a-z0-9_]*)\.)?status(?:::text)?\s*(?:NOT\s+IN\s*\(|<>\s*')/i;
  for (let i = 0; i < lines.length; i++) {
    const gateMatch = lines[i].match(inlineGateRe);
    if (!gateMatch) continue;
    const alias = gateMatch[1] || null;
    const lineOffset = lineStartOffsets[i];
    const enclosing = enclosingTemplateLiteral(lineOffset);
    let statement;
    if (enclosing) {
      statement = src.slice(enclosing.start, enclosing.end);
    } else {
      const windowStart = Math.max(0, i - 40);
      const windowEnd = Math.min(lines.length, i + 5);
      statement = lines.slice(windowStart, windowEnd).join("\n");
    }
    if (!/mdata\.loads\b/.test(statement)) continue;
    if (alias) {
      const resolvedTable = resolveAlias(statement, alias);
      if (resolvedTable && !/mdata\.loads/i.test(resolvedTable)) continue;
    }
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
  // TRUCKLINE-16 (Lead, 2026-09-30): the second, permanent, money-free predicate — see rules (d)/(e) below.
  const usesDispatchWork = /\bcanonicalDispatchWorkWhereClause\s*\(|\bcanonicalDispatchWorkStatusClause\s*\(|\bDISPATCH_WORK_LOAD_STATUSES\b/.test(src);
  if (usesStatusHalf && !usesMoneyHalf) {
    violations.push(
      `uses the canonical STATUS half (condition 1) without the MONEY half (condition 2, ` +
        `canonicalActiveLoadNotFinishedByMoneyCte) — status alone, or status + invoice-only, ` +
        `overcounts on this data (confirmed live: 33 -> the real 9). Use ` +
        `canonicalActiveLoadWhereClause(...) for the complete predicate.`
    );
  }

  // (d)/(e) TRUCKLINE-16 (Lead, 2026-09-30): two deliberately different, permanent predicates now
  // exist — ACCOUNTING ("is this load open on the books," money-aware) and DISPATCH WORK ("is a
  // unit carrying this load right now," no money test). A file importing BOTH is exactly the
  // "one definition answering two questions" bug TRUCKLINE-16 fixed, reintroduced from the other
  // direction — fails closed rather than trusting a human to notice the mismatch.
  if (usesMoneyHalf && usesDispatchWork) {
    violations.push(
      `imports BOTH the accounting predicate (canonicalActiveLoadWhereClause/` +
        `canonicalActiveLoadNotFinishedByMoneyCte) and the dispatch-work predicate ` +
        `(canonicalDispatchWorkWhereClause/canonicalDispatchWorkStatusClause) — these answer two ` +
        `different questions (books vs. operations) and must never be mixed in one file. If this ` +
        `file genuinely needs both answers for two genuinely different features, split it.`
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
  // Built via real template-literal interpolation (never a literal backslash-dollar in source) so
  // these fixtures' embedded `${...}` text can't be misread as a regex escape sequence by static
  // analysis (CodeQL js/useless-regexp-character-escape false-fired on the escaped form, backslash
  // immediately followed by dollar-brace, used to represent a nested SQL template literal inside
  // these JS string fixtures).
  const DOLLAR = "$";

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
    const q = \`SELECT * FROM mdata.loads l WHERE ${DOLLAR}{canonicalActiveLoadStatusClause("l")}\`;
  `;
  checks.push(["ROUND 32.2-CORRECTED: status-half-only file -> RED, at least 1 violation", findViolations("dispatch/status-only.ts", statusOnlySrc).length >= 1]);

  const bothHalvesSrc = `
    import { canonicalActiveLoadWhereClause } from "./canonical-active-load-set.js";
    const q = \`SELECT * FROM mdata.loads l WHERE ${DOLLAR}{canonicalActiveLoadWhereClause("l")}\`;
  `;
  checks.push(["file using the complete predicate (both halves) -> 0 violations", findViolations("dispatch/both-halves.ts", bothHalvesSrc).length === 0]);

  const dispatchWorkOnlySrc = `
    import { canonicalDispatchWorkWhereClause } from "./canonical-active-load-set.js";
    const q = \`SELECT * FROM mdata.loads l WHERE ${DOLLAR}{canonicalDispatchWorkWhereClause("l", "$1::uuid")}\`;
  `;
  checks.push(["TRUCKLINE-16: dispatch-work-only file -> 0 violations (no money test required)", findViolations("dispatch/work-only.ts", dispatchWorkOnlySrc).length === 0]);

  // 2026-09-30 (CC-3): confirmed live false-positive classes on
  // manual-delivery-authorization.routes.ts -- a status gate on a DIFFERENT table, in a
  // statement/nearby statement that also happens to mention mdata.loads, must not fire.
  const unrelatedEarlierQuerySrc = `
    const loadRes = await client.query(\`
      SELECT id::text FROM mdata.loads WHERE id = $1::uuid
    \`, [id]);
    const stopRes = await client.query(\`
      SELECT id::text FROM mdata.load_stops
      WHERE load_id = $1::uuid
        AND status::text <> 'cancelled'
        AND soft_deleted_at IS NULL
    \`, [id]);
  `;
  checks.push([
    "false-positive: unaliased status gate on a DIFFERENT table in an EARLIER, separate query -> 0 violations",
    findViolations("dispatch/unrelated-earlier-query.ts", unrelatedEarlierQuerySrc).length === 0,
  ]);

  const differentAliasSameQuerySrc = `
    const res = await client.query(\`
      SELECT i.id
      FROM accounting.invoices i
      JOIN mdata.loads l ON l.id = i.source_load_id
      WHERE i.status NOT IN ('draft', 'proforma', 'void')
    \`, [id]);
  `;
  checks.push([
    "false-positive: aliased status gate on a DIFFERENT table joined in the SAME query as mdata.loads -> 0 violations",
    findViolations("dispatch/different-alias-same-query.ts", differentAliasSameQuerySrc).length === 0,
  ]);

  const aliasedLoadsStatusSrc = `
    const q = \`
      SELECT l.id FROM mdata.loads l
      WHERE l.status NOT IN ('draft', 'cancelled')
    \`;
  `;
  checks.push([
    "true-positive still caught: aliased status gate on mdata.loads itself -> RED, at least 1 violation",
    findViolations("dispatch/aliased-loads-status.ts", aliasedLoadsStatusSrc).length >= 1,
  ]);

  const mixedPredicatesSrc = `
    import { canonicalActiveLoadWhereClause, canonicalDispatchWorkWhereClause } from "./canonical-active-load-set.js";
    const accountingQ = \`SELECT * FROM mdata.loads l WHERE ${DOLLAR}{canonicalActiveLoadWhereClause("l")}\`;
    const dispatchQ = \`SELECT * FROM mdata.loads l WHERE ${DOLLAR}{canonicalDispatchWorkWhereClause("l", "$1::uuid")}\`;
  `;
  checks.push(["TRUCKLINE-16: file importing BOTH predicates -> RED, at least 1 violation", findViolations("dispatch/mixed.ts", mixedPredicatesSrc).length >= 1]);

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
