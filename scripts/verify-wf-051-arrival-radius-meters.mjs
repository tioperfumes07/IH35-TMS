#!/usr/bin/env node
/** GAP-54 CI guard — locks WF-051 arrival radius at 76.2m. */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const radiusTs = readFileSync("apps/backend/src/integrations/samsara/geofences/wf-051-radius.ts", "utf8");
if (!radiusTs.includes("WF_051_ARRIVAL_RADIUS_METERS = 76.2")) {
  console.error("FAIL: WF_051_ARRIVAL_RADIUS_METERS must be 76.2");
  process.exit(1);
}

const forbidden = [/40233/, /40234/, /25\s*mile/i];
const scanDirs = [
  "apps/backend/src/integrations/samsara/geofences/arrival-prompt.service.ts",
  "apps/driver-pwa/src/lib/arrival-prompt-trigger.ts",
];
for (const file of scanDirs) {
  const content = readFileSync(file, "utf8");
  for (const pat of forbidden) {
    if (pat.test(content)) {
      console.error(`FAIL: forbidden pattern ${pat} in ${file}`);
      process.exit(1);
    }
  }
}

console.log("GAP-54 WF-051 arrival radius guard: PASS");
