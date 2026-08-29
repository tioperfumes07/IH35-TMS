#!/usr/bin/env node
import fs from "node:fs";

const rel = "apps/frontend/src/pages/drivers/RetentionDashboard.tsx";
const source = fs.readFileSync(rel, "utf8");

function audit(src) {
  const failures = [];
  if (!src.includes("const rows = scoresQ.isError ? [] : scoresQ.data?.rows ?? []")) failures.push("failed retention reads must suppress cached driver cards");
  if (!src.includes('title="Couldn\'t load retention scores"')) failures.push("failed retention reads need an exact visible error");
  if (!src.includes("onRetry={() => void scoresQ.refetch()}")) failures.push("retention failure state needs exact Retry");
  if (!src.includes("rows.map((row) =>")) failures.push("successful rows must still render canonical cards");
  if (!src.includes("entityLabel(row.driver_name, row.driver_uuid, \"Driver\")")) failures.push("cards must retain human driver labels");
  if (!src.includes("scoresQ.isSuccess && rows.length === 0")) failures.push("successful zero-row reads need an exact empty-state branch");
  if (!src.includes('data-testid="driver-retention-empty-state"')) failures.push("retention empty state needs a stable semantic hook");
  if (!src.includes("No at-risk drivers")) failures.push("retention empty state needs honest user-facing copy");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["restore cached rows on failure", "const rows = scoresQ.isError ? [] : scoresQ.data?.rows ?? []", "const rows = scoresQ.data?.rows ?? []"],
    ["remove Retry", "onRetry={() => void scoresQ.refetch()}", "onRetry={undefined}"],
    ["remove human label", 'entityLabel(row.driver_name, row.driver_uuid, "Driver")', "row.driver_uuid"],
    ["remove successful empty state", "scoresQ.isSuccess && rows.length === 0", "false"],
    ["remove empty-state copy", "No at-risk drivers", ""],
  ];
  const missed = mutations.filter(([, from, to]) => audit(source.replace(from, to)).length === 0);
  if (missed.length) {
    console.error(`verify-driver-retention-failure-exclusion SELFTEST FAILED: ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-driver-retention-failure-exclusion selftest PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-driver-retention-failure-exclusion FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-driver-retention-failure-exclusion PASS — failed reads expose Retry and successful zero-row reads expose an honest empty state");
