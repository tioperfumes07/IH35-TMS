#!/usr/bin/env node
/**
 * verify-saf-drug-alcohol-tab-query-error-surface
 * SAF-DRUG-ALCOHOL-TAB-QUERY-ERROR — list/driver query failures must not look empty/clear.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-drug-alcohol-tab-query-error-surface";
const FILE = "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx";
const NEEDLES = [
  "userFacingApiError",
  "testsQ.isError",
  "poolQ.isError",
  "clearinghouseQ.isError",
  "drug-alcohol-active-driver-total-query-error",
  "drug-alcohol-tests-query-error",
  "drug-alcohol-pool-query-error",
  "drug-alcohol-clearinghouse-query-error",
  "drug-alcohol-driver-detail-query-error",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles
    .filter((n) => !src.includes(n))
    .map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `{(poolQ.data ?? []).length === 0 ? <li className="text-slate-500">No pool entries.</li> : null}`;
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-da-tab-query-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (
      assertFile(".tmp-da-tab-query-selftest.tsx", ["poolQ.isError"]).length ===
      0
    ) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-da-tab-query-selftest.tsx", NEEDLES).length > 0) {
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
console.log(
  `${LABEL} PASS — DrugAlcoholTab surfaces list/driver query isError`,
);
