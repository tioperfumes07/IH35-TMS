#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [
  "CustomerFactoringReverseSection.tsx",
  "CustomerFactoringQueueReverseSection.tsx",
  "CustomerFactoringRecourseReverseSection.tsx",
  "CustomerFactoringSubmitQueueReverseSection.tsx",
];

function readSources() {
  return new Map(files.map((name) => [name, fs.readFileSync(path.join(root, "apps/frontend/src/components/customers", name), "utf8")]));
}

function verify(sources) {
  const failures = [];
  for (const name of files) {
    const source = sources.get(name) ?? "";
    if (!source.includes('from "../ListErrorState"')) failures.push(`${name}: canonical ListErrorState import missing`);
    if (!source.includes("<ListErrorState")) failures.push(`${name}: retryable error state missing`);
    if (!source.includes("onRetry={() =>")) failures.push(`${name}: retry callback missing`);
    if (!source.includes(".refetch()")) failures.push(`${name}: query refetch binding missing`);
  }
  return failures;
}

const sources = readSources();
const failures = verify(sources);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const name of files) {
    const mutated = new Map(sources);
    mutated.set(name, mutated.get(name).replace("onRetry={() =>", "onRecover={() =>"));
    if (verify(mutated).some((failure) => failure.startsWith(`${name}:`))) caught += 1;
  }
  if (caught !== files.length) {
    console.error(`selftest caught ${caught}/${files.length} planted retry regressions`);
    process.exit(1);
  }
  console.log(`PASS selftest: ${caught}/${files.length} planted retry regressions caught`);
} else {
  console.log(`PASS: ${files.length}/${files.length} customer factoring reverse panels have canonical retry recovery`);
}
