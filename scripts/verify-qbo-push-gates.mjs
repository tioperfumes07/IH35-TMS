#!/usr/bin/env node
// verify:qbo-push-gates — permanent guard (IMPORT-P0).
//
// QBO is the system of record through 12/31/2025 (double books + reconciliation, no sync-back). The
// JE→QBO push MUST stay gated so imported / QBO-origin journal entries can never round-trip back into
// QuickBooks. This guard fails the build if any of the kill-switch's static invariants are removed:
//   1. journal-entry-qbo-push.service.ts keeps the LAYER-1 flag resolution (isEnabled + QBO_JE_PUSH_ENABLED).
//   2. …keeps the LAYER-2 structural refusal (source_system !== 'tms' → qbo_push_refused_import_source).
//   3. …resolves the flag BEFORE fetching a token (no HTTP for a disabled entity).
//   4. Every journal_entry enqueue call site in journal-entries.service.ts carries the exclusion marker.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUSH = path.join(ROOT, "apps/backend/src/accounting/journal-entry-qbo-push.service.ts");
const JE_SVC = path.join(ROOT, "apps/backend/src/accounting/journal-entries.service.ts");
const MARKER = "[IMPORT-P0 qbo-import-exclusion]";

const failures = [];

function read(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    failures.push(`missing file: ${path.relative(ROOT, p)}`);
    return "";
  }
}

const push = read(PUSH);
if (push) {
  // 1. flag resolution present
  if (!/isEnabled\s*\(/.test(push) || !push.includes("QBO_JE_PUSH_ENABLED")) {
    failures.push("push service lost the LAYER-1 flag resolution (isEnabled + QBO_JE_PUSH_ENABLED)");
  }
  // 2. structural refusal present
  if (!push.includes("qbo_push_refused_import_source") || !/source_system\s*!==\s*["']tms["']/.test(push)) {
    failures.push("push service lost the LAYER-2 structural refusal (source_system !== 'tms' → qbo_push_refused_import_source)");
  }
  // 3. flag/refusal must be resolved BEFORE the token fetch (no HTTP for a disabled/refused entity)
  const flagIdx = push.indexOf("QBO_JE_PUSH_ENABLED");
  const refuseIdx = push.indexOf("qbo_push_refused_import_source");
  const tokenIdx = push.indexOf("getValidAccessToken(oc)");
  if (tokenIdx >= 0) {
    if (flagIdx < 0 || flagIdx > tokenIdx) failures.push("flag gate must be resolved BEFORE getValidAccessToken(oc)");
    if (refuseIdx < 0 || refuseIdx > tokenIdx) failures.push("structural refusal must run BEFORE getValidAccessToken(oc)");
  }
}

const jeSvc = read(JE_SVC);
if (jeSvc) {
  // 4. every journal_entry enqueue site carries the exclusion marker (marker count >= enqueue count).
  const enqueueJournalSites = (jeSvc.match(/enqueueSyncJob\(/g) || []).length;
  const markerCount = jeSvc.split(MARKER).length - 1;
  if (enqueueJournalSites > 0 && markerCount < enqueueJournalSites) {
    failures.push(
      `journal-entries.service.ts has ${enqueueJournalSites} enqueueSyncJob call(s) but only ${markerCount} "${MARKER}" marker(s) — every JE enqueue site must document the qbo-import exclusion`
    );
  }
}

if (failures.length > 0) {
  console.error("verify:qbo-push-gates — FAILED");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log("verify:qbo-push-gates — OK (JE→QBO push kill-switch invariants intact)");
