#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["queues.detention"],"task":"DISP-F5848-DETENTION-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-dispatch-detention-reverse-links";
const TARGET = "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx";
const MATRIX = "docs/specs/scoreboard/modules/dispatch.required.json";
const SELF = "scripts/verify-dispatch-detention-reverse-links.mjs";

export function failures(source, matrixSource, selfSource) {
  const required = [
    ["load", /<EntityLinkOrTombstone kind="load" id=\{event\.load_id\} name=\{event\.load_number\} noun="Load"/],
    ["customer", /<EntityLinkOrTombstone kind="customer" id=\{event\.customer_id\} name=\{event\.customer_name\} noun="Customer"/],
    ["driver", /<EntityLinkOrTombstone kind="driver" id=\{event\.driver_id\} name=\{event\.driver_name\} noun="Driver"/],
    ["unit", /<EntityLinkOrTombstone kind="unit" id=\{event\.unit_id\} name=\{event\.unit_number\} noun="Unit"/],
  ];
  const found = required
    .filter(([, pattern]) => !pattern.test(source))
    .map(([kind]) => `${TARGET}: detention rows must preserve the canonical ${kind} resolved-link/tombstone policy`);
  const matrix = JSON.parse(matrixSource);
  const leaf = matrix.leaves?.find((candidate) => candidate.id === "queues.detention");
  if (!leaf?.required?.includes("reverse_link")) {
    found.push(`${MATRIX}: queues.detention must require reverse_link`);
  }
  const annotationLines = selfSource.split("\n").filter((line) => line.includes("@matrix-built"));
  if (!annotationLines.includes('/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["queues.detention"],"task":"DISP-F5848-DETENTION-REVERSE-EXACT-LEAF","vertical":"column-wave"} */')) {
    found.push(`${SELF}: Built annotation must credit only queues.detention:reverse_link`);
  }
  return found;
}

const source = fs.readFileSync(TARGET, "utf8");
const matrixSource = fs.readFileSync(MATRIX, "utf8");
const selfSource = fs.readFileSync(SELF, "utf8");

if (process.argv.includes("--selftest")) {
  const baseline = failures(source, matrixSource, selfSource);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — repository baseline is red:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  for (const kind of ["load", "customer", "driver", "unit"]) {
    const planted = source.replace(`kind="${kind}"`, 'kind="audit_event"');
    if (planted === source || !failures(planted, matrixSource, selfSource).some((failure) => failure.includes(`canonical ${kind} resolved-link/tombstone policy`))) {
      console.error(`${LABEL} SELFTEST FAIL — planted ${kind} regression escaped`);
      process.exit(1);
    }
  }
  const matrix = JSON.parse(matrixSource);
  const leaf = matrix.leaves.find((candidate) => candidate.id === "queues.detention");
  leaf.required = leaf.required.filter((column) => column !== "reverse_link");
  if (!failures(source, JSON.stringify(matrix), selfSource).some((failure) => failure.includes("must require reverse_link"))) {
    console.error(`${LABEL} SELFTEST FAIL — removed Required reverse_link escaped`);
    process.exit(1);
  }
  const plantedSelf = selfSource.replace('"leaves":["queues.detention"]', '"leaves":["queues.late"]');
  if (plantedSelf === selfSource || !failures(source, matrixSource, plantedSelf).some((failure) => failure.includes("Built annotation"))) {
    console.error(`${LABEL} SELFTEST FAIL — wrong exact Built leaf escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 6/6 runtime and exact-leaf contract mutations detected`);
  process.exit(0);
}

const found = failures(source, matrixSource, selfSource);
if (found.length) {
  console.error(`${LABEL} FAIL\n- ${found.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — detention rows drill to exact resolved load/customer/driver/unit records and tombstone unavailable identities`);
