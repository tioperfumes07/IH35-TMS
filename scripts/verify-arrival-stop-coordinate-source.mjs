#!/usr/bin/env node
/**
 * GUARD — arrival detection must accept a stop's OWN coordinate.
 *
 * WHY THIS GUARD EXISTS (measured live, br-fancy-credit-akjnd07a, USMCA
 * 5c854333-6ea5-4faa-af31-67cb272fef80, 2026-09-30):
 *
 *   active assigned loads                        17
 *   candidate stops before the geo filter        35
 *   of those, with mdata.load_stops.location_id   0
 *   of those, carrying their own lat/lng         35
 *   mdata.locations rows for USMCA              621  (616 geocoded)
 *
 * fetchRemainingStops read coordinates ONLY from mdata.locations via location_id and required
 * them non-null, so it discarded all 35 stops and returned empty on every call. Arrival
 * detection could not have fired even once, no matter how many GPS points arrived.
 *
 * THE PROPERTY: the stop's own coordinate is the primary source, the catalog row is the
 * fallback, the filter is on the COALESCE and not on the catalog column alone, and the source
 * is labelled rather than assumed.
 *
 * SELFTEST: --selftest plants each real regression and requires the guard to catch it.
 */
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/telematics/arrival-detection.service.ts";

export function checkArrivalCoordinateSource(source) {
  const failures = [];

  if (!/COALESCE\(s\.latitude,\s*loc\.latitude\)\s+AS\s+latitude/.test(source)) {
    failures.push(
      "latitude must be COALESCE(s.latitude, loc.latitude): the stop's own coordinate first, the catalog row as fallback"
    );
  }
  if (!/COALESCE\(s\.longitude,\s*loc\.longitude\)\s+AS\s+longitude/.test(source)) {
    failures.push(
      "longitude must be COALESCE(s.longitude, loc.longitude): the stop's own coordinate first, the catalog row as fallback"
    );
  }
  if (!/AND\s+COALESCE\(s\.latitude,\s*loc\.latitude\)\s+IS\s+NOT\s+NULL/.test(source)) {
    failures.push("the WHERE filter must test COALESCE(s.latitude, loc.latitude), not loc.latitude alone");
  }
  if (!/AND\s+COALESCE\(s\.longitude,\s*loc\.longitude\)\s+IS\s+NOT\s+NULL/.test(source)) {
    failures.push("the WHERE filter must test COALESCE(s.longitude, loc.longitude), not loc.longitude alone");
  }
  if (/AND\s+loc\.latitude\s+IS\s+NOT\s+NULL/.test(source) || /AND\s+loc\.longitude\s+IS\s+NOT\s+NULL/.test(source)) {
    failures.push(
      "a bare `AND loc.latitude/longitude IS NOT NULL` filter discards every stop whose location_id is null — 35 of 35 live"
    );
  }
  if (!/CASE\s+WHEN\s+s\.latitude\s+IS\s+NOT\s+NULL[\s\S]{0,120}?AS\s+coord_source/.test(source)) {
    failures.push("coord_source must be selected and derived from the stop's own coordinate, so the source is stated, never inferred");
  }
  if (!/coord_source:\s*"stop"\s*\|\s*"location"/.test(source)) {
    failures.push("RemainingStopRow must carry coord_source typed as \"stop\" | \"location\"");
  }

  return failures;
}

const NAME = "verify-arrival-stop-coordinate-source";

if (process.argv.includes("--selftest")) {
  const good = readFileSync(FILE, "utf8");
  const cases = [
    ["baseline (unmodified source)", good, 0],
    [
      "latitude reverts to loc.latitude only",
      good.replace("COALESCE(s.latitude, loc.latitude) AS latitude", "loc.latitude AS latitude"),
      1,
    ],
    [
      "longitude reverts to loc.longitude only",
      good.replace("COALESCE(s.longitude, loc.longitude) AS longitude", "loc.longitude AS longitude"),
      1,
    ],
    [
      "the old bare catalog filter comes back",
      good.replace(
        "AND COALESCE(s.latitude, loc.latitude) IS NOT NULL",
        "AND loc.latitude IS NOT NULL"
      ),
      1,
    ],
    ["coord_source column dropped", good.replace(/CASE WHEN s\.latitude[^\n]*AS coord_source/, "'stop' AS coord_source"), 1],
    ["coord_source removed from the row type", good.replace(/coord_source: "stop" \| "location";/, ""), 1],
  ];

  let ok = 0;
  for (const [label, src, expectMin] of cases) {
    const found = checkArrivalCoordinateSource(src).length;
    const pass = expectMin === 0 ? found === 0 : found >= expectMin;
    if (pass) ok += 1;
    else console.error(`  selftest MISS: ${label} -> ${found} failure(s), expected ${expectMin === 0 ? "0" : ">=1"}`);
  }
  console.log(`${NAME} selftest ${ok}/${cases.length} ${ok === cases.length ? "OK" : "FAILED"}`);
  if (ok !== cases.length) process.exit(1);
  console.log("--- live ---");
}

const failures = checkArrivalCoordinateSource(readFileSync(FILE, "utf8"));
if (failures.length > 0) {
  console.error(`${NAME} FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${NAME} PASS — arrival detection takes the stop's own coordinate, catalog as fallback, source labelled`);
