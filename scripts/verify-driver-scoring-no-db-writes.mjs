#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/backend/src/safety/driver-scoring.service.ts";
const src = fs.readFileSync(target, "utf8").toLowerCase();
const forbidden = ["insert ", "update ", "delete ", "create table", "alter table"];
const found = forbidden.filter((token) => src.includes(token));

if (found.length > 0) {
  console.error("verify-driver-scoring-no-db-writes failed");
  for (const token of found) {
    console.error(`  found forbidden token: ${token}`);
  }
  process.exit(1);
}

console.log("verify-driver-scoring-no-db-writes: ok");
