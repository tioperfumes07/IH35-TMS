import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * USMCA cross-entity-leak guard (ratchet).
 *
 * RLS on mdata.* is role-scoped, NOT entity-scoped, so a SQL query that reads/writes one of the
 * carrier-partitioned tables without an entity predicate blends rows across operating companies
 * (TRANSP / TRK / USMCA). This guard scans every backend SQL template literal that references one of
 * the target tables and flags any literal that lacks an entity predicate
 * (operating_company_id / owner_company_id / currently_leased_to_company_id).
 *
 * It is a RATCHET: the current set of legitimately-unscoped literals (globals, INSERTs, self-by-
 * identity reads, and queries scoped indirectly via a parent join in a different literal) is frozen
 * in the checked-in baseline. The guard FAILS only when a NEW unscoped literal appears — including
 * when a previously-scoped query is reverted to drop its predicate (its hash changes and is no longer
 * in the baseline). Regenerate the baseline intentionally with UPDATE_ENTITY_SCOPE_BASELINE=1.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "apps/backend/src");
const BASELINE = path.join(__dirname, "84-verify-mdata-entity-scope.baseline.json");

// FROM/JOIN of a carrier-partitioned table. catalogs.{accounts,classes} are financial (entity-keyed)
// and protected here too even though this PR does not edit them.
const TARGET_RE =
  /\b(?:FROM|JOIN)\s+(mdata\.(?:loads|drivers|customers|units|equipment)|catalogs\.(?:accounts|classes))\b/i;
// An entity predicate = a scope column used in a comparison/IN (not merely selected).
const PREDICATE_RE =
  /\b(operating_company_id|owner_company_id|currently_leased_to_company_id)\b\s*(?:::[a-z_]+)?\s*(=|<>|!=|>=|<=|>|<|IN\b)/i;
// DISP-F01 — the lease-aware form. mdata.units is scoped by a PAIR of columns, so the correct
// predicate for a unit is COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2 — a
// TRK-owned unit leased to TRANSP must be visible to TRANSP, and no single-column comparison can
// express that. The regex above requires the column to be followed immediately by an operator, so a
// closing paren defeated it and this properly-scoped query was reported as UNSCOPED.
//
// This is a false-NEGATIVE fix, not a loosening: the alternative below still demands a real
// comparison against the COALESCE result, so merely SELECTing the columns does not satisfy it. The
// wrong resolution here would have been UPDATE_ENTITY_SCOPE_BASELINE=1, which freezes a scoped query
// into the accepted-unscoped list and quietly spends the ratchet on a query that never needed it.
function hasEntityPredicate(text) {
  return PREDICATE_RE.test(text) || COALESCE_PREDICATE_RE.test(text);
}

const COALESCE_PREDICATE_RE =
  /COALESCE\s*\([^()]*\b(operating_company_id|owner_company_id|currently_leased_to_company_id)\b[^()]*\)\s*(?:::[a-z_]+)?\s*(=|<>|!=|>=|<=|>|<|IN\b)/i;

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) acc.push(p);
  }
  return acc;
}

function extractTemplateLiterals(src) {
  // Backtick-delimited template strings (handles escaped backticks). Good enough for our SQL literals.
  const out = [];
  const re = /`(?:[^`\\]|\\.)*`/gs;
  let m;
  while ((m = re.exec(src))) out.push(m[0]);
  return out;
}

function normalize(lit) {
  return lit.replace(/\s+/g, " ").trim();
}

/** @returns {Map<string, {file: string, preview: string}>} key = `relfile#sha1` */
function collectUnscopedLiterals() {
  const found = new Map();
  for (const file of walk(SRC).sort()) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, "utf8");
    for (const lit of extractTemplateLiterals(src)) {
      if (!TARGET_RE.test(lit)) continue;
      if (hasEntityPredicate(lit)) continue;
      const norm = normalize(lit);
      const hash = crypto.createHash("sha1").update(norm).digest("hex");
      const key = `${rel}#${hash}`;
      if (!found.has(key)) {
        found.set(key, { file: rel, preview: norm.slice(0, 120) });
      }
    }
  }
  return found;
}

/**
 * ROUND 441.13 (Lead) — an exception is a cross-tenant surface, the most expensive defect class we have, so it must
 * SAY WHY. A baseline entry may carry `reason`: ONE line (no newline), at least 20 characters, naming why the read is
 * safe (scoped through a named CTE/helper, an id validated in the same request, a deliberately global system job...).
 * Entries WITHOUT a reason are legacy debt: at most UNREASONED_CEILING of them, and the ceiling only goes DOWN — lower
 * it in the same PR that gives an old entry its reason or removes it. A NEW exception without a reason therefore fails.
 * (From closed #25752; main had 114 when this landed, 113 after the feed-gate entry got its reason.)
 */
export const UNREASONED_CEILING = 113;
export const REASON_MIN_CHARS = 20;

export function reasonProblem(entry) {
  if (entry.reason === undefined) return null; // unreasoned (counted against the ceiling)
  const r = String(entry.reason);
  if (/\n/.test(r)) return `${entry.key}: reason must be ONE line`;
  if (r.trim().length < REASON_MIN_CHARS) return `${entry.key}: reason must say why (>= ${REASON_MIN_CHARS} chars)`;
  return null;
}

