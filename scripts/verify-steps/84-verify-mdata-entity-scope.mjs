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
      if (PREDICATE_RE.test(lit)) continue;
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
  const entries = [...found.entries()]
    .map(([key, v]) => ({ key, file: v.file, preview: v.preview }))
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
  runGuard();
}
