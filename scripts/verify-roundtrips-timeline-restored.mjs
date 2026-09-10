#!/usr/bin/env node
// BRD-10 guard — Round Trips Timeline must stay restored to the original inline grid design
// (commit 67faa3dcd) and must not silently regress back into the shared PlannerGrid component.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const timelinePath = join(root, "apps/frontend/src/pages/dispatch/RoundTripsTimeline.tsx");
const timeline = readFileSync(timelinePath, "utf-8");
const routesPath = join(root, "apps/frontend/src/routes/manifest.tsx");
const routes = readFileSync(routesPath, "utf-8");
const manifestPath = join(root, "apps/frontend/src/router/route-manifest.ts");
const manifest = readFileSync(manifestPath, "utf-8");
const dispatchPath = join(root, "apps/frontend/src/pages/Dispatch.tsx");
const dispatch = readFileSync(dispatchPath, "utf-8");
const errors = [];

if (!/const NB = "#1f2a44"/.test(timeline)) {
  errors.push("RoundTripsTimeline.tsx is missing the restored NB color token (#1f2a44).");
}
if (!/const SB = "#475569"/.test(timeline)) {
  errors.push("RoundTripsTimeline.tsx is missing the restored SB color token (#475569).");
}
if (!/const TR = "#b45309"/.test(timeline)) {
  errors.push("RoundTripsTimeline.tsx is missing the restored TR color token (#b45309).");
}

if (!/gridTemplateColumns: `7rem repeat\(\$\{days\.length\}, minmax\(2\.5rem, 1fr\)\)`/.test(timeline)) {
  errors.push("RoundTripsTimeline.tsx does not use the restored 7rem + minmax(2.5rem, 1fr) grid template.");
}

if (!/const longFlag = \(kind === "NB" \|\| kind === "SB"\) && end - start >= 7 \* 24 \* 60 \* 60 \* 1000/.test(timeline)) {
  errors.push("RoundTripsTimeline.tsx does not compute the 7-day long-leg flag exactly as specified.");
}

if (/<PlannerGrid\b/.test(timeline)) {
  errors.push("RoundTripsTimeline.tsx must not delegate rendering to PlannerGrid; it must render its own inline grid.");
}

// DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05 §C — the long-leg data attribute existed with no
// visual effect (no CSS rule painted it) and the legend row was entirely absent. Both real gaps,
// fixed 2026-09-05 (L.4c). Everything else this guard already checked above was, on live
// re-verification, already correctly restored — this only adds the two pieces that were missing.
if (!/outline:\s*`1\.5px solid \$\{LONG_LEG_OUTLINE\}`/.test(timeline)) {
  errors.push("RoundTripsTimeline.tsx must visually outline a long leg (1.5px, LONG_LEG_OUTLINE), not just carry the data-rt-long-leg attribute with no paint.");
}
if (!/const LONG_LEG_OUTLINE = "#dc2626"/.test(timeline)) {
  errors.push("RoundTripsTimeline.tsx is missing the long-leg outline color token (#dc2626).");
}
if (!/data-testid="round-trips-timeline-legend"/.test(timeline)) {
  errors.push("RoundTripsTimeline.tsx must render a legend row (round-trips-timeline-legend).");
}
for (const phrase of [
  "NB — Northbound, starts the tour",
  "TR — Triangulation",
  "SB — Southbound, closes the settlement at Laredo",
  "leg running 7+ days",
]) {
  if (!timeline.includes(phrase)) {
    errors.push(`RoundTripsTimeline.tsx legend is missing the exact phrase: "${phrase}"`);
  }
}

if (!/path: "\/dispatch\/round-trips"/.test(manifest)) {
  errors.push("route-manifest.ts must register the canonical /dispatch/round-trips route.");
}
if (!/path="\/dispatch\/round-trips"/.test(routes)) {
  errors.push("routes/manifest.tsx must expose the /dispatch/round-trips Route.");
}
if (!/roundTripsDeepLink/.test(routes)) {
  errors.push("routes/manifest.tsx must mount DispatchPage with roundTripsDeepLink for /dispatch/round-trips.");
}

// REG-037 (owner 2026-09-10: Round Trips timeline "Aug 25 → present is not rendering loads/units"):
// the Round Trips board + timeline (view === "units") render from the same paginated `loads` the Load
// Board uses. A 50-row page silently truncated the fleet, so units/loads past the first page never
// reached the timeline. That view has no pager, so it must fetch the full window. Guard the widened
// fetch so it can't regress back to the 50-row page.
if (!/roundTripsFullFetch\s*=\s*subTab === "load_board" && view === "units"/.test(dispatch)) {
  errors.push("Dispatch.tsx must flag the Round Trips view (roundTripsFullFetch = subTab load_board && view units) so its whole-fleet board+timeline are not paginated (REG-037).");
}
if (!/effectiveLoadsLimit\s*=\s*roundTripsFullFetch \? 1000 : limit/.test(dispatch) || !/limit:\s*effectiveLoadsLimit/.test(dispatch)) {
  errors.push("Dispatch.tsx must fetch the full window (effectiveLoadsLimit) for the Round Trips view so the timeline is not truncated by the 50-row Load Board pager (REG-037).");
}

if (errors.length > 0) {
  for (const err of errors) {
    console.error("verify-roundtrips-timeline-restored FAIL:", err);
  }
  process.exit(1);
}

console.log("verify-roundtrips-timeline-restored OK — Round Trips Timeline restored design is guarded.");
process.exit(0);
