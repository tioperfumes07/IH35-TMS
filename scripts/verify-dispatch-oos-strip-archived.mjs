#!/usr/bin/env node
/**
 * DISPATCH #8 (owner 2026-09-04): "THE FLEET OOS IN SHOP AT THE VERY BOTTOM IS UNNECESSARY YOU
 * ALREADY HAVE AN IN SHOP SECTION" + "we do not need to see the vehicles out of service" in
 * dispatch. The bottom Fleet OOS/In-Shop strip is ARCHIVED behind a flag (Rule 07 — never delete):
 * the component + import stay in source, only the render is gated off. This guard fails if the
 * strip is un-archived OR if the component/import is deleted (a Rule 07 violation).
 *
 * Self-testing static guard. Run: node scripts/verify-dispatch-oos-strip-archived.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/pages/Dispatch.tsx";
const original = fs.readFileSync(file, "utf8");

const contracts = [
  [
    "the Fleet OOS strip is archived behind FLEET_OOS_STRIP_ARCHIVED = true",
    (s) => /const FLEET_OOS_STRIP_ARCHIVED = true;/.test(s),
    (s) => s.replace("const FLEET_OOS_STRIP_ARCHIVED = true;", "const FLEET_OOS_STRIP_ARCHIVED = false;"),
  ],
  [
    "showFleetOosStrip is gated by the archive flag",
    (s) => /const showFleetOosStrip =\s*!FLEET_OOS_STRIP_ARCHIVED &&/.test(s),
    (s) => s.replace("!FLEET_OOS_STRIP_ARCHIVED &&", ""),
  ],
  [
    "the FleetOosStrip component is NOT deleted (Rule 07 archive-only)",
    (s) => /import \{ FleetOosStrip \} from "\.\.\/components\/dispatch\/FleetOosStrip";/.test(s),
    (s) => s.replace('import { FleetOosStrip } from "../components/dispatch/FleetOosStrip";', ""),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-dispatch-oos-strip-archived] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    if (audit(mutate(original)).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-dispatch-oos-strip-archived] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-dispatch-oos-strip-archived] OK");