export function checkReasons(entries) {
  const problems = entries.map(reasonProblem).filter(Boolean);
  const unreasoned = entries.filter((e) => e.reason === undefined).length;
  if (unreasoned > UNREASONED_CEILING) {
    problems.push(
      `${unreasoned} baseline entries have no written reason (ceiling ${UNREASONED_CEILING}, shrink-only) — every NEW exception needs a one-line "reason" in ${path.basename(BASELINE)}`
    );
  }
  return { problems, unreasoned };
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  return JSON.parse(fs.readFileSync(BASELINE, "utf8"));
}

function writeBaseline(found) {
  // Regenerating keeps every existing reason (by key) — a reason is never silently dropped.
  const prior = new Map((loadBaseline()?.entries ?? []).map((e) => [e.key, e.reason]));
  const entries = [...found.entries()]
    .map(([key, v]) => (prior.get(key) !== undefined ? { key, file: v.file, preview: v.preview, reason: prior.get(key) } : { key, file: v.file, preview: v.preview }))
    .sort((a, b) => a.key.localeCompare(b.key));
  fs.writeFileSync(BASELINE, JSON.stringify({ entries }, null, 2) + "\n", "utf8");
  return entries.length;
}

function runGuard() {
  const found = collectUnscopedLiterals();

  if (process.env.UPDATE_ENTITY_SCOPE_BASELINE === "1") {
    const n = writeBaseline(found);
    console.log(`verify-mdata-entity-scope: wrote baseline with ${n} allowlisted unscoped literals.`);
    return;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.error(
      "verify-mdata-entity-scope FAILED — missing baseline. Generate it with UPDATE_ENTITY_SCOPE_BASELINE=1."
    );
    process.exit(1);
  }
  const allow = new Set(baseline.entries.map((e) => e.key));

  const violations = [];
  for (const [key, v] of found.entries()) {
    if (!allow.has(key)) violations.push(v);
  }

  if (violations.length > 0) {
    console.error(
      "verify-mdata-entity-scope FAILED — new/changed SQL on mdata.{loads,drivers,customers,units,equipment} or catalogs.{accounts,classes} lacks an entity predicate (operating_company_id / owner_company_id / currently_leased_to_company_id):"
    );
    for (const v of violations) {
      console.error(`  - ${v.file}\n      ${v.preview}`);
    }
    console.error(
      "Scope the query (see apps/backend/src/auth/operating-company-scope.ts resolveOperatingCompanyId, or the owner/leased pair for mdata.units/equipment). If the query is legitimately global, regenerate the baseline with UPDATE_ENTITY_SCOPE_BASELINE=1 and justify it in the PR."
    );
    process.exit(1);
  }

  const { problems: reasonProblems, unreasoned } = checkReasons(baseline.entries);
  if (reasonProblems.length > 0) {
    console.error(`verify-mdata-entity-scope FAILED — exceptions must carry a written reason:\n  - ${reasonProblems.join("\n  - ")}`);
    process.exit(1);
  }
  if (unreasoned < UNREASONED_CEILING) {
    console.log(`verify-mdata-entity-scope: ${unreasoned} unreasoned entries < ceiling ${UNREASONED_CEILING} — lower UNREASONED_CEILING to ${unreasoned} (shrink-only).`);
  }

  // Stale baseline entries (code removed) are reported but not fatal, so deletions don't break CI.
  const stale = baseline.entries.filter((e) => !found.has(e.key));
  if (stale.length > 0) {
    console.log(`verify-mdata-entity-scope: ${stale.length} stale baseline entr${stale.length === 1 ? "y" : "ies"} (code removed/rescoped) — consider regenerating.`);
  }

  console.log(
    `verify-mdata-entity-scope OK — ${found.size} unscoped literals, all allowlisted (${allow.size} baseline entries).`
  );
}

export default {
  name: "verify-mdata-entity-scope",
  run: () => runGuard(),
};

// Allow direct execution: `node scripts/verify-steps/84-verify-mdata-entity-scope.mjs`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) {
    const base = Array.from({ length: UNREASONED_CEILING }, (_, i) => ({ key: `k${i}` }));
    const cases = [
      ["at the ceiling, no reasons", base, true],
      ["one new exception without a reason", [...base, { key: "new" }], false],
      ["one new exception WITH a reason", [...base, { key: "new", reason: "loads come from the company-scoped CTE above" }], true],
      ["a two-line reason", [...base, { key: "new", reason: "line one is long enough\nline two" }], false],
      ["a reason that says nothing", [...base, { key: "new", reason: "ok" }], false],
    ];
    let bad = 0;
    for (const [name, entries, wantOk] of cases) {
      const ok = checkReasons(entries).problems.length === 0;
      if (ok !== wantOk) { console.error(`selftest FAIL: ${name}`); bad++; }
    }
    if (bad) process.exit(1);
    console.log(`verify-mdata-entity-scope --selftest PASS ${cases.length}/${cases.length}`);
  } else {
    runGuard();
  }
}
