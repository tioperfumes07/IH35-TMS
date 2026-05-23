#!/usr/bin/env node
import fs from "node:fs";

const filePath = "apps/backend/src/telematics/fuel-stop-planner.service.ts";
if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`);
const content = fs.readFileSync(filePath, "utf8");

const forbidden = [/\bINSERT\s+INTO\b/i, /\bUPDATE\b/i, /\bDELETE\s+FROM\b/i, /\bBEGIN\b/i, /\bCOMMIT\b/i];
for (const pattern of forbidden) {
  if (pattern.test(content)) {
    throw new Error(`fuel-stop-planner.service.ts must be read-only; forbidden statement matched: ${pattern}`);
  }
}

console.log("verify-fuel-stop-planner-no-db-writes: ok");
