#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/backend/src/telematics/dtc-auto-work-order.service.ts";
const src = fs.readFileSync(target, "utf8");
const requiredSnippets = [
  "w.operating_company_id = $1::uuid",
  "INSERT INTO maintenance.work_orders",
  "operating_company_id",
];
// ROUND 326 audit M1: the work order is created through the one creator (createWorkOrderWithLines), which inserts it
// with header.operating_company_id — the company still scopes the write.
const viaCreator = src.includes("await createWorkOrderWithLines(") && src.includes("operating_company_id: input.operating_company_id");

const missing = requiredSnippets.filter((snippet) => !src.includes(snippet) && !(viaCreator && snippet === "INSERT INTO maintenance.work_orders"));
if (missing.length > 0) {
  console.error("FAIL verify-dtc-auto-wo-tenant-scope:");
  for (const snippet of missing) {
    console.error(`  missing snippet: ${snippet}`);
  }
  process.exit(1);
}

console.log("PASS verify-dtc-auto-wo-tenant-scope");
