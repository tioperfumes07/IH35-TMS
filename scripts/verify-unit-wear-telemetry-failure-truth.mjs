#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.detail.brakes","unit.detail.tires"],"task":"FLEET-F6070-UNIT-WEAR-TELEMETRY-FAILURE-TRUTH","vertical":"class-sweep"} */
import fs from "node:fs";

const LABEL = "verify-unit-wear-telemetry-failure-truth";
const paths = {
  brakes: "apps/frontend/src/pages/maintenance/units/UnitBrakesTab.tsx",
  tires: "apps/frontend/src/pages/maintenance/units/UnitTiresTab.tsx",
};
const files = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));

function audit(source = files) {
  const failures = [];
  for (const [file, queries] of [["brakes", ["latestQ", "projectionsQ"]], ["tires", ["measurementsQ", "projectionsQ"]]]) {
    for (const query of queries) {
      if (!new RegExp(`${query}\\.isError[\\s\\S]*onRetry=\\{\\(\\) => void ${query}\\.refetch\\(\\)\\}`).test(source[file])) {
        failures.push(`${file}:${query} exact recovery`);
      }
    }
  }
  if (!/positions\.length === 0[\s\S]{0,180}!latestQ\.isError[\s\S]{0,100}!projectionsQ\.isError/.test(source.brakes)) failures.push("brakes error-before-empty");
  if (!/!measurementsQ\.isError && !projectionsQ\.isError \? \([\s\S]{0,500}data-testid="unit-tires-telemetry"/.test(source.tires)) {
    failures.push("tires failed reads suppress retained telemetry");
  }
  if (!/!latestQ\.isError && !projectionsQ\.isError \? \([\s\S]{0,160}data-testid="unit-brakes-telemetry"/.test(source.brakes)) {
    failures.push("brakes failed reads suppress retained telemetry");
  }
  if (!/useEffect\(\(\) => \{\s*setSelectedPosition\(""\);\s*\}, \[unitId, companyId\]\)/.test(source.tires)) {
    failures.push("tires selected position resets on unit/company transition");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["brakes", "onRetry={() => void latestQ.refetch()}"],
    ["brakes", "onRetry={() => void projectionsQ.refetch()}"],
    ["tires", "onRetry={() => void measurementsQ.refetch()}"],
    ["tires", "onRetry={() => void projectionsQ.refetch()}"],
    ["tires", 'setSelectedPosition("");'],
    ["tires", '!measurementsQ.isError && !projectionsQ.isError ? ('],
    ["brakes", '!latestQ.isError && !projectionsQ.isError ? ('],
  ];
  for (const [file, needle] of mutations) {
    const changed = { ...files, [file]: files[file].replace(needle, "") };
    if (changed[file] === files[file] || audit(changed).length === 0) throw new Error(`planted ${file}:${needle} defect escaped`);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — unit brake+tire measurement/projection failures recover exactly before true empty`);
