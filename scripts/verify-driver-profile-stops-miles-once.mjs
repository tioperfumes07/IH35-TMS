#!/usr/bin/env node
/**
 * verify-driver-profile-stops-miles-once — ROUND 8.20 board11.
 * Loads tab must mount exactly one Stops + miles reader (DriverProfileStopsMilesSection).
 * DriverTelematicsPanel operations must NOT also request/render stops-miles.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-profile-stops-miles-once";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TELEM = "apps/frontend/src/components/telematics/DriverTelematicsPanel.tsx";
const PROFILE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";

export function check(telemSrc, profileSrc) {
  const f = [];
  if (!telemSrc) f.push("DriverTelematicsPanel.tsx missing");
  if (!profileSrc) f.push("DriverProfilePage.tsx missing");
  if (telemSrc && /operations:\s*\[[^\]]*stops-miles/.test(telemSrc.replace(/\s+/g, " "))) {
    f.push("telematics operations still includes stops-miles (duplicate Stops + miles grid)");
  }
  if (telemSrc && /from:\s*"stops-miles"/.test(telemSrc)) {
    f.push("telematics SECTIONS still declare a stops-miles table");
  }
  if (profileSrc && !/DriverProfileStopsMilesSection/.test(profileSrc)) {
    f.push("DriverProfilePage missing canonical DriverProfileStopsMilesSection");
  }
  return f;
}

function selftest(telem, profile) {
  const cases = [
    ["ops has stops-miles", telem.replace('operations: ["assignments", "fuel", "samsara"]', 'operations: ["assignments", "stops-miles", "fuel", "samsara"]'), profile],
    ["no profile section", telem, profile.replace(/DriverProfileStopsMilesSection/g, "MissingSection")],
    ["telem deleted", "", profile],
  ];
  let pass = check(telem, profile).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(telem, profile));
  for (const [name, t, p] of cases) {
    if (check(t, p).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const telem = fs.existsSync(path.join(ROOT, TELEM)) ? fs.readFileSync(path.join(ROOT, TELEM), "utf8") : "";
const profile = fs.existsSync(path.join(ROOT, PROFILE)) ? fs.readFileSync(path.join(ROOT, PROFILE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(telem, profile);
else {
  const f = check(telem, profile);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — one Stops + miles reader on Driver Profile Loads tab`);
}
