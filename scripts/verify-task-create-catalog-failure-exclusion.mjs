#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/tasks/CreateTaskModal.tsx";
const contracts = [
  "usersQuery.isError ? [] : usersQuery.data?.users ?? []",
  "profilesQuery.isError ? [] : profilesQuery.data?.types ?? []",
  "if (usersQuery.isError) setAssignedTo(\"\")",
  "if (profilesQuery.isError) setTaskTypeId(\"\")",
  "disabled={profilesQuery.isError}",
  "onRetry={() => void profilesQuery.refetch()}",
  "disabled={usersQuery.isError}",
  "onRetry={() => void usersQuery.refetch()}",
];
const check = (source) => contracts.filter((contract) => !source.includes(contract));
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(file, "utf8");
  for (const contract of contracts) {
    const mutated = source.replace(contract, "");
    if (mutated === source || check(mutated).length === 0) process.exit(1);
  }
  console.log(`verify-task-create-catalog-failure-exclusion SELFTEST PASS — ${contracts.length}/${contracts.length} exact mutations red`);
  process.exit(0);
}
const missing = check(fs.readFileSync(file, "utf8"));
if (missing.length) {
  console.error(`verify-task-create-catalog-failure-exclusion FAIL\n- ${missing.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-task-create-catalog-failure-exclusion PASS — task profile/assignee creators fail closed and retry honestly");
