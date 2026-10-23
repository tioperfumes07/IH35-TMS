#!/usr/bin/env node
/**
 * Static guard: AccountingHub board layout must not use raw UUIDs as labels,
 * must keep QBO display_id on the queue API, and must not use text-[11px]
 * (board uses V3 tokens / text-section-header).
 *
 * ROUND 443.267 — unmatched queue list left the hub (Unmatched is a KPI count only).
 * display_id checks stay on the API/backend so Banking queue honesty is preserved.
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

// Hub must not render raw entity_id anywhere.
if (/\bitem\.entity_id\b/.test(hubPage) || /\.entity_id\b/.test(hubPage.replace(/entityLabel\([^)]*\)/g, ""))) {
  // Only flag bare entity_id interpolations on the hub page itself.
  if (/\{[^}]*entity_id[^}]*\}/.test(hubPage) || /`[^`]*\$\{[^}]*entity_id/.test(hubPage)) {
    errors.push("AccountingHubPage still renders raw entity_id");
  }
}

if (hubPage.includes("text-[11px]")) {
  errors.push("AccountingHubPage must not use text-[11px] — use text-section-header or V3 tokens");
}
if (!hubPage.includes("text-section-header")) {
  errors.push("AccountingHubPage KPI/section labels must use text-section-header (class present for ratchet)");
}

// Board section titles must stay.
for (const title of ["Receivables aging", "Cash pulse · operating account", "Settlements open"]) {
  if (!hubPage.includes(title)) {
    errors.push(`AccountingHubPage missing board section title: ${title}`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: AccountingHub board labels honest (no text-[11px]; board sections present; QBO display_id intact)");
process.exit(0);
