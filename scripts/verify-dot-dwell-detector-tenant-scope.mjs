#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/telematics/dot-dwell-detector.service.ts";
if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
const content = fs.readFileSync(file, "utf8");

const required = [
  "g.operating_company_id = $1::uuid",
  "ge.operating_company_id = $1::uuid",
  "INSERT INTO compliance.dot_inspection_events",
  "operating_company_id,",
];

for (const token of required) {
  if (!content.includes(token)) {
    throw new Error(`Missing tenant-scope token in dot dwell detector: ${token}`);
  }
}

console.log("verify-dot-dwell-detector-tenant-scope: ok");
