#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(ROOT, "db/migrations/0058_p3_t11_16_1_reports_infrastructure.sql");
const runnerPath = path.join(ROOT, "apps/backend/src/reports/scheduled-report-runner.ts");

function fail(message) {
  console.error(`verify:scheduled-report-recipients-resolved FAIL: ${message}`);
  process.exit(1);
}

const VALID_ROLES = new Set(["Owner", "Accountant", "Safety"]);

const seedBlock = fs.readFileSync(migrationPath, "utf8");
const valueRows = [...seedBlock.matchAll(/\('([^']+)',\s*'([^']+)',\s*'([^']*)',\s*ARRAY\[([^\]]*)\]/g)];

if (valueRows.length === 0) fail("could not parse seeded scheduled_reports from migration 0058");

const runnerSrc = fs.readFileSync(runnerPath, "utf8");
const recipientMapMatch = runnerSrc.match(/RECIPIENT_BY_ROLE[^=]*=\s*\{([^}]+)\}/s);
if (!recipientMapMatch) fail("RECIPIENT_BY_ROLE map not found in scheduled-report-runner.ts");

const recipientEntries = [...recipientMapMatch[1].matchAll(/(\w+):\s*"([^"]+)"/g)];
const recipientByRole = Object.fromEntries(recipientEntries.map((m) => [m[1], m[2]]));

for (const [, reportId, , rolesRaw] of valueRows) {
  const roles = [...rolesRaw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (roles.length === 0) fail(`seed ${reportId} has no recipient_roles`);

  for (const role of roles) {
    if (!VALID_ROLES.has(role)) fail(`seed ${reportId} references unknown role ${role}`);
    const email = recipientByRole[role];
    if (!email || !email.includes("@")) {
      fail(`seed ${reportId} role ${role} has no resolvable email in RECIPIENT_BY_ROLE`);
    }
  }
}

console.log(`verify:scheduled-report-recipients-resolved PASS (${valueRows.length} seeds)`);
