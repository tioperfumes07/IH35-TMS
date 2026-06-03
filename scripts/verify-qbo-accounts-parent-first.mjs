#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const accountsPushPath = path.join(ROOT, "apps/backend/src/sync/qbo-accounts-push.ts");

function fail(message) {
  console.error(`verify:qbo-accounts-parent-first — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(accountsPushPath)) {
  fail("apps/backend/src/sync/qbo-accounts-push.ts not found");
}

const accountsText = fs.readFileSync(accountsPushPath, "utf8");

if (!accountsText.includes("claimQboAccountsRootPushBatch")) {
  fail("accounts push must expose root claim pass (parent_id IS NULL)");
}
if (!accountsText.includes("claimQboAccountsChildPushBatch")) {
  fail("accounts push must expose child claim pass after parent sync");
}
if (!accountsText.includes("parent_id IS NULL")) {
  fail("root pass must filter parent_id IS NULL");
}
if (!accountsText.includes("parent.qbo_id IS NOT NULL")) {
  fail("child pass must require parent.qbo_id IS NOT NULL");
}
if (!accountsText.includes("ParentRef")) {
  fail("child mirror payload must include ParentRef for QBO create");
}
if (!accountsText.includes("claimQboAccountsRootPushBatch(client, batchSize)")) {
  fail("processQboAccountsPushBatch must run root pass before child pass");
}

console.log("verify:qbo-accounts-parent-first — OK");
