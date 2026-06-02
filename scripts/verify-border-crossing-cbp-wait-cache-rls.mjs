#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(ROOT, "db/migrations/0313_border_crossing_wizard.sql"), "utf8");

if (!sql.includes("cbp_wait_cache_read")) {
  console.error("verify:border-crossing-cbp-wait-cache-rls FAIL: cbp_wait_cache_read policy missing");
  process.exit(1);
}
if (!sql.includes("ENABLE ROW LEVEL SECURITY")) {
  console.error("verify:border-crossing-cbp-wait-cache-rls FAIL: RLS not enabled on cbp_wait_times_cache");
  process.exit(1);
}
if (!sql.includes("identity.is_lucia_bypass()")) {
  console.error("verify:border-crossing-cbp-wait-cache-rls FAIL: lucia bypass guard missing for cache writes");
  process.exit(1);
}

console.log("verify:border-crossing-cbp-wait-cache-rls PASS");
