#!/usr/bin/env node
// Guard (IMPORT-P0b extension): the bank_transaction QBO push in processSyncQueueBatch must consult
// the entity-push kill-switch (QBO_ENTITY_PUSH_ENABLED) BEFORE calling syncBankTransaction. Under the
// locked no-write-back architecture, categorizing a bank-feed row must never create a QBO Purchase
// unless the owner explicitly enables the flag. This path bypasses syncEntityToQbo (which gates the
// other entities), so it needs its own explicit gate. This guard prevents the gate from being removed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const f = "apps/backend/src/integrations/qbo/qbo-sync.service.ts";
const src = (() => {
  try {
    return fs.readFileSync(path.join(ROOT, f), "utf8");
  } catch {
    return "";
  }
})();

const errs = [];
if (!src) {
  errs.push(`${f} not found`);
} else {
  if (!/isEntityPushEnabled/.test(src)) {
    errs.push("bank_transaction push must consult isEntityPushEnabled (QBO_ENTITY_PUSH_ENABLED gate).");
  }
  // The gate + block must sit BEFORE the direct syncBankTransaction call.
  const gateIdx = src.indexOf("isEntityPushEnabled(client");
  const callIdx = src.indexOf("await syncBankTransaction(txn");
  if (gateIdx === -1 || callIdx === -1 || gateIdx > callIdx) {
    errs.push("isEntityPushEnabled gate must appear BEFORE the syncBankTransaction call.");
  }
}

if (errs.length) {
  console.error("[verify-bank-transaction-push-gate] FAILED");
  for (const e of errs) console.error("  ✗ " + e);
  process.exit(1);
}
console.log("[verify-bank-transaction-push-gate] OK");
