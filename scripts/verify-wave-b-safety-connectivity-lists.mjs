#!/usr/bin/env node
/**
 * WAVE-B safety connectivity — list/create surfaces already drilling via shared links.
 *
 * @matrix-built {"modules":["safety"],"cols":["connectivity"],"leafRe":"^(safety_meetings\\.|training_(programs|records)\\.list$|hos\\.list$|idvr\\.list$|dot_inspections\\.list$|safety_events\\.list$|accidents\\.|drug_alcohol\\.list$|internal_fines\\.|external_fines\\.)","task":"WAVE-B-safety-connectivity-lists","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-b-safety-connectivity-lists.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-b-safety-connectivity-lists";

const CHECKS = [
  {
    name: "Safety meetings driver drill",
    file: "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "Training programs driver drill",
    file: "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "Training records driver drill",
    file: "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "HOS driver drill",
    file: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "IDVR driver/unit/WO drills",
    file: "apps/frontend/src/pages/safety/IdvrPage.tsx",
    pattern: /kind="driver"[\s\S]*kind="unit"|kind="unit"[\s\S]*kind="driver"/,
  },
  {
    name: "Safety events multi-hub drills",
    file: "apps/frontend/src/pages/safety/SafetyEventsPage.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "Accidents multi-hub drills",
    file: "apps/frontend/src/pages/safety/AccidentsPage.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "Drug/alcohol table driver drill",
    file: "apps/frontend/src/pages/safety/components/DrugAlcoholTable.tsx",
    pattern: /kind="driver"|EntityLink/,
  },
  {
    name: "Internal fines drill",
    file: "apps/frontend/src/pages/safety/InternalFinesPage.tsx",
    pattern: /EntityLink/,
  },
  {
    name: "External fines drill",
    file: "apps/frontend/src/pages/safety/FinesPage.tsx",
    pattern: /EntityLink/,
  },
  {
    name: "DOT inspections deep-link reader",
    file: "apps/frontend/src/pages/safety/DotInspectionsPage.tsx",
    pattern: /inspection_id|EntityLink/,
  },
];

function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src == null) {
      failures.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(src)) failures.push(`${c.name}: shape missing in ${c.file}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const fail = checkAll(() => "POISON");
  if (!fail.length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (poison trips ${fail.length})`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
});
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — safety meetings/training/HOS/IDVR/events/accidents/D&A/fines/DOT connectivity ratcheted`);
