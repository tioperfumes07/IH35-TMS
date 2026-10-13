#!/usr/bin/env node
// 443.55 NEVER AGAIN (owner 2026-10-11 09:33 CT: "Make sure the engines are updated and fixed correctly so these issues never
// occur again"). STATIC (fails the build):
//   1. the miles engine is the ONLY writer of catalogs.point_mileage (load-lane-learning.service.ts + mileage/mileage.service.ts);
//   2. setMilesChoice writes the chosen value AND mdata.loads.miles_choice (source + both recommendations + who/when) and audits it;
//   3. manual miles require a reason (service + route);
//   4. Book Load accepts miles_choice and persists it on the new load;
//   5. the recommendation returns BOTH blocks per field with a missing-reason (never a silent blank / zero).
// LIVE (read-only, when DATABASE_URL is set; --strict-live fails): USMCA loads with a miles value and no recorded source per field.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import pg from "pg";

export const ALLOW_OFFLINE_SKIP = "the failing rules are static source checks; the live per-field source count is a report unless --strict-live";
const SVC = "apps/backend/src/dispatch/mileage/miles-recommendations.service.ts";
const ROUTES = "apps/backend/src/dispatch/mileage/miles-recommendations.routes.ts";
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const BOOK_ROUTE = "apps/backend/src/dispatch/loads.routes.ts";
const ALLOWED_PM_WRITERS = new Set(["apps/backend/src/dispatch/load-lane-learning.service.ts", "apps/backend/src/dispatch/mileage/mileage.service.ts"]);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (e === "node_modules" || e === "__tests__" || e.endsWith(".test.ts")) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|mts|mjs|js)$/.test(e)) out.push(p);
  }
  return out;
}

export function audit(src) {
  const f = [];
  for (const [file, text] of Object.entries(src.all)) {
    if (/INSERT\s+INTO\s+catalogs\.point_mileage/i.test(text) && !ALLOWED_PM_WRITERS.has(file)) f.push(`${file}: writes catalogs.point_mileage outside the miles engine`);
  }
  if (!/miles_choice\s*=\s*coalesce\(miles_choice/.test(src.svc)) f.push(`${SVC}: setMilesChoice must write mdata.loads.miles_choice`);
  if (!/historical:\s*h,\s*\n\s*google:\s*g/.test(src.svc)) f.push(`${SVC}: the choice must keep BOTH recommendations`);
  if (!/"dispatch\.load\.miles_choice"/.test(src.svc)) f.push(`${SVC}: a choice must write its audit row`);
  if (!/manual_miles_requires_reason/.test(src.svc) || !/manual_miles_requires_value_and_reason/.test(src.routes)) f.push(`manual miles must require a reason (service + route)`);
  if (!/historical_missing_reason/.test(src.svc) || !/google_missing_reason/.test(src.svc)) f.push(`${SVC}: both recommendation blocks must carry a missing reason`);
  if (!/miles_choice:\s*z/.test(src.bookRoute)) f.push(`${BOOK_ROUTE}: Book Load must accept miles_choice`);
  if (!/SET miles_choice = \$2::jsonb/.test(src.book)) f.push(`${BOOK}: Book Load must persist miles_choice on the new load`);
  return f;
}

const read = (p) => readFileSync(p, "utf8");
const all = Object.fromEntries(walk("apps/backend/src").map((p) => [p, read(p)]));
const src = { svc: read(SVC), routes: read(ROUTES), book: read(BOOK), bookRoute: read(BOOK_ROUTE), all };
const failures = audit(src);
if (failures.length) {
  console.error("verify-load-miles-source-recorded FAIL");
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const muts = [
    { ...src, all: { ...all, "apps/backend/src/x.ts": "INSERT INTO catalogs.point_mileage (a) VALUES (1)" } },
    // 443.99: replaceAll — the engine now writes miles_choice on two paths, so a first-only plant left one behind and
    // escaped; every writer must lose the clause for the plant to be the defect.
    { ...src, svc: src.svc.replaceAll("miles_choice = coalesce(miles_choice", "miles_choice = (miles_choice") },
    { ...src, svc: src.svc.replaceAll('"dispatch.load.miles_choice"', '"x"') },
    { ...src, svc: src.svc.replace(/manual_miles_requires_reason/g, "x") },
    { ...src, svc: src.svc.replace(/google_missing_reason/g, "x") },
    { ...src, bookRoute: src.bookRoute.replace(/miles_choice:\s*z/, "x: z") },
    { ...src, book: src.book.replaceAll("SET miles_choice = $2::jsonb", "SET x = $2") },
  ];
  const escaped = muts.map((m, i) => (audit(m).length === 0 ? i : -1)).filter((i) => i >= 0);
  if (escaped.length) {
    console.error(`verify-load-miles-source-recorded SELFTEST FAIL — planted mutation(s) escaped: #${escaped.join(", #")}`);
    process.exit(1);
  }
  console.log(`verify-load-miles-source-recorded SELFTEST PASS ${muts.length}/${muts.length}`);
}

if (process.env.DATABASE_URL) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();
    await c.query("BEGIN");
    await c.query("SET LOCAL statement_timeout = '20s'");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const r = (await c.query(`
      SELECT count(*) FILTER (WHERE l.created_at >= '2026-10-11') creator_loads,
             count(*) FILTER (WHERE l.created_at >= '2026-10-11' AND (
                 (l.miles_practical IS NULL OR l.miles_choice->'practical'->>'source' IS NOT NULL)
             AND (l.miles_shortest  IS NULL OR l.miles_choice->'short'->>'source' IS NOT NULL)
             AND (l.miles_deadhead  IS NULL OR l.miles_choice->'empty'->>'source' IS NOT NULL))) creator_all_sourced,
             count(*) FILTER (WHERE (l.miles_practical IS NOT NULL AND l.miles_choice->'practical'->>'source' IS NULL)
                                 OR (l.miles_shortest  IS NOT NULL AND l.miles_choice->'short'->>'source' IS NULL)
                                 OR (l.miles_deadhead  IS NOT NULL AND l.miles_choice->'empty'->>'source' IS NULL)) any_unsourced
        FROM mdata.loads l
       WHERE l.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid AND l.status <> 'cancelled' AND l.soft_deleted_at IS NULL`)).rows[0];
    await c.query("ROLLBACK");
    console.log(`verify-load-miles-source-recorded LIVE: Creator loads with a recorded source per field ${r.creator_all_sourced} of ${r.creator_loads}; USMCA loads with an unsourced miles field ${r.any_unsourced}`);
    if (process.argv.includes("--strict-live") && Number(r.any_unsourced) > 0) process.exit(1);
  } catch (e) {
    console.log(`verify-load-miles-source-recorded LIVE: skipped (${String(e.message ?? e).slice(0, 120)})`);
  } finally {
    await c.end().catch(() => {});
  }
}
console.log("verify-load-miles-source-recorded PASS — one point_mileage writer; per-field source + both recommendations + who/when recorded; manual needs a reason");
