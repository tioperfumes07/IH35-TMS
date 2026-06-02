#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(ROOT, "db/migrations/0308_deadhead_optimization.sql"), "utf8");

if (!sql.includes("deadhead_company_isolation")) {
  console.error("verify:deadhead-cache-rls FAIL: deadhead_company_isolation policy missing");
  process.exit(1);
}
if (!sql.includes("ENABLE ROW LEVEL SECURITY")) {
  console.error("verify:deadhead-cache-rls FAIL: RLS not enabled on deadhead_cache");
  process.exit(1);
}
if (!sql.includes("identity.is_lucia_bypass()")) {
  console.error("verify:deadhead-cache-rls FAIL: lucia bypass guard missing");
  process.exit(1);
}

console.log("verify:deadhead-cache-rls PASS");
