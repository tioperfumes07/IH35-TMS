#!/usr/bin/env node
/** USERS-F6343 — returning-dispatcher preflight must fail closed and visibly. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/Users.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[returningCheckError, setReturningCheckError\]/.test(text), "preflight error state required");
  need(/catch \(error\)[\s\S]{0,250}setReturningCheckError\([\s\S]{0,150}Could not check returning-dispatcher history/.test(text), "lookup failure must be captured");
  need(/if \(checkingReturningDispatcher \|\| returningCheckError\)[\s\S]{0,250}must be checked successfully/.test(text), "submit must fail closed");
  need(/role="alert"[\s\S]{0,250}Returning-dispatcher check failed: \{returningCheckError\}/.test(text), "failure must render accessibly");
  need(/disabled=\{createUserMutation\.isPending \|\| checkingReturningDispatcher \|\| Boolean\(returningCheckError\)\}/.test(text), "save must remain disabled while unknown");
  need(/setReturningCheckError\(null\)[\s\S]{0,200}checkReturningDispatcher/.test(text), "retry must clear stale failure");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-users-returning-check-fails-closed FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n\s*setReturningCheckError\(error instanceof Error[^\n]+/, ""),
    source.replace(/\n\s*if \(checkingReturningDispatcher \|\| returningCheckError\)[\s\S]*?\n\s*\}/, ""),
    source.replace(/\n\s*\{returningCheckError \? \([\s\S]*?\n\s*\) : null\}/, ""),
    source.replace("createUserMutation.isPending || checkingReturningDispatcher || Boolean(returningCheckError)", "createUserMutation.isPending"),
    source.replace("setReturningCheckError(null);\n      try", "try"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-users-returning-check-fails-closed SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-users-returning-check-fails-closed PASS — safety lookup fails closed and visibly");
