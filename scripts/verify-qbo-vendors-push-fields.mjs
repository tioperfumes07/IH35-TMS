#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const migrationPath = path.join(ROOT, "db/migrations/0321_qbo_vendors_push_sync_status.sql");
const pushPath = path.join(ROOT, "apps/backend/src/sync/qbo-vendors-push.ts");
const pushServicePath = path.join(ROOT, "apps/backend/src/qbo/push.service.ts");

function fail(message) {
  console.error(`verify:qbo-vendors-push-fields — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [migrationPath, pushPath, pushServicePath]) {
  if (!fs.existsSync(file)) fail(`${file.replace(`${ROOT}/`, "")} not found`);
}

const migrationText = fs.readFileSync(migrationPath, "utf8");
const pushText = fs.readFileSync(pushPath, "utf8");
const pushServiceText = fs.readFileSync(pushServicePath, "utf8");

for (const column of ["eligible_1099", "payment_terms_qbo_id", "default_ap_account_qbo_id"]) {
  if (!migrationText.includes(column)) fail(`migration 0321 must add accounting.qbo_vendors.${column}`);
}
if (!pushText.includes("eligible_1099")) fail("vendors push scheduler must carry eligible_1099 through mirror payload");
if (!pushText.includes("payment_terms_qbo_id")) fail("vendors push scheduler must carry payment_terms_qbo_id");
if (!pushText.includes("default_ap_account_qbo_id")) fail("vendors push scheduler must carry default_ap_account_qbo_id");
if (!pushServiceText.includes("Vendor1099")) fail("push.service vendor delivery must map Vendor1099");
if (!pushServiceText.includes("TermRef")) fail("push.service vendor delivery must map TermRef");
if (!pushServiceText.includes("APAccountRef")) fail("push.service vendor delivery must map APAccountRef");

console.log("verify:qbo-vendors-push-fields — OK");
