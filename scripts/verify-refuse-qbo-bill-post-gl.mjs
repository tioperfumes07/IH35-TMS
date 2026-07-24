#!/usr/bin/env node
/**
 * Guard: refuse Bill→GL post for source_system='qbo' (parallel books).
 *
 * After QBO AP bill_lines projection, empty lines no longer accidentally block post-gl.
 * BILL_GL_POSTING_ENABLED is ON for live entities — posting a QBO-origin bill would invent
 * a second TMS JE for economics already in QBO. This refuse is the structural control.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-refuse-qbo-bill-post-gl";
const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const engine = read("apps/backend/src/accounting/posting-engine.service.ts");
const routes = read("apps/backend/src/accounting/posting-engine.routes.ts");

if (!/QBO_BILL_POST_GL_REFUSED/.test(engine)) {
  failures.push("posting-engine must define QBO_BILL_POST_GL_REFUSED error code");
}
if (!/source_system[\s\S]{0,200}=== ["']qbo["']/.test(engine) && !/\.toLowerCase\(\)\s*===\s*["']qbo["']/.test(engine)) {
  failures.push("buildBillLines must refuse when bill.source_system is qbo");
}
if (!/QBO_BILL_POST_GL_REFUSED/.test(routes)) {
  failures.push("posting-engine.routes must map QBO_BILL_POST_GL_REFUSED to HTTP 409");
}
if (/INSERT INTO accounting\.journal_entries[\s\S]{0,400}source_system\s*=\s*['\"]qbo['\"]/.test(engine)) {
  failures.push("must not invent journal entries for qbo bills in the refuse path");
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (QBO-origin bills refused for Bill→GL post)`);
