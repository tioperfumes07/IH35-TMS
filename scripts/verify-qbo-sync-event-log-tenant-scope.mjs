#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "apps/backend/src/qbo/sync-event-log.routes.ts");

function fail(messages) {
  console.error("verify:qbo-sync-event-log-tenant-scope — FAILED");
  for (const msg of messages) console.error(`- ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(target)) {
  fail([`missing file: ${target}`]);
}

const source = fs.readFileSync(target, "utf8");
const failures = [];

const queryRegex = /client\.query(?:\s*<[^>]+>)?\s*\(\s*`([\s\S]*?)`/g;
const sqlBlocks = [];
let match;
while ((match = queryRegex.exec(source)) !== null) {
  sqlBlocks.push(match[1]);
}

if (sqlBlocks.length === 0) {
  failures.push("no SQL query blocks found");
}

for (const [idx, sql] of sqlBlocks.entries()) {
  const hasTenantFilter = /operating_company_id/.test(sql);
  const delegatesToMerged = /\$\{merged\.sql\}/.test(sql);
  if (!hasTenantFilter && !delegatesToMerged) {
    failures.push(`SQL block #${idx + 1} missing operating_company_id tenant scope`);
  }
}

if (!/limit:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)/.test(source)) {
  failures.push("limit cap not enforced in query schema (expected max(200) default(50))");
}

if (!/\(occurred_at,\s*cursor_id\)\s*<\s*\(/.test(source)) {
  failures.push("cursor pagination keyset predicate missing (occurred_at, cursor_id) comparison");
}

if (/OFFSET\s+\$\d+|OFFSET\s+\d+/i.test(source)) {
  failures.push("OFFSET pagination detected; expected cursor-based pagination only");
}

if (failures.length > 0) {
  fail(failures);
}

console.log("verify:qbo-sync-event-log-tenant-scope — OK");
