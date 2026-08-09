#!/usr/bin/env node
/**
 * Static guard: AccountingHub must not use raw UUIDs/ISO dates as user-facing labels.
 * Specifically the unmatched QBO sync queue tile must render display_id, not entity_id.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hubPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/AccountingHubPage.tsx"), "utf8");
const apiTypes = fs.readFileSync(path.join(ROOT, "apps/frontend/src/api/banking.ts"), "utf8");
const backend = fs.readFileSync(path.join(ROOT, "apps/backend/src/integrations/qbo/qbo-sync.service.ts"), "utf8");
const errors = [];

if (!/display_id:\s*string/.test(apiTypes)) {
  errors.push("QboSyncQueueItem type missing display_id");
}
if (!/display_id/.test(backend)) {
  errors.push("Backend listSyncQueue does not return display_id");
}
if (/item\.entity_id/.test(hubPage)) {
  errors.push("AccountingHubPage still renders raw entity_id for unmatched items");
}
if (!/item\.display_id/.test(hubPage)) {
  errors.push("AccountingHubPage does not use display_id for unmatched items");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: AccountingHub unmatched labels use display_id, not raw entity_id");
process.exit(0);
