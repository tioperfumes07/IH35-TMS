#!/usr/bin/env node
import fs from "node:fs";

const filePath = "apps/backend/src/telematics/load-progress.service.ts";
if (!fs.existsSync(filePath)) {
  throw new Error(`Missing load progress service: ${filePath}`);
}
const content = fs.readFileSync(filePath, "utf8");

const forbidden = [
  { pattern: /\bINSERT\s+INTO\b/i, description: "INSERT" },
  { pattern: /\bUPDATE\b/i, description: "UPDATE" },
  { pattern: /\bDELETE\s+FROM\b/i, description: "DELETE" },
  { pattern: /\bBEGIN\b/i, description: "transaction BEGIN" },
  { pattern: /\bCOMMIT\b/i, description: "transaction COMMIT" },
];

for (const rule of forbidden) {
  if (rule.pattern.test(content)) {
    throw new Error(`load-progress.service.ts must be read-only; found forbidden ${rule.description}`);
  }
}

console.log("verify-load-progress-no-db-writes: ok");
