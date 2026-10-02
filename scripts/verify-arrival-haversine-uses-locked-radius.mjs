#!/usr/bin/env node
/**
 * GUARD (re-anchored 2026-10-02, CC-3 queue 6 — ONE arrival detector). This guard locked the 250 ft radius of the
 * per-fix arrival detector. That detector is retired: it wrote dispatch.stop_arrivals, which nothing read, beside the
 * geofence detector that actually stamps mdata.load_stops. The lock is now that it stays retired — the file is gone,
 * nothing INSERTs into dispatch.stop_arrivals, and no ARRIVAL_RADIUS_FEET / processArrivalDetectionsForGpsPoint returns.
 * (The WF-051 prompt radius is its own guard: verify-wf-051-arrival-radius-meters.)
 */
import { PATHS, existsSync, checkNoSecondDetector, backendSourcesNaming, report } from "./lib/one-arrival-detector.mjs";

const LABEL = "verify-arrival-haversine-uses-locked-radius";
const backendSources = backendSourcesNaming("dispatch\\.stop_arrivals|ARRIVAL_RADIUS_FEET|processArrivalDetectionsForGpsPoint");
report(LABEL, checkNoSecondDetector({ retiredExists: existsSync(PATHS.retired), backendSources }), process.argv.includes("--selftest") && {
  name: "second detector",
  run: () => {
    const list = [
      ["file restored", { retiredExists: true, backendSources: {} }],
      ["insert restored", { retiredExists: false, backendSources: { "x.ts": "`INSERT INTO dispatch.stop_arrivals (a) VALUES (1)`" } }],
      ["radius restored", { retiredExists: false, backendSources: { "x.ts": "export const ARRIVAL_RADIUS_FEET = 250;" } }],
    ];
    for (const [name, input] of list) if (checkNoSecondDetector(input).length === 0) return { failed: name, count: list.length };
    return { failed: null, count: list.length };
  },
});
