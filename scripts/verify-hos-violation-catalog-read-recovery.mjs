#!/usr/bin/env node
import fs from "node:fs";

const files = [
  "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx",
  "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx",
];

function findings(read) {
  const out = [];
  for (const file of files) {
    const source = read(file);
    if (!/violationTypeRows\s*=\s*violationTypesQuery\.isError\s*\?\s*\[\]/.test(source)) {
      out.push(`${file}: cached DOT violation rows remain available after a failed refetch`);
    }
    if (!/disabled=\{[^}]*violationTypesQuery\.isError/.test(source)) {
      out.push(`${file}: DOT violation picker is not disabled while its scoped read is failed`);
    }
  }
  const modal = read(files[1]);
  if (!/Violation types could not be loaded[\s\S]*violationTypesQuery\.refetch/.test(modal)) {
    out.push(`${files[1]}: modal has no visible Retry path for catalog read failure`);
  }
  return out;
}

const selftest = process.argv.includes("--selftest");
const baseline = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
const clean = findings((file) => baseline.get(file));
if (clean.length) {
  console.error(clean.join("\n"));
  process.exit(1);
}

if (selftest) {
  const planted = new Map(baseline);
  planted.set(files[1], planted.get(files[1]).replace("violationTypesQuery.isError ? []", "false ? []"));
  const caught = findings((file) => planted.get(file));
  if (!caught.some((line) => line.includes("cached DOT violation rows"))) {
    console.error("selftest failed: planted stale-row regression was not detected");
    process.exit(1);
  }
}

console.log(`verify-hos-violation-catalog-read-recovery: PASS (${files.length} consumers${selftest ? ", mutation caught" : ""})`);
