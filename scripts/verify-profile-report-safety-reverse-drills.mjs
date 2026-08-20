#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leafRe":"^profiles\.detail$","task":"LINK-F5124-PROFILE-REPORT-SAFETY-REVERSE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["reports"],"cols":["reverse_link"],"leafRe":"^report\.deadhead$","task":"LINK-F5124-PROFILE-REPORT-SAFETY-REVERSE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leafRe":"^(safety_events\.list|internal_fines\.list)$","task":"LINK-F5124-PROFILE-REPORT-SAFETY-REVERSE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leafRe":"^load\.detail$","task":"LINK-F5124-PROFILE-REPORT-SAFETY-REVERSE","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  assignment: fs.readFileSync("apps/frontend/src/components/driver-profile/CurrentAssignmentSection.tsx", "utf8"),
  deadhead: fs.readFileSync("apps/frontend/src/pages/reports/DeadheadReportPage.tsx", "utf8"),
  loadSafety: fs.readFileSync("apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx", "utf8"),
  driverFines: fs.readFileSync("apps/frontend/src/components/safety/DriverFinesReverseSection.tsx", "utf8"),
  events: fs.readFileSync("apps/frontend/src/pages/safety/SafetyEventsPage.tsx", "utf8"),
  fines: fs.readFileSync("apps/frontend/src/pages/safety/InternalFinesPage.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
};

const checks = [
  ["assignment", /<EntityLinkOrTombstone[\s\S]{0,80}kind="driver"[\s\S]{0,80}id=\{driverId\}[\s\S]{0,80}name=\{driverName\}[\s\S]{0,40}noun="Driver"/, "driver assignment helper drills with the canonical driver label"],
  ["deadhead", /kind="unit"[\s\S]{0,120}id=\{row\.unit_id\}/, "deadhead table drills to unit profiles"],
  ["deadhead", /kind="unit"[\s\S]{0,120}id=\{best\.unit_id\}/, "best-performer tile drills to its unit"],
  ["deadhead", /kind="unit"[\s\S]{0,120}id=\{worst\.unit_id\}/, "attention tile drills to its unit"],
  ["loadSafety", /kind="safety_event"[\s\S]{0,120}id=\{row\.id\}/, "load reverse section drills to safety events"],
  ["events", /searchParams\.get\("event_id"\)/, "safety-events destination consumes event_id"],
  ["driverFines", /kind="internal_fine"[\s\S]{0,120}id=\{id\}/, "driver reverse section drills to internal fines"],
  ["fines", /searchParams\.get\("fine_id"\)/, "internal-fines destination consumes fine_id"],
  ["fines", /String\(row\.id \?\? ""\) === linkedFineId \? "bg-slate-100/, "linked internal fine is visibly highlighted"],
  ["entityLink", /case "safety_event":[\s\S]*?safety-events\?event_id=\$\{id\}/, "safety-event resolver carries event_id"],
  ["entityLink", /case "internal_fine":[\s\S]*?internal-fines\?fine_id=\$\{id\}/, "internal-fine resolver carries fine_id"],
];

const failures = (candidate) => checks
  .filter(([key, pattern]) => !pattern.test(candidate[key]))
  .map(([, , label]) => label);

const found = failures(sources);
if (found.length) {
  console.error(`verify-profile-report-safety-reverse-drills: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-profile-report-safety-reverse-drills: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-profile-report-safety-reverse-drills: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-profile-report-safety-reverse-drills: PASS — ${checks.length} profile/report/safety reverse invariants`);
