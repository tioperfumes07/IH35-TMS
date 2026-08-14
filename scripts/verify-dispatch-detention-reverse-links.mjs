#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leafRe":"^queues\\.detention$","task":"LINK-F5171-DISPATCH-DETENTION-REVERSE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-dispatch-detention-reverse-links";
const TARGET = "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx";

export function failures(source) {
  const required = [
    ["load", /<EntityLink kind="load" id=\{event\.load_id\}/],
    ["customer", /<EntityLink kind="customer" id=\{event\.customer_id\}/],
    ["driver", /<EntityLink kind="driver" id=\{event\.driver_id\}/],
    ["unit", /<EntityLink kind="unit" id=\{event\.unit_id\}/],
  ];
  return required
    .filter(([, pattern]) => !pattern.test(source))
    .map(([kind]) => `${TARGET}: detention rows must preserve the canonical ${kind} EntityLink`);
}

const source = fs.readFileSync(TARGET, "utf8");

if (process.argv.includes("--selftest")) {
  const baseline = failures(source);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — repository baseline is red:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  for (const kind of ["load", "customer", "driver", "unit"]) {
    const planted = source.replace(`kind="${kind}"`, 'kind="audit_event"');
    if (planted === source || !failures(planted).some((failure) => failure.includes(`canonical ${kind} EntityLink`))) {
      console.error(`${LABEL} SELFTEST FAIL — planted ${kind} regression escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — four wrong-kind mutations detected`);
  process.exit(0);
}

const found = failures(source);
if (found.length) {
  console.error(`${LABEL} FAIL\n- ${found.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — detention rows drill to exact load/customer/driver/unit records`);
