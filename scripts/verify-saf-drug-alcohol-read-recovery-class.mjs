#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["connectivity"],"leaves":["drug_alcohol.list"],"task":"SAF-F6367-DRUG-ALCOHOL-READ-RECOVERY-CLASS","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-drug-alcohol-read-recovery-class";
const FILE_REQUIREMENTS = {
  "apps/frontend/src/pages/safety/ReturnToDuty.tsx": [
    "onRetry={() => void rtdQ.refetch()}",
    "onRetry={() => void resultsQ.refetch()}",
  ],
  "apps/frontend/src/pages/safety/RandomTestingPool.tsx": [
    "onRetry={() => void poolQ.refetch()}",
    "onRetry={() => void drawsQ.refetch()}",
  ],
  "apps/frontend/src/pages/safety/drug-alcohol/RandomPoolDashboard.tsx": [
    "drawsQ.isError",
    "onRetry={() => void drawsQ.refetch()}",
  ],
  "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx": [
    "onRetry={() => void activeDriverTotalQ.refetch()}",
    "drugStatusQ.isError ? drugStatusQ.refetch() : Promise.resolve()",
    "eligibilityQ.isError ? eligibilityQ.refetch() : Promise.resolve()",
    "rtdCaseQ.isError ? rtdCaseQ.refetch() : Promise.resolve()",
    "onRetry={() => void testsQ.refetch()}",
    "onRetry={() => void poolQ.refetch()}",
    "onRetry={() => void clearinghouseQ.refetch()}",
  ],
};

function loadSources() {
  return Object.fromEntries(
    Object.keys(FILE_REQUIREMENTS).map((file) => [
      file,
      fs.readFileSync(path.join(process.cwd(), file), "utf8"),
    ]),
  );
}

function verify(sources) {
  const errors = [];
  for (const [file, needles] of Object.entries(FILE_REQUIREMENTS)) {
    const source = sources[file] ?? "";
    for (const needle of ["ListErrorState", ...needles]) {
      if (!source.includes(needle)) errors.push(`${file}: missing ${needle}`);
    }
  }

  const matrix = JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "docs/specs/scoreboard/modules/safety.required.json",
      ),
      "utf8",
    ),
  );
  const leaf = matrix.leaves?.find(
    (candidate) => candidate.id === "drug_alcohol.list",
  );
  if (!leaf?.required?.includes("connectivity")) {
    errors.push(
      "safety.required.json: drug_alcohol.list must require connectivity",
    );
  }
  return errors;
}

const sources = loadSources();
if (process.argv.includes("--selftest")) {
  for (const [file, needles] of Object.entries(FILE_REQUIREMENTS)) {
    for (const needle of needles) {
      const mutated = {
        ...sources,
        [file]: sources[file].replace(needle, "/* planted missing retry */"),
      };
      if (verify(mutated).length === 0) {
        console.error(
          `${LABEL} SELFTEST FAIL: mutation survived ${file} :: ${needle}`,
        );
        process.exit(1);
      }
    }
  }
  console.log(
    `${LABEL} selftest PASS — every one of 12 exact read recoveries is ratcheted`,
  );
  process.exit(0);
}

const errors = verify(sources);
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — safety:drug_alcohol.list exposes 12 exact-query retry paths`,
);
