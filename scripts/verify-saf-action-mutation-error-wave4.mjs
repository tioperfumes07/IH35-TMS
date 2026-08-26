#!/usr/bin/env node
/**
 * verify-saf-action-mutation-error-wave4
 * SAF-ACTION-MUTATION-SILENT-FAIL-WAVE4 — complaint resolve, integrity review,
 * geofence acknowledge must surface isError.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-action-mutation-error-wave4";
const CHECKS = [
  {
    file: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
    needles: ["userFacingApiError", "patchMutation.isError", "complaint-resolve-error"],
  },
  {
    file: "apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx",
    needles: ["userFacingApiError", "reviewError", "integrity-review-error"],
  },
  {
    file: "apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx",
    needles: ["userFacingApiError", "acknowledgeMutation.isError", "geofence-acknowledge-error"],
  },
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `onClick={() => patchMutation.mutate({})}`;
  const good = CHECKS[0].needles.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-saf-wave4-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-saf-wave4-selftest.tsx", ["patchMutation.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-saf-wave4-selftest.tsx", CHECKS[0].needles).length > 0) {
      console.error(`${LABEL} SELFTEST FAIL good`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = [];
for (const c of CHECKS) {
  if (!fs.existsSync(path.join(process.cwd(), c.file))) {
    errors.push(`missing ${c.file}`);
    continue;
  }
  errors.push(...assertFile(c.file, c.needles));
}
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — complaints/integrity/geofence action mutations surface isError`);
