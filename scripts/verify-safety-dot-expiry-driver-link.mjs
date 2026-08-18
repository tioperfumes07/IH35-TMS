#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-safety-dot-expiry-driver-link";
const FILE = "apps/frontend/src/pages/safety/expiry-tracking/ExpiryDashboard.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  if (!/import \{ EntityLink \} from "\.\.\/\.\.\/\.\.\/components\/shared\/EntityLink"/.test(text)) {
    failures.push("ExpiryDashboard must import the canonical EntityLink");
  }
  if (!/key: "driver_name"[\s\S]*?<EntityLink[\s\S]*?kind="driver"[\s\S]*?id=\{row\.driver_uuid\}[\s\S]*?entityLabel\(row\.driver_name, row\.driver_uuid, "Driver"\)/.test(text)) {
    failures.push("DOT expiry Driver column must render a canonical driver EntityLink with human fallback");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('kind="driver"', 'kind="unit"'),
    source.replace("id={row.driver_uuid}", "id={undefined}"),
    source.replace("<EntityLink", "<span"),
  ];
  if (mutations.some((changed) => audit(changed).length === 0)) {
    console.error(`${LABEL} SELFTEST FAIL — a planted driver-link defect escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — kind, id, and component mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — DOT expiry rows drill from a human driver label to the canonical driver profile`);
