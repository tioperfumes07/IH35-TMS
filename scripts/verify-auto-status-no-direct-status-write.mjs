#!/usr/bin/env node
import fs from "node:fs";

const path = "apps/backend/src/telematics/auto-status.service.ts";
if (!fs.existsSync(path)) throw new Error(`Missing file: ${path}`);
const content = fs.readFileSync(path, "utf8");

if (/UPDATE\s+mdata\.loads\s+SET\s+status/i.test(content)) {
  throw new Error("Auto status service must never write mdata.loads.status directly.");
}
if (!content.includes("INSERT INTO dispatch.auto_status_suggestions")) {
  throw new Error("Auto status service must insert suggestions.");
}

console.log("verify-auto-status-no-direct-status-write: ok");
