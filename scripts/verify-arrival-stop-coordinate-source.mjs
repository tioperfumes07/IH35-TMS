#!/usr/bin/env node
/**
 * GUARD (re-anchored 2026-10-02, CC-3 queue 6 — ONE arrival detector) — an arrival must be detectable at a stop's OWN
 * coordinate. Measured live 2026-09-30 (USMCA): 35 candidate stops, 0 with location_id, 35 with their own lat/lng.
 * The arrival is now the stop's bound fence: bindLoadToGeofences centres it on mdata.load_stops.latitude/longitude and
 * labels it load-<id>-stop-<seq>; the geofence detector stamps the stop matched by that label.
 * Contract: scripts/lib/one-arrival-detector.mjs.
 */
import { PATHS, read, checkFenceUsesStopsOwnCoordinate, checkFenceStampContract, mutations, report } from "./lib/one-arrival-detector.mjs";

const LABEL = "verify-arrival-stop-coordinate-source";
const binding = read(PATHS.binding);
const detector = read(PATHS.detector);
report(LABEL, [...checkFenceUsesStopsOwnCoordinate(binding), ...checkFenceStampContract(detector)], process.argv.includes("--selftest") && {
  name: "stop coordinate",
  run: () => mutations(checkFenceUsesStopsOwnCoordinate, [
    ["catalog coordinate only", binding.replace("ls.latitude::double precision AS lat", "loc.latitude::double precision AS lat")],
    ["label drift", binding.replace("loadStopFenceLabel(loadId, stop.sequence)", "`stop-${stop.sequence}`")],
  ]),
});
