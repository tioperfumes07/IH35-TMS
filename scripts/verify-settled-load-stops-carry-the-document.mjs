#!/usr/bin/env node
/**
 * LEAD 443.241 (owner 10-22: "read the company and driver settlements. you did not seed correctly." · owner 10-11: "we need the
 * real address geo fences") — every stop of a USMCA load on a signed settlement carries the document's facility + ZIP and, once
 * a street is known, a real-address location with an active fence. The 10-16 manual seed booked ~50 stops with a city only
 * (no facility, no ZIP, no location, no fence), so no geofence could ever see the truck arrive there.
 * STATIC: RULE 1 the document engine fills facility / ZIP only where the stop has none and lists (never applies) a printed
 *   address that differs from a street the load already has; RULE 2 it writes miles only through setMilesChoice source 'document';
 *   RULE 3 it runs the ONE geocode → location → fence → Samsara pass (geocodeStopsWithClient reresolve); RULE 4 the route is wired.
 * LIVE (USMCA, read-only): RULE 5 no stop of a load on a settlement that has a signed document (source_document_ref IS NOT NULL)
 *   lacks a facility name or a ZIP; RULE 6 every such stop is at a location with an active fence, or carries Google's recorded
 *   "no result" (no_street_source_v3_google — listed for the owner, never fenced at a ZIP center). Open settlements without a
 *   document are excluded — the engine only runs when a document is uploaded.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settled-load-stops-carry-the-document";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const F = {
  geocode: "apps/backend/src/telematics/stops-geocode-backfill.service.ts",
  engine: "apps/backend/src/dispatch/settlement-document-load-facts.service.ts",
  routes: "apps/backend/src/dispatch/settlement-document-load-facts.routes.ts",
  index: "apps/backend/src/index.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function staticFailures(s) {
  const out = [];
  if (!/if \(!stop\.facility_name\?\.trim\(\) && company && !looksLikeStreet\(stop\.address_line1\)\) patch\.facility_name = company;/.test(s.engine) ||
      !/facility_name = CASE WHEN nullif\(trim\(facility_name\), ''\) IS NULL THEN/.test(s.engine))
    out.push(`RULE 1 ${F.engine}: facility must be filled only where the stop has none`);
  if (!/reason: "printed_address_differs_load_kept"/.test(s.engine) || /SET[^`]*address_line1\s*=/.test(s.engine))
    out.push(`RULE 1 ${F.engine}: a printed address that differs from the load's street must be listed, never applied`);
  if (!/await setMilesChoice\(client as never, \{[\s\S]{0,200}source: "document", documentValue: v,/.test(s.engine) || /UPDATE mdata\.loads/.test(s.engine))
    out.push(`RULE 2 ${F.engine}: miles must be written only through setMilesChoice source 'document'`);
  if (!/await geocodeStopsWithClient\(client as never, args\.actorUserId, args\.operatingCompanyId, l\.id, \{ reresolve: true \}\)/.test(s.engine))
    out.push(`RULE 3 ${F.engine}: the load's stops must go through the one geocode → location → fence → Samsara pass`);
  if (!/applySettlementDocumentToLoad\(/.test(s.routes) || !s.index.includes("await registerSettlementDocumentLoadFactsRoutes(app);"))
    out.push(`RULE 4 ${F.routes}: the engine must be reachable (route registered in index.ts)`);
  // 443.248: the printed address is the stop's address of record (document_address) and a printed stop the load lacks is added.
  if (!/document_address = \$8::jsonb/.test(s.engine) || !/const record = documentAddressOf\(d, doc\.settlement_no\);/.test(s.engine))
    out.push(`RULE 1 ${F.engine}: the signed settlement's printed address is no longer kept as the stop's address of record`);
  if (!/out\.stops_added = await insertMissingDocumentStops\(/.test(s.engine))
    out.push(`RULE 1 ${F.engine}: a printed stop the load lacks (relay) is no longer added`);
  // verify-delivered-load-stops-terminal RULE 2 (red after 443.248): a delivered load's document stops go through the one
  // stamping engine, so an added relay stop is never left 'pending'.
  if (!/includes\(l\.status\)\) \{[\s\S]{0,400}await stampStopsFromTracking\(client, l\.id, args\.operatingCompanyId, \{ stopDates \}\)/.test(s.engine))
    out.push(`RULE 5 ${F.engine}: a delivered load's document stops are not stamped through stampStopsFromTracking — an added stop stays 'pending'`);
  if (!/const zipStamped = [^\n]*"manual_seed"/.test(s.geocode))
    out.push(`RULE 3 ${F.geocode}: a 'manual_seed' city-only stop is never marked as tried — it stays un-fenced and un-listed`);
  return out;
}

export function liveFailures(rows) {
  const out = [];
  for (const r of rows) {
    if (r.missing_facility || r.missing_zip) out.push(`RULE 5 load ${r.load_number} stop ${r.sequence_number}: ${r.missing_facility ? "no facility" : ""}${r.missing_facility && r.missing_zip ? " / " : ""}${r.missing_zip ? "no ZIP" : ""}`);
    if (r.missing_fence && !r.google_no_result) out.push(`RULE 6 load ${r.load_number} stop ${r.sequence_number}: no real-address location fence (${r.geocode_source ?? "no geocode"})`);
  }
  return out;
}

export const LIVE_SQL = `
SELECT DISTINCT l.load_number, s.sequence_number, s.geocode_source,
       nullif(trim(coalesce(s.facility_name, '')), '') IS NULL AND s.address_line1 !~ '^\\s*[0-9]' AS missing_facility,
       nullif(trim(coalesce(s.postal_code, '')), '') IS NULL AS missing_zip,
       NOT EXISTS (SELECT 1 FROM geo.geofences g WHERE g.operating_company_id = l.operating_company_id AND g.location_ref_id = s.location_id AND g.is_active) AS missing_fence,
       coalesce(s.geocode_failure_reason, '') = 'no_street_source_v3_google' AS google_no_result
  FROM driver_finance.settlement_lines sl
  JOIN driver_finance.driver_settlements st ON st.id = sl.settlement_id AND st.voided_at IS NULL AND st.status <> 'cancelled'
         AND st.source_document_ref IS NOT NULL
  JOIN mdata.loads l ON l.id = sl.load_id AND l.voided_at IS NULL AND l.status::text <> 'cancelled'
  JOIN mdata.load_stops s ON s.load_id = l.id AND s.soft_deleted_at IS NULL
 WHERE st.operating_company_id = $1::uuid AND sl.voided_at IS NULL
 ORDER BY l.load_number, s.sequence_number`;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (process.argv.includes("--selftest")) {
    const plant = (k, from, to) => ({ ...base, [k]: base[k].replace(from, to) });
    const cases = [
      ["main source is clean", staticFailures(base).length === 0],
      ["RULE 1 facility overwritten", staticFailures(plant("engine", "if (!stop.facility_name?.trim() && company", "if (company")).some((x) => x.startsWith("RULE 1"))],
      ["RULE 1 printed address applied", staticFailures(plant("engine", 'reason: "printed_address_differs_load_kept"', 'reason: "x"')).some((x) => x.startsWith("RULE 1"))],
      ["RULE 2 miles written around the engine", staticFailures(plant("engine", "// ---- miles", "await client.query(`UPDATE mdata.loads SET miles_shortest = 1`);\n  // ---- miles")).some((x) => x.startsWith("RULE 2"))],
      ["RULE 3 geocode pass dropped", staticFailures(plant("engine", "{ reresolve: true }", "{}")).some((x) => x.startsWith("RULE 3"))],
      ["RULE 3 manual_seed not treated as a city center", staticFailures(plant("geocode", ', "manual_seed"]', "]")).some((x) => x.startsWith("RULE 3"))],
      ["RULE 1 address of record dropped", staticFailures(plant("engine", "document_address = $8::jsonb,", "")).some((x) => x.startsWith("RULE 1"))],
      ["RULE 1 relay stop no longer added", staticFailures(plant("engine", "out.stops_added = await insertMissingDocumentStops(", "void (")).some((x) => x.startsWith("RULE 1"))],
      ["RULE 5 delivered-load stops not stamped", staticFailures(plant("engine", "await stampStopsFromTracking(client, l.id, args.operatingCompanyId, { stopDates })", "void stopDates")).some((x) => x.startsWith("RULE 5"))],
      ["RULE 4 route not registered", staticFailures(plant("index", "await registerSettlementDocumentLoadFactsRoutes(app);", "")).some((x) => x.startsWith("RULE 4"))],
      ["RULE 5 seed stop with no facility fails", liveFailures([{ load_number: "13665", sequence_number: 1, missing_facility: true, missing_zip: true, missing_fence: true, google_no_result: false }]).some((x) => x.startsWith("RULE 5"))],
      ["RULE 6 Google no-result is listed, not failed", liveFailures([{ load_number: "1", sequence_number: 1, missing_facility: false, missing_zip: false, missing_fence: true, google_no_result: true }]).length === 0],
      ["RULE 6 unfenced stop fails", liveFailures([{ load_number: "1", sequence_number: 1, missing_facility: false, missing_zip: false, missing_fence: true, google_no_result: false }]).some((x) => x.startsWith("RULE 6"))],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const failures = staticFailures(base);
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let rows = [];
  try {
    rows = (await client.query(LIVE_SQL, [USMCA])).rows;
  } finally {
    client.release();
    await pool.end();
  }
  failures.push(...liveFailures(rows));
  const listed = rows.filter((r) => r.missing_fence && r.google_no_result).length;
  if (failures.length) {
    console.error(`${LABEL}: FAIL (${failures.length})\n  ${failures.slice(0, 80).join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — ${rows.length} settled-load stops carry the document facility + ZIP and a real-address fence (${listed} listed: Google has no street).`);
}
