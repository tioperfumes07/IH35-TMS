#!/usr/bin/env node
import fs from "node:fs";

const label = "verify-secondary-nav-tabs-overflow-hit-target";
const file = "apps/frontend/src/components/shared/SecondaryNavTabs.tsx";
const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function verify(text) {
  const failures = [];
  if (!text.includes('className="relative flex min-w-max gap-4"')) {
    failures.push("secondary-nav inner track must establish a positioning context");
  }
  if (!text.includes("relative z-10 pb-0.5 text-xs font-semibold")) {
    failures.push("secondary-nav buttons must stay above the overflow scroller hit layer");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const planted = source
    .replace('className="relative flex min-w-max gap-4"', 'className="flex min-w-max gap-4"')
    .replace("relative z-10 pb-0.5 text-xs font-semibold", "pb-0.5 text-xs font-semibold");
  const failures = verify(planted);
  if (failures.length !== 2) {
    console.error(`${label}: FAIL selftest expected 2 failures, received ${failures.length}`);
    process.exit(1);
  }
  console.log(`${label}: PASS selftest`);
  process.exit(0);
}

const failures = verify(source);
if (failures.length) {
  failures.forEach((failure) => console.error(`${label}: FAIL ${failure}`));
  process.exit(1);
}
console.log(`${label}: PASS`);
