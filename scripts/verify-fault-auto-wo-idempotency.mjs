#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processor = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/integrations/samsara/fault-code-processor.service.ts"),
  "utf8"
);

if (!processor.includes("raw_event_id")) {
  console.error("verify:fault-auto-wo-idempotency FAIL: raw_event_id idempotency missing");
  process.exit(1);
}
if (!processor.includes("inserted: false")) {
  console.error("verify:fault-auto-wo-idempotency FAIL: duplicate event short-circuit missing");
  process.exit(1);
}
if (!processor.includes("uq_fault_history_event") && !processor.includes("WHERE raw_event_id = $1")) {
  console.error("verify:fault-auto-wo-idempotency FAIL: event dedupe lookup missing");
  process.exit(1);
}

console.log("verify:fault-auto-wo-idempotency PASS");
