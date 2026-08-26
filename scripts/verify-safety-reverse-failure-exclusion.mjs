#!/usr/bin/env node
import fs from "node:fs";

const FILES = {
  cargo: "apps/frontend/src/components/safety/CustomerCargoClaimsReverseSection.tsx",
  hos: "apps/frontend/src/components/safety/DriverHosViolationsReverseSection.tsx",
};
const live = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(source) {
  const problems = [];
  if (!/const incidents = query\.isError \? \[\] : \(query\.data\?\.incidents \?\? \[\]\)/.test(source.cargo) || !/\{incidents\.map\(/.test(source.cargo)) problems.push("customer cargo-claim reverse failure exclusion");
  if (!/const violations = query\.isError \? \[\] : \(query\.data\?\.hos_violations \?\? \[\]\)/.test(source.hos) || !/\{violations\.map\(/.test(source.hos)) problems.push("driver HOS reverse failure exclusion");
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["cargo", "query.isError ? [] : (query.data?.incidents ?? [])", "query.data?.incidents ?? []"],
    ["hos", "query.isError ? [] : (query.data?.hos_violations ?? [])", "query.data?.hos_violations ?? []"],
  ];
  for (const [key, needle, replacement] of mutations) {
    const mutated = { ...live, [key]: live[key].replace(needle, replacement) };
    if (mutated[key] === live[key] || failures(mutated).length === 0) {
      console.error(`verify-safety-reverse-failure-exclusion SELFTEST FAIL — ${key} mutation stayed green`);
      process.exit(1);
    }
  }
  console.log("verify-safety-reverse-failure-exclusion SELFTEST PASS — 2/2 stale-row mutations red");
  process.exit(0);
}

const problems = failures(live);
if (problems.length) {
  console.error(`verify-safety-reverse-failure-exclusion FAIL — ${problems.join(", ")}`);
  process.exit(1);
}
console.log("verify-safety-reverse-failure-exclusion PASS — customer cargo and driver HOS reverse reads fail closed");
