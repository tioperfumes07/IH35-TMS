#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(lines) {
  console.error("verify:tms-bill-line-item-shape — FAILED");
  for (const line of lines) console.error(`- ${line}`);
  process.exit(1);
}

function read(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) throw new Error(`missing file: ${relPath}`);
  return fs.readFileSync(full, "utf8");
}

let handler = "";
let translator = "";

try {
  handler = read("apps/backend/src/outbox/handlers/tms-bill-push.handler.ts");
  translator = read("apps/backend/src/integrations/qbo/translators/bill.ts");
} catch (error) {
  fail([String(error instanceof Error ? error.message : error)]);
}

const failures = [];

if (!handler.includes("buildQboBillPayload(")) {
  failures.push("apps/backend/src/outbox/handlers/tms-bill-push.handler.ts:1 handler must build payload using buildQboBillPayload");
}
if (!handler.includes("amountCents") || !handler.includes("accountQboId") || !handler.includes("description")) {
  failures.push("apps/backend/src/outbox/handlers/tms-bill-push.handler.ts:1 resolved line shape must include amountCents/accountQboId/description");
}
if (!handler.includes("bill_line_account_qbo_id_missing")) {
  failures.push("apps/backend/src/outbox/handlers/tms-bill-push.handler.ts:1 handler must fail fast when a line account cannot be resolved");
}
if (!translator.includes("AccountBasedExpenseLineDetail") || !translator.includes("AccountRef")) {
  failures.push("apps/backend/src/integrations/qbo/translators/bill.ts:1 bill translator must emit AccountBasedExpenseLineDetail with AccountRef");
}
if (!translator.includes("DueDate")) {
  failures.push("apps/backend/src/integrations/qbo/translators/bill.ts:1 bill payload must support DueDate");
}

if (failures.length > 0) fail(failures);

console.log("verify:tms-bill-line-item-shape — OK");
