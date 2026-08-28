#!/usr/bin/env node
import fs from "node:fs";

const contracts = [
  {
    file: "apps/frontend/src/components/safety/AccidentReportDrawer.tsx",
    rows: /accidentTypeRows\s*=\s*accidentTypesQuery\.isError\s*\?\s*\[\]/,
    disabled: /disabled=\{accidentTypesQuery\.isError\}/,
    retry: /Accident types could not be loaded[\s\S]*accidentTypesQuery\.refetch/,
  },
  {
    file: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
    rows: /complaintTypeRows\s*=\s*complaintTypesQuery\.isError\s*\?\s*\[\]/,
    disabled: /disabled=\{complaintTypesQuery\.isError\}/,
    retry: /Complaint types could not be loaded[\s\S]*complaintTypesQuery\.refetch/,
  },
];

function findings(read) {
  const out = [];
  for (const contract of contracts) {
    const source = read(contract.file);
    if (!contract.rows.test(source)) out.push(`${contract.file}: cached catalog rows remain selectable after failed refetch`);
    if (!contract.disabled.test(source)) out.push(`${contract.file}: picker is active while catalog read is failed`);
    if (!contract.retry.test(source)) out.push(`${contract.file}: catalog failure has no exact Retry path`);
  }
  return out;
}

const baseline = new Map(contracts.map(({ file }) => [file, fs.readFileSync(file, "utf8")]));
const clean = findings((file) => baseline.get(file));
if (clean.length) {
  console.error(clean.join("\n"));
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const planted = new Map(baseline);
  const file = contracts[0].file;
  planted.set(file, planted.get(file).replace("accidentTypesQuery.isError ? []", "false ? []"));
  if (!findings((name) => planted.get(name)).some((line) => line.includes("cached catalog rows"))) {
    console.error("selftest failed: stale-row mutation escaped");
    process.exit(1);
  }
}
console.log(`verify-safety-incident-catalog-read-recovery: PASS (${contracts.length} consumers${process.argv.includes("--selftest") ? ", mutation caught" : ""})`);
