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

/**
 * ROUND 433 — SCOPED INDIRECTLY, and PROVEN. A literal can carry its entity predicate through an interpolated fragment
 * instead of inline text. That is accepted ONLY in two exact forms, each re-proven on every run (never a blanket "any
 * interpolation" pass — the same false-negative-not-loosening standard as the COALESCE form above):
 *
 *   1. A REGISTERED SCOPE HELPER — `${name(` for a function (or `${NAME}` for a constant) listed below, whose OWN body in
 *      its defining file still carries the predicate. A helper that loses its scope turns every caller red.
 *   2. A LOCAL SCOPE VARIABLE — `${ident}` / `${ident.join(" AND ")}` resolved to the nearest preceding declaration of
 *      `ident` in the SAME file: a string whose initializer carries a predicate (or a registered helper call), or an array
 *      whose first element does, or an array that receives such a value through an UNCONDITIONAL push (same indentation as
 *      the declaration). An array must be joined with " AND " — an OR-join can never scope.
 */
export const SCOPE_HELPERS = [
  { name: "loadAtTimeSql", file: "apps/backend/src/maintenance/driver-attribution.ts", body: "loadAtTimeSql", must: /\bl\.operating_company_id = \$1::uuid/ },
  { name: "driverAtTimeSql", file: "apps/backend/src/maintenance/driver-attribution.ts", body: "driverAtTimeSql", must: /\ba\.operating_company_id = \$1::uuid/ },
  { name: "fleetRosterSql", file: "apps/backend/src/mdata/fleet-visibility.ts", body: "fleetRosterBaseSql", must: /COALESCE\(\$\{c\("currently_leased_to_company_id"\)\}, \$\{c\("owner_company_id"\)\}\) = \$\{companyParam\}::uuid/ },
  { name: "fleetRosterUnclassifiedSql", file: "apps/backend/src/mdata/fleet-visibility.ts", body: "fleetRosterBaseSql", must: /COALESCE\(\$\{c\("currently_leased_to_company_id"\)\}, \$\{c\("owner_company_id"\)\}\) = \$\{companyParam\}::uuid/ },
  { name: "canonicalDispatchWorkWhereClause", file: "apps/backend/src/dispatch/canonical-active-load-set.ts", body: "canonicalDispatchWorkWhereClause", must: /\$\{alias\}\.operating_company_id = \$\{operatingCompanyIdParam\}/ },
  { name: "tenantFilter", file: "apps/backend/src/mdata/units-unified-list.service.ts", body: "tenantFilter", must: /\(owner_company_id = \$\$\{idx\} OR currently_leased_to_company_id = \$\$\{idx\}\)/ },
  { name: "buildLineWhere", file: "apps/backend/src/accounting/reclassify/reclassify.service.ts", body: "buildLineWhere", must: /`p\.operating_company_id = \$1::uuid`/ },
  { name: "FUEL_ROWS_WITH_STAMP_COUNT_SQL", file: "apps/backend/src/fuel/fuel-purchase-eligibility.ts", body: "FUEL_ROWS_WITH_STAMP_COUNT_SQL", must: /ft\.operating_company_id = \$1::uuid/ },
];

