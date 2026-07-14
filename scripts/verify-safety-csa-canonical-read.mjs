#!/usr/bin/env node
/**
 * SAFETY-CSA-PHANTOM guard — the Safety dashboard CSA widget always showed 0/blank because two reads
 * in apps/backend/src/safety/safety.routes.ts queried a phantom table that does not exist in the
 * migrated schema:
 *   1. GET /api/v1/safety/dashboard/kpis  read  SELECT COALESCE(score_total, 0) FROM safety.csa_scores_cache
 *                                               ... ORDER BY cached_at DESC  (every row .catch()'d to 0).
 *   2. GET /api/v1/safety/csa/latest      read  SELECT * FROM safety.csa_scores_cache ORDER BY cached_at DESC.
 *
 * The REAL table is safety.csa_scores (migration 0051_p3_t11_17_2_safety_v6_4_schema.sql). It has NO
 * score_total aggregate and NO cached_at column. Its real columns are computed_at (TIMESTAMPTZ) plus
 * per-BASIC numerics (basic_unsafe_driving, basic_hos_compliance, basic_driver_fitness,
 * basic_controlled_substances, basic_vehicle_maintenance, basic_hazmat, basic_crash_indicator) and
 * totals (total_inspections, total_violations, total_oos). The working sibling that already reads this
 * table correctly is apps/backend/src/routes/safety/csa-scores.ts (SELECT * ... ORDER BY period_end;
 * computeAndUpsertScore sums per-BASIC points). The KPI scalar is now the sum of the per-BASIC columns
 * (basic_hazmat excluded — migration CHECK forces it NULL); /csa/latest exposes the per-BASIC row.
 *
 * This guard FAILS the build if the phantom table safety.csa_scores_cache, or the phantom columns
 * score_total / cached_at, reappear in safety.routes.ts, and asserts the canonical table
 * safety.csa_scores + computed_at ordering are present. Comments are stripped before scanning so this
 * doc block does not trip it.
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-csa-canonical-read";

const SAFETY_ROUTES = "apps/backend/src/safety/safety.routes.ts";

/** Strip block + line comments so intentional documentation of the fix does not trip the guard. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1);
}

/**
 * @param {{ routes: string }} sources — raw file contents.
 * @returns {string[]} failures (empty = pass).
 */
export function assertGuard({ routes }) {
  const errs = [];
  const r = stripComments(routes);

  // ── Phantom table + phantom columns must never reappear ──
  if (/safety\.csa_scores_cache\b/.test(r))
    errs.push(`${SAFETY_ROUTES}: phantom table safety.csa_scores_cache (real: safety.csa_scores, migration 0051)`);
  if (/\bscore_total\b/.test(r))
    errs.push(`${SAFETY_ROUTES}: phantom column score_total (safety.csa_scores has NO aggregate; sum the per-BASIC columns)`);
  if (/\bcached_at\b/.test(r))
    errs.push(`${SAFETY_ROUTES}: phantom column cached_at (safety.csa_scores orders by computed_at)`);

  // ── Canonical table + ordering must be present ──
  if (!/\bsafety\.csa_scores\b/.test(r))
    errs.push(`${SAFETY_ROUTES}: must read FROM safety.csa_scores (the real CSA table, migration 0051)`);
  if (!/computed_at\b/.test(r))
    errs.push(`${SAFETY_ROUTES}: must order the latest CSA read by computed_at (safety.csa_scores has no cached_at)`);

  return errs;
}

function selftest() {
  const goodRoutes = `
    const csaRes = await client.query(\`
      SELECT (COALESCE(basic_unsafe_driving, 0) + COALESCE(basic_crash_indicator, 0))::numeric AS score
      FROM safety.csa_scores WHERE operating_company_id = $1 ORDER BY computed_at DESC LIMIT 1\`, [companyId]);
    const latest = await client.query(\`
      SELECT * FROM safety.csa_scores WHERE operating_company_id = $1 ORDER BY computed_at DESC LIMIT 1\`, [id]);
  `;

  const cases = [
    { n: "canonical safety.csa_scores + computed_at → 0", in: { routes: goodRoutes }, want: 0 },
    { n: "phantom safety.csa_scores_cache → flag", in: { routes: goodRoutes.replace(/safety\.csa_scores/g, "safety.csa_scores_cache") }, min: 1 },
    { n: "phantom column score_total → flag", in: { routes: goodRoutes.replace("AS score", "score_total AS score") }, min: 1 },
    { n: "phantom column cached_at → flag", in: { routes: goodRoutes.replace(/computed_at/g, "cached_at") }, min: 1 },
    { n: "canonical table dropped entirely → flag", in: { routes: "SELECT 1" }, min: 1 },
  ];
  let f = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) f++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (f) { console.error(`\n${LABEL} SELFTEST FAILED: ${f}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const routesPath = path.join(ROOT, SAFETY_ROUTES);
if (!fs.existsSync(routesPath)) { console.error(`[${LABEL}] FAILED — missing ${SAFETY_ROUTES}`); process.exit(1); }
const errs = assertGuard({ routes: fs.readFileSync(routesPath, "utf8") });
if (errs.length) { console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`); for (const e of errs) console.error(`  ✗ ${e}`); process.exit(1); }
console.log(`[${LABEL}] OK — safety.routes.ts reads the canonical safety.csa_scores (computed_at + per-BASIC columns), not the phantom csa_scores_cache.`);
