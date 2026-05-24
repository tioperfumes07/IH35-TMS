#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const servicePath = path.join(process.cwd(), "apps/backend/src/accounting/collections.service.ts");
const routesPath = path.join(process.cwd(), "apps/backend/src/accounting/collections.routes.ts");
const cronPath = path.join(process.cwd(), "apps/backend/src/cron/collections-sync.cron.ts");

const failures = [];
for (const file of [servicePath, routesPath, cronPath]) {
  if (!fs.existsSync(file)) failures.push(`missing required file: ${file}`);
}

if (failures.length === 0) {
  const source = [servicePath, routesPath, cronPath].map((file) => fs.readFileSync(file, "utf8").toLowerCase()).join("\n");
  const forbiddenTokens = [
    "posting-engine",
    "journal-entry-qbo-push",
    "qbo-writer",
    "insert into accounting.journal_entries",
    "update accounting.journal_entries",
    "delete from accounting.journal_entries",
  ];
  for (const token of forbiddenTokens) {
    if (source.includes(token)) failures.push(`forbidden token found: ${token}`);
  }
}

if (failures.length > 0) {
  console.error("verify:collections-readonly — FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("verify:collections-readonly — OK");
