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
const GATE = path.join(ROOT, "apps/backend/src/accounting/qbo-je-push-gate.ts");
const PUSH = path.join(ROOT, "apps/backend/src/accounting/journal-entry-qbo-push.service.ts");
const OUTBOUND = path.join(ROOT, "apps/backend/src/integrations/qbo/sync-outbound-accounting.ts");
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

// 0. The shared gate module must exist and enforce BOTH layers.
const gate = read(GATE);
if (gate) {
  if (!gate.includes("QBO_JE_PUSH_ENABLED") || !/isEnabled\s*\(/.test(gate)) {
    failures.push("gate module lost the LAYER-1 flag resolution (isEnabled + QBO_JE_PUSH_ENABLED)");
  }
  if (!/source_system\s*!==\s*["']tms["']/.test(gate) || !gate.includes("import_source")) {
    failures.push("gate module lost the LAYER-2 structural refusal (source_system !== 'tms' → import_source)");
  }
}

// 1. BOTH live push paths must consult the shared gate. This is the fix for the bypass where the
//    queue-drain path (sync-outbound-accounting.ts) pushed JEs to QBO with no gate.
const push = read(PUSH);
if (push && !push.includes("evaluateJeQboPushGate")) {
  failures.push("immediate push service must consult the shared gate (evaluateJeQboPushGate)");
}

const outbound = read(OUTBOUND);
if (outbound) {
  if (!outbound.includes("evaluateJeQboPushGate")) {
    failures.push("queue-drain path (sync-outbound-accounting.ts) must consult the shared gate for journal_entry (evaluateJeQboPushGate)");
  }
  // The gate must run BEFORE the token fetch so a disabled/refused JE makes zero QBO calls.
  const gateIdx = outbound.indexOf("evaluateJeQboPushGate");
  const tokenIdx = outbound.indexOf("getValidAccessToken(opts.operating_company_id)");
  if (gateIdx >= 0 && tokenIdx >= 0 && gateIdx > tokenIdx) {
    failures.push("sync-outbound-accounting: the JE gate must be evaluated BEFORE getValidAccessToken");
  }
  // factoring_advance composes a QBO JournalEntry — it too must be gated (owner-locked #1: close the last
  // ungated outbound JE). CI fails if a factoring_advance push appears without the JE-flag gate.
  if (!/entityType === "factoring_advance"/.test(outbound) || !outbound.includes("JE_QBO_PUSH_FLAG")) {
    failures.push("sync-outbound-accounting: factoring_advance must be gated on the JE kill-switch (JE_QBO_PUSH_FLAG)");
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
