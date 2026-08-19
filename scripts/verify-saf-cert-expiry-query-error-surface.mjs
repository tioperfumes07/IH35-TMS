#!/usr/bin/env node
/**
 * verify-saf-cert-expiry-query-error-surface
 * SAF-CERT-EXPIRY-QUERY-ERROR — alertsQuery fail must not show emptyText ParityTable.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-cert-expiry-query-error-surface";
const FILE = "apps/frontend/src/pages/safety/expiry-tracking/ExpiryDashboard.tsx";
const NEEDLES = [
  "ListErrorState",
  "alertsQuery.isError",
  "cert-expiry-query-error",
  "Couldn't load certificate expiries",
  "userFacingApiError",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `emptyText="No expiring certificates in the selected filters."`;
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-cert-expiry-query-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-cert-expiry-query-selftest.tsx", ["alertsQuery.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-cert-expiry-query-selftest.tsx", NEEDLES).length > 0) {
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

if (!fs.existsSync(path.join(process.cwd(), FILE))) {
  console.error(`${LABEL} FAIL: missing ${FILE}`);
  process.exit(1);
}
const errors = assertFile(FILE, NEEDLES);
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ExpiryDashboard surfaces alertsQuery.isError`);
