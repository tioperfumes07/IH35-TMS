#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/backend/src/telematics/positions.routes.ts";
const src = fs.readFileSync(target, "utf8").toLowerCase();
const forbidden = ["phone", "email", "ssn", "license_number", "last_name", "first_name", "driver_name"];
const found = forbidden.filter((token) => src.includes(token));

if (found.length > 0) {
  console.error("verify-position-endpoints-no-pii-leak failed");
  for (const token of found) console.error(`  forbidden token found: ${token}`);
  process.exit(1);
}

console.log("verify-position-endpoints-no-pii-leak: ok");
