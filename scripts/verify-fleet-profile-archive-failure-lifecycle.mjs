#!/usr/bin/env node
import fs from "node:fs";

const files = [
  "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
];

function problems(read = (file) => fs.readFileSync(file, "utf8")) {
  const failures = [];
  for (const file of files) {
    const source = read(file);
    const label = file.includes("Vehicle") ? "unit" : "trailer";
    if (!/<ConfirmModal[\s\S]*?title="Archive (?:unit|trailer)"/.test(source)) {
      failures.push(`${label} profile archive confirmation is missing`);
    }
    if (!/onConfirm=\{async \(\) => \{[\s\S]{0,500}?await archiveMutation\.mutateAsync\(/.test(source)) {
      failures.push(`${label} profile confirmation does not await the canonical archive mutation`);
    }
    const handler = source.match(/onConfirm=\{async \(\) => \{[\s\S]{0,650}?\n\s*\}\}/)?.[0] ?? "";
    if (/\.catch\s*\(/.test(handler)) {
      failures.push(`${label} profile swallows archive rejection, so ConfirmModal closes on failed write`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
  let rejected = 0;
  for (const target of files) {
    const mutated = { ...live, [target]: live[target].replace(
      /await archiveMutation\.mutateAsync\(([^;]+)\);/,
      "await archiveMutation.mutateAsync($1).catch(() => undefined);"
    ) };
    if (problems((file) => mutated[file]).length > 0) rejected += 1;
  }
  if (rejected !== files.length) {
    console.error(`verify-fleet-profile-archive-failure-lifecycle SELFTEST FAILED — ${rejected}/${files.length} swallowed-rejection mutations rejected`);
    process.exit(1);
  }
  console.log(`verify-fleet-profile-archive-failure-lifecycle SELFTEST PASS — ${rejected}/${files.length} swallowed-rejection mutations rejected`);
  process.exit(0);
}

const failures = problems();
if (failures.length) {
  console.error(`verify-fleet-profile-archive-failure-lifecycle FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log("verify-fleet-profile-archive-failure-lifecycle PASS — unit and trailer archive failures remain open and retryable");
