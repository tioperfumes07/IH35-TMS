#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(ROOT, "db/migrations/0306_shipper_portal_mvp.sql"), "utf8");

if (!sql.includes("portal_users_company_isolation")) {
  console.error("verify:shipper-portal-rls-policies FAIL: portal_users RLS policy missing");
  process.exit(1);
}
if (!sql.includes("load_milestones_company_isolation")) {
  console.error("verify:shipper-portal-rls-policies FAIL: load_milestones RLS policy missing");
  process.exit(1);
}
if (!sql.includes("ENABLE ROW LEVEL SECURITY")) {
  console.error("verify:shipper-portal-rls-policies FAIL: RLS not enabled");
  process.exit(1);
}

console.log("verify:shipper-portal-rls-policies PASS");
