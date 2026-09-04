#!/usr/bin/env node
// BRD-10 guard — Round Trips Timeline must stay restored to the original inline grid design
// (commit 67faa3dcd) and must not silently regress back into the shared PlannerGrid component.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const timelinePath = join(root, "apps/frontend/src/pages/dispatch/RoundTripsTimeline.tsx");
const timeline = readFileSync(timelinePath, "utf-8");
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

if (errors.length > 0) {
  for (const err of errors) {
    console.error("verify-roundtrips-timeline-restored FAIL:", err);
  }
  process.exit(1);
}

console.log("verify-roundtrips-timeline-restored OK — Round Trips Timeline restored design is guarded.");
process.exit(0);
