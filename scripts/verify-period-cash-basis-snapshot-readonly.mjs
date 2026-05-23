#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const backendRoot = path.join(process.cwd(), "apps/backend/src");
const allowedWriter = "apps/backend/src/accounting/cash-basis/period-close-snapshot.service.ts";

function fail(messages) {
  console.error("verify:period-cash-basis-snapshot-readonly — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

function collectFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".js"))) out.push(full);
  }
  return out;
}

const failures = [];
const files = collectFiles(backendRoot);
let writerHasInsert = false;
for (const file of files) {
  const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
  if (rel.includes("/__tests__/")) continue;
  const source = fs.readFileSync(file, "utf8");
  if (!/period_cash_basis_snapshot/.test(source)) continue;
  const hasWrite = /INSERT\s+INTO\s+accounting\.period_cash_basis_snapshot|UPDATE\s+accounting\.period_cash_basis_snapshot|DELETE\s+FROM\s+accounting\.period_cash_basis_snapshot/i.test(source);
  if (!hasWrite) continue;
  if (rel !== allowedWriter) failures.push(`snapshot write detected outside close-time writer: ${rel}`);
  if (rel === allowedWriter && /INSERT\s+INTO\s+accounting\.period_cash_basis_snapshot/i.test(source)) writerHasInsert = true;
}

if (!writerHasInsert) {
  failures.push(`allowed writer missing INSERT path: ${allowedWriter}`);
}

if (failures.length > 0) fail(failures);
console.log("verify:period-cash-basis-snapshot-readonly — OK");
