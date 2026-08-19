#!/usr/bin/env node
/**
 * verify-saf-detail-drawer-mutation-error-surface
 * SAF-DETAIL-DRAWER-MUTATION-SILENT-FAIL — Integrity / CompanyViolation / Anomaly
 * detail drawers must surface action mutation isError (not silent no-ops).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-detail-drawer-mutation-error-surface";
const CHECKS = [
  {
    file: "apps/frontend/src/pages/safety/components/IntegrityAlertDetailDrawer.tsx",
    needles: ["ackMutation.isError", "resolveMutation.isError", "snoozeMutation.isError", "userFacingApiError", "integrity-alert-action-error"],
  },
  {
    file: "apps/frontend/src/pages/safety/components/CompanyViolationDetailDrawer.tsx",
    needles: [
      "patchMutation.isError",
      "escalateMutation.isError",
      "resolveMutation.isError",
      "completeMutation.isError",
      "userFacingApiError",
      "company-violation-action-error",
      "company-violation-resolve-error",
      "company-violation-complete-error",
    ],
  },
  {
    file: "apps/frontend/src/pages/safety/tabs/AnomalyDetailDrawer.tsx",
    needles: ["ackMutation.isError", "resolveMutation.isError", "dismissMutation.isError", "userFacingApiError", "anomaly-action-error"],
  },
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `onClick={() => ackMutation.mutate()}`;
  const good = CHECKS[0].needles.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-detail-drawer-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-detail-drawer-selftest.tsx", ["ackMutation.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-detail-drawer-selftest.tsx", CHECKS[0].needles).length > 0) {
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
console.log(`${LABEL} PASS — detail drawer action mutations surface isError`);
