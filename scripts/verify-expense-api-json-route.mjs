#!/usr/bin/env node
import fs from "node:fs";

const client = fs.readFileSync("apps/frontend/src/api/client.ts", "utf8");
const accounting = fs.readFileSync("apps/frontend/src/api/accounting.ts", "utf8");

const checks = [
  ["expense uses shared API request", /export function createExpense[\s\S]*apiRequest<[\s\S]*"\/api\/v1\/expenses"/.test(accounting)],
  ["production SPA host falls back to API host", /hostname === "app\.ih35dispatch\.com"[\s\S]{0,150}https:\/\/api\.ih35dispatch\.com/.test(client)],
  ["mutating 200 HTML is rejected", /response\.ok && MUTATING_METHODS\.has\(method\) && !isJson/.test(client)],
  ["non-JSON failure is user-facing", client.includes("the record was not confirmed saved")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log(`verify-expense-api-json-route: ${checks.length}/${checks.length} PASS`);
