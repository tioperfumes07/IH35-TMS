#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processor = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/integrations/samsara/fault-code-processor.service.ts"),
  "utf8"
);

if (!processor.includes("hasRecentUnresolvedFault")) {
  console.error("verify:fault-auto-wo-24h-dedup FAIL: 24h dedup helper missing");
  process.exit(1);
}
if (!processor.includes("interval '24 hours'")) {
  console.error("verify:fault-auto-wo-24h-dedup FAIL: 24 hour window missing");
  process.exit(1);
}
if (!processor.includes("recentDup")) {
  console.error("verify:fault-auto-wo-24h-dedup FAIL: duplicate fault short-circuit missing");
  process.exit(1);
}

console.log("verify:fault-auto-wo-24h-dedup PASS");
