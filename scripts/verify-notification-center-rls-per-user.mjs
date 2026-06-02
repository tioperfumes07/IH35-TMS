#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(ROOT, "db/migrations/0309_notification_center.sql"), "utf8");

if (!sql.includes("user_notif_isolation")) {
  console.error("verify:notification-center-rls-per-user FAIL: user_notif_isolation policy missing");
  process.exit(1);
}
if (!sql.includes("user_id = current_setting('app.current_user_id', true)::uuid")) {
  console.error("verify:notification-center-rls-per-user FAIL: per-user RLS must use app.current_user_id");
  process.exit(1);
}
const policyBlock = sql.split("user_notif_isolation")[1]?.split("user_notification_preferences")[0] ?? "";
if (policyBlock.includes("operating_company_id = current_setting('app.operating_company_id'")) {
  console.error("verify:notification-center-rls-per-user FAIL: notifications RLS must be per-user not per-company");
  process.exit(1);
}

console.log("verify:notification-center-rls-per-user PASS");
