#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(ROOT, "db/migrations/0304_compliance_dashboard.sql"), "utf8");
if (!sql.includes("ENABLE ROW LEVEL SECURITY") || !sql.includes("notif_rules_company_isolation")) {
  console.error("verify:compliance-notification-rules-rls FAIL: notification_rules RLS policy missing");
  process.exit(1);
}
if (!sql.includes("notif_log_company_isolation")) {
  console.error("verify:compliance-notification-rules-rls FAIL: notification_log RLS policy missing");
  process.exit(1);
}
console.log("verify:compliance-notification-rules-rls PASS");
