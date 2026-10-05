#!/usr/bin/env node
/**
 * GUARD: "which driver is this Samsara user" has ONE answer — mdata.driver_samsara_accounts (owner law 2026-10-05:
 * many Samsara users map into one driver profile; Samsara names are never changed).
 *
 * Measured 2026-10-05: three resolvers disagreed.
 *   1. The Samsara Mapping page (POST /api/v1/samsara/map, /unmap) wrote ONLY integrations.samsara_drivers.local_driver_id,
 *      so a human mapping changed nothing the engines read. 27 USMCA Samsara users named different driver rows in the two maps.
 *   2. The driver-mirror collector resolved through the legacy mdata.drivers.samsara_driver_id column + license/name
 *      guesses, and deactivated the driver when ANY one of his Samsara users was deactivated.
 *   3. Every other engine read the canonical map (driver-samsara-map.ts).
 *
 * STATIC: map/unmap write the canonical row in the same handler; the collector resolves canonical-first and only
 *         deactivates a driver when none of his other Samsara users is active.
 * LIVE:   Samsara users whose page mapping and canonical row name different drivers (merges followed) — shrink-only
 *         against the 2026-10-05 measurement (27). The page now writes both, so the count can only fall as humans map.
 * Fails closed without DATABASE_URL.
 *
 * Run: node scripts/verify-samsara-one-canonical-map.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-samsara-one-canonical-map";
const ROUTES = "apps/backend/src/integrations/samsara/driver-mapping/driver-mapping.routes.ts";
const COLLECTOR = "apps/backend/src/integrations/samsara/driver-mirror-collector.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const DRIFT_CEILING = 27; // STALE-LITERAL-OK: measured live 2026-10-05, shrink-only

function handlerBody(src, route) {
  const i = src.indexOf(`"${route}"`);
  if (i === -1) return null;
  const next = src.indexOf("app.post(", i + 1);
  return next === -1 ? src.slice(i) : src.slice(i, next);
}

export function staticProblems(routesSrc, collectorSrc) {
  const p = [];
  const map = handlerBody(routesSrc, "/api/v1/samsara/map");
  const unmap = handlerBody(routesSrc, "/api/v1/samsara/unmap");
  if (!map) p.push(`${ROUTES}: POST /api/v1/samsara/map not found`);
  else {
    if (!/CANONICAL_ACCOUNT_UPSERT_SQL/.test(map)) p.push(`${ROUTES}: map does not write the canonical mdata.driver_samsara_accounts row`);
    if (!/CANONICAL_ACCOUNT_DEACTIVATE_SQL/.test(map)) p.push(`${ROUTES}: map to a vendor does not deactivate the canonical driver row`);
  }
  if (!unmap) p.push(`${ROUTES}: POST /api/v1/samsara/unmap not found`);
  else if (!/CANONICAL_ACCOUNT_DEACTIVATE_SQL/.test(unmap)) p.push(`${ROUTES}: unmap does not deactivate the canonical row`);
  if (!/INSERT INTO mdata\.driver_samsara_accounts/.test(routesSrc)) p.push(`${ROUTES}: CANONICAL_ACCOUNT_UPSERT_SQL no longer inserts into mdata.driver_samsara_accounts`);
  if (!/loadDriverIdBySamsaraId\(/.test(collectorSrc)) p.push(`${COLLECTOR}: does not resolve through the canonical map first`);
  if (!/shouldDeactivateDriverForSamsaraUser\(/.test(collectorSrc)) p.push(`${COLLECTOR}: deactivates a driver when ONE of his Samsara users is deactivated`);
  return p;
}

function selftest() {
  const good = `app.post("/api/v1/samsara/map", x => { q(CANONICAL_ACCOUNT_UPSERT_SQL); q(CANONICAL_ACCOUNT_DEACTIVATE_SQL) });
    app.post("/api/v1/samsara/unmap", x => { q(CANONICAL_ACCOUNT_DEACTIVATE_SQL) }); const S = "INSERT INTO mdata.driver_samsara_accounts";`;
  const col = "loadDriverIdBySamsaraId(c); shouldDeactivateDriverForSamsaraUser(s);";
  const bad = [];
  if (staticProblems(good, col).length) bad.push("the fixed shape was flagged");
  if (!staticProblems(good.replace("q(CANONICAL_ACCOUNT_UPSERT_SQL); ", ""), col).some((m) => /does not write the canonical/.test(m))) bad.push("page-only map passed");
  if (!staticProblems(good.replace(`unmap", x => { q(CANONICAL_ACCOUNT_DEACTIVATE_SQL) }`, `unmap", x => { }`), col).some((m) => /unmap does not/.test(m))) bad.push("page-only unmap passed");
  if (!staticProblems(good, "shouldDeactivateDriverForSamsaraUser(s);").some((m) => /canonical map first/.test(m))) bad.push("legacy-column collector passed");
  if (!staticProblems(good, "loadDriverIdBySamsaraId(c);").some((m) => /ONE of his/.test(m))) bad.push("one-user deactivation passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 5/5 (fixed shape passes; page-only map, page-only unmap, legacy collector, one-user deactivation each caught)`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const problems = staticProblems(fs.readFileSync(path.join(ROOT, ROUTES), "utf8"), fs.readFileSync(path.join(ROOT, COLLECTOR), "utf8"));
if (!process.env.DATABASE_URL) problems.push("live: DATABASE_URL not set — the two maps were not compared, and an unread catalog is not a pass");
else {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const drift = (
      await c.query(
        `SELECT count(*)::int n
           FROM integrations.samsara_drivers sd
           JOIN mdata.drivers dm ON dm.id = sd.local_driver_id
           LEFT JOIN mdata.driver_samsara_accounts a ON a.samsara_driver_id = sd.samsara_driver_id AND a.is_active
           LEFT JOIN mdata.drivers da ON da.id = a.driver_id
          WHERE sd.operating_company_id = $1::uuid
            AND (da.id IS NULL OR COALESCE(dm.merged_into_driver_id, dm.id) <> COALESCE(da.merged_into_driver_id, da.id))`,
        [USMCA]
      )
    ).rows[0].n;
    await c.query("ROLLBACK");
    console.log(`${LABEL}: live drift (page map vs canonical map) ${drift} (ceiling ${DRIFT_CEILING}, shrink-only)`);
    if (drift > DRIFT_CEILING) problems.push(`live: ${drift} Samsara users name different drivers in the two maps > ceiling ${DRIFT_CEILING}`);
  } finally {
    await c.end();
  }
}
if (problems.length) { console.error(`${LABEL} FAIL\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — map/unmap write the canonical map; the collector resolves canonical-first and keeps a driver while any Samsara user is active.`);
