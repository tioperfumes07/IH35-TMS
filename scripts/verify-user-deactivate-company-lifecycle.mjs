#!/usr/bin/env node
/** @matrix-built {"modules":["users"],"cols":["connectivity"],"leaves":["deactivate"],"task":"USERS-F6622-DEACTIVATE-COMPANY-LIFECYCLE","vertical":"column-wave"} */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/Users.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/deactivateGenerationRef = useRef\(0\)/, "missing deactivate generation"],
    [/pendingDeactivate, setPendingDeactivate/, "missing immutable deactivate snapshot"],
    [/deactivateUser\(input\.userId, input\.companyId\)/, "deactivate writer uses mutable user/company"],
    [/onSuccess: \(_result, input\) => \{[\s\S]*input\.generation !== deactivateGenerationRef\.current/, "stale deactivate success can leak"],
    [/onError: \(error, input\) => \{[\s\S]*input\.generation !== deactivateGenerationRef\.current/, "stale deactivate error can leak"],
    [/deactivateGenerationRef\.current \+= 1;[\s\S]*setPendingDeactivate\(null\);[\s\S]*deactivateMutation\.reset\(\);[\s\S]*\}, \[selectedCompanyId\]\)/, "company switch leaves stale deactivate state"],
    [/setPendingDeactivate\(\{[\s\S]*userId: row\.id,[\s\S]*userName: row\.name \|\| "this user",[\s\S]*companyId: selectedCompanyId,[\s\S]*generation: deactivateGenerationRef\.current/, "row action does not snapshot user/company/generation"],
    [/<ConfirmModal[\s\S]*title="Deactivate this user\?"[\s\S]*await deactivateMutation\.mutateAsync\(pendingDeactivate\)/, "deactivate lacks awaited confirmation write"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  if (/window\.confirm\(/.test(value)) failures.push("native confirmation still blocks user deactivation");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "deactivateGenerationRef = useRef(0)",
    "pendingDeactivate, setPendingDeactivate",
    "deactivateUser(input.userId, input.companyId)",
    "input.generation !== deactivateGenerationRef.current",
    "deactivateGenerationRef.current += 1;",
    "userId: row.id,",
    "<ConfirmModal",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-user-deactivate-company-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-user-deactivate-company-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-user-deactivate-company-lifecycle PASS — deactivate is isolated to its submitted user/company lifecycle");
