#!/usr/bin/env node
/**
 * @matrix-built {"modules":["system","fuel"],"cols":["reverse_link"],"leafRe":"^(system\\.samsara_hos_driver_map|card_overage)$","task":"LINK-F5131-EXCEPTION-TABLE-IDENTITY-REVERSE-LINKS","vertical":"class-sweep"}
 */
import fs from "node:fs";

const LABEL = "verify-exception-table-identity-reverse-links";
const FILES = {
  samsara: "apps/frontend/src/pages/samsara-vendor-mapping/HosDriverMapPreviewPage.tsx",
  fuel: "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
  resolver: "apps/frontend/src/components/shared/EntityLink.tsx",
};
const sources = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function check(src) {
  const failures = [];
  const must = (key, re, message) => { if (!re.test(src[key])) failures.push(`${FILES[key]}: ${message}`); };
  must("samsara", /<EntityLink\s+kind="driver"\s+id=\{row\.local_driver_id\}/, "mapping row must drill canonical local driver");
  must("fuel", /<EntityLink\s+kind="driver"\s+id=\{row\.driver_id \?\? undefined\}/, "overage row must drill driver FK");
  must("fuel", /<EntityLink\s+kind="unit"\s+id=\{row\.unit_id \?\? undefined\}/, "overage row must drill unit FK");
  must("resolver", /case\s+"driver"[\s\S]{0,180}\/drivers\//, "driver resolver must retain canonical route");
  must("resolver", /case\s+"unit"[\s\S]{0,180}\/fleet\//, "unit resolver must retain canonical route");
  return failures;
}

if (process.argv.includes("--self-test")) {
  const mutations = [
    ["samsara", 'kind="driver"', 'kind="vendor"'],
    ["samsara", "id={row.local_driver_id}", "id={undefined}"],
    ["fuel", 'kind="driver"', 'kind="customer"'],
    ["fuel", "id={row.driver_id ?? undefined}", "id={undefined}"],
    ["fuel", 'kind="unit"', 'kind="load"'],
    ["fuel", "id={row.unit_id ?? undefined}", "id={undefined}"],
  ];
  const missed = [];
  for (const [key, needle, replacement] of mutations) {
    if (!sources[key].includes(needle)) { missed.push(`${key}: missing mutation anchor ${needle}`); continue; }
    if (check({ ...sources, [key]: sources[key].replace(needle, replacement) }).length === 0) missed.push(`${key}: planted defect escaped ${needle}`);
  }
  if (missed.length) { console.error(`${LABEL} SELFTEST FAIL\n${missed.join("\n")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) { console.error(`${LABEL} FAIL\n${failures.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — exception/reconciliation identity columns drill through canonical FKs`);