/** Text of a top-level function / const `name` in `src` (to the next top-level declaration). */
export function bodyOf(src, name) {
  const re = new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function\\s+${name}\\b|const\\s+${name}\\b)`, "m");
  const m = re.exec(src);
  if (!m) return "";
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\n(?:export\s+|async\s+|function\s+|const\s+|let\s+|type\s+|interface\s+)/);
  return src.slice(m.index, m.index + m[0].length + (next < 0 ? rest.length : next));
}

/** The registered helpers whose body still carries the predicate (proven against the given file reader). */
export function provenHelpers(readFile) {
  const ok = new Set();
  for (const h of SCOPE_HELPERS) {
    const src = readFile(h.file);
    if (src && h.must.test(bodyOf(src, h.body))) ok.add(h.name);
  }
  return ok;
}

function textCarriesScope(text, helpers) {
  if (hasEntityPredicate(text)) return true;
  for (const name of helpers) if (new RegExp(`\\b${name}\\b`).test(text)) return true;
  return false;
}

/** Is the identifier `ident`, as of `pos` in `src`, a scope-carrying local (rule 2)? `depth` bounds recursion. */
export function identCarriesScope(src, pos, ident, helpers, depth = 0) {
  if (depth > 3) return false;
  const before = src.slice(0, pos);
  const declRe = new RegExp(`^([ \\t]*)(?:const|let)\\s+${ident}\\b[^=\\n]*=\\s*`, "gm");
  let decl = null;
  for (let m; (m = declRe.exec(before)); ) decl = { index: m.index, indent: m[1], start: m.index + m[0].length };
  if (!decl) return false;
  const init = before.slice(decl.start).split(/;\s*\n/)[0];
  if (init.trimStart().startsWith("[")) {
    const firstEl = init.trimStart().slice(1).split(/,\s*(?=["'`]|[A-Za-z_])/)[0];
    if (textCarriesScope(firstEl, helpers)) return true;
    // an unconditional push (declaration's own indentation) of a scope-carrying value
    const pushRe = new RegExp(`^${decl.indent}${ident}\\.push\\(([^;]*?)\\);`, "gm");
    const region = before.slice(decl.index);
    for (let m; (m = pushRe.exec(region)); ) {
      const arg = m[1].trim();
      if (textCarriesScope(arg, helpers)) return true;
      if (/^[A-Za-z_$][\w$]*$/.test(arg) && identCarriesScope(src, decl.index + m.index, arg, helpers, depth + 1)) return true;
    }
    return false;
  }
  if (textCarriesScope(init, helpers)) return true;
  for (const m of init.matchAll(/\$\{([A-Za-z_$][\w$]*)(\.join\(\s*(["'])\s*AND\s*\3\s*\))?\}/g)) {
    if (identCarriesScope(src, decl.index, m[1], helpers, depth + 1)) return true;
  }
  return false;
}

/** Rule 1 + rule 2 for one literal at `pos` in `src`. */
export function scopedIndirectly(lit, src, pos, helpers) {
  for (const name of helpers) {
    if (new RegExp(`\\$\\{${name}(?:\\(|\\})`).test(lit)) return true;
  }
  for (const m of lit.matchAll(/\$\{([A-Za-z_$][\w$]*)(\.join\(\s*(["'])\s*AND\s*\3\s*\))?\}/g)) {
    if (identCarriesScope(src, pos, m[1], helpers)) return true;
  }
  return false;
}

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
  while ((m = re.exec(src))) out.push({ text: m[0], index: m.index });
  return out;
}

function normalize(lit) {
  return lit.replace(/\s+/g, " ").trim();
}

/** @returns {Map<string, {file: string, preview: string}>} key = `relfile#sha1` */
const readRel = (rel) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
};

function collectUnscopedLiterals() {
  const found = new Map();
  const helpers = provenHelpers(readRel);
  for (const file of walk(SRC).sort()) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, "utf8");
    for (const { text: lit, index } of extractTemplateLiterals(src)) {
      if (!TARGET_RE.test(lit)) continue;
      if (hasEntityPredicate(lit)) continue;
      if (scopedIndirectly(lit, src, index, helpers)) continue;
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

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  return JSON.parse(fs.readFileSync(BASELINE, "utf8"));
}

function writeBaseline(found) {
  // ROUND 433: a regenerate keeps every entry's written reason and the shrink-only ceiling.
  const prior = loadBaseline();
  const reasons = new Map((prior?.entries ?? []).filter((e) => e.reason).map((e) => [e.key, e.reason]));
  const entries = [...found.entries()]
    .map(([key, v]) => ({ key, file: v.file, preview: v.preview, ...(reasons.has(key) ? { reason: reasons.get(key) } : {}) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const unreasoned = entries.filter((e) => !e.reason).length;
  const ceiling = Math.min(prior?.unreasoned_ceiling ?? unreasoned, unreasoned);
  fs.writeFileSync(BASELINE, JSON.stringify({ unreasoned_ceiling: ceiling, entries }, null, 2) + "\n", "utf8");
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
  // ROUND 433: every baselined literal states WHY it is legitimately unscoped. Entries frozen before the reason field
  // existed are counted, and that count may only shrink — a new entry without a written reason fails the guard.
  const unreasoned = baseline.entries.filter((e) => !(typeof e.reason === "string" && e.reason.trim().length >= 20)).length;
  if (typeof baseline.unreasoned_ceiling !== "number" || unreasoned > baseline.unreasoned_ceiling) {
    console.error(
      `verify-mdata-entity-scope FAILED — ${unreasoned} baseline entries have no written reason (ceiling ${baseline.unreasoned_ceiling ?? "missing"}). ` +
        "A literal is baselined only with a per-literal 'reason' saying why it is legitimately unscoped."
    );
    process.exit(1);
  }

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
  run: () => {
    selftest();
    runGuard();
  },
};

/** ROUND 433 selftest: every way rule 1 / rule 2 could be wrongly satisfied must stay red. */
function selftest() {
  const realHelpers = provenHelpers(readRel);
  if (realHelpers.size !== SCOPE_HELPERS.length) {
    console.error(`verify-mdata-entity-scope --selftest FAILED — only ${realHelpers.size}/${SCOPE_HELPERS.length} registered helpers prove their predicate on this tree`);
    process.exit(1);
  }
  const lit = (src, needle) => {
    const i = src.indexOf(needle);
    const j = src.indexOf("`", i + 1);
    return { text: src.slice(i, j + 1), index: i };
  };
  const scoped = (src, needle, helpers = realHelpers) => {
    const l = lit(src, needle);
    return hasEntityPredicate(l.text) || scopedIndirectly(l.text, src, l.index, helpers);
  };
  const cases = [
    // [name, expectedScoped, src, needle, helpers?]
    ["inline unscoped read", false, "const r = q(`SELECT * FROM mdata.loads WHERE id = $1::uuid`);", "`SELECT"],
    ["inline scoped read", true, "const r = q(`SELECT * FROM mdata.loads WHERE id = $1 AND operating_company_id = $2`);", "`SELECT"],
    ["registered helper", true, "const r = q(`SELECT 1 FROM mdata.loads l WHERE ${canonicalDispatchWorkWhereClause(\"l\", \"$1\")}`);", "`SELECT"],
    ["helper that lost its predicate", false, "const r = q(`SELECT 1 FROM mdata.loads l WHERE ${canonicalDispatchWorkWhereClause(\"l\", \"$1\")}`);", "`SELECT", new Set()],
    ["array opening with the predicate", true, "  const filters = [\"l.operating_company_id = $1\"];\n  q(`SELECT 1 FROM mdata.loads l WHERE ${filters.join(\" AND \")}`);", "`SELECT"],
    ["array with no predicate", false, "  const filters = [\"l.status = $1\"];\n  q(`SELECT 1 FROM mdata.loads l WHERE ${filters.join(\" AND \")}`);", "`SELECT"],
    ["array OR-joined", false, "  const filters = [\"l.operating_company_id = $1\"];\n  q(`SELECT 1 FROM mdata.loads l WHERE ${filters.join(\" OR \")}`);", "`SELECT"],
    ["unconditional push of the predicate", true, "  const filters = [];\n  filters.push(`l.operating_company_id = $1`);\n  q(`SELECT 1 FROM mdata.loads l WHERE ${filters.join(\" AND \")}`);", "`SELECT 1"],
    ["conditional push only", false, "  const filters = [];\n  if (x) {\n    filters.push(`l.operating_company_id = $1`);\n  }\n  q(`SELECT 1 FROM mdata.loads l WHERE ${filters.join(\" AND \")}`);", "`SELECT 1"],
    ["string var with the predicate", true, "  const where = `operating_company_id = $1 AND x`;\n  q(`SELECT 1 FROM mdata.customers WHERE ${where}`);", "`SELECT 1"],
    ["string var without the predicate", false, "  const where = `deactivated_at IS NULL`;\n  q(`SELECT 1 FROM mdata.customers WHERE ${where}`);", "`SELECT 1"],
    ["declared only AFTER the literal", false, "  q(`SELECT 1 FROM mdata.customers WHERE ${where}`);\n  const where = `operating_company_id = $1`;", "`SELECT 1"],
  ];
  let pass = 0;
  for (const [name, expected, src, needle, helpers] of cases) {
    const got = scoped(src, needle, helpers ?? realHelpers);
    if (got !== expected) {
      console.error(`verify-mdata-entity-scope --selftest FAILED — "${name}": expected ${expected ? "scoped" : "UNSCOPED"}, got ${got ? "scoped" : "UNSCOPED"}`);
      process.exit(1);
    }
    pass++;
  }
  console.log(`verify-mdata-entity-scope --selftest PASS ${pass}/${cases.length} (+ ${realHelpers.size}/${SCOPE_HELPERS.length} helpers prove their predicate)`);
}

// Allow direct execution: `node scripts/verify-steps/84-verify-mdata-entity-scope.mjs`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  else runGuard();
}
