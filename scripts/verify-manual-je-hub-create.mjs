#!/usr/bin/env node
/**
 * ACCT-PR-4/6 — Manual JE create on the Accounting Hub.
 *
 * Guards the audit requirement:
 *   - AccountingHubPage has an Owner-gated "+ Create Manual JE" primary button (never "+ New"/"+ Add").
 *   - It wires the SAME accounting ManualJEModal used by ManualJEListPage (no duplicate Banking modal
 *     import on the hub page).
 *   - The manual-JE create endpoint enforces an amount threshold (Owner-only at/above
 *     MANUAL_JE_OWNER_THRESHOLD_CENTS), documented in ONE place in journal-entries.service.ts —
 *     matching void's Owner-tier seriousness bar (canVoid: Owner + Accountant only).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const failures = [];

function read(rel) {
  try {
    return readFileSync(resolve(ROOT, rel), "utf8");
  } catch {
    failures.push(`missing file: ${rel}`);
    return "";
  }
}

const HUB_PATH = "apps/frontend/src/pages/accounting/AccountingHubPage.tsx";
const SERVICE_PATH = "apps/backend/src/accounting/journal-entries.service.ts";
const ROUTES_PATH = "apps/backend/src/accounting/journal-entries.routes.ts";

const hub = read(HUB_PATH);
const service = read(SERVICE_PATH);
const routes = read(ROUTES_PATH);

// 1. Primary button text + locked-button-law compliance (no "+ New" / "+ Add").
if (!/\+ Create Manual JE/.test(hub)) {
  failures.push(`${HUB_PATH}: missing "+ Create Manual JE" primary button text`);
}
if (/["'>]\s*\+\s*New\b/.test(hub) || /["'>]\s*\+\s*Add\b/.test(hub)) {
  failures.push(`${HUB_PATH}: primary button must be "+ Create" / "+ Create Manual JE" — never "+ New"/"+ Add"`);
}

// 2. Owner-gated: the button render must be conditioned on Owner role.
if (!/user\?\.role === ["']Owner["']/.test(hub)) {
  failures.push(`${HUB_PATH}: "+ Create Manual JE" must be Owner-gated (user?.role === "Owner")`);
}

// 3. Must import the accounting ManualJEModal (re-exports components/accounting/ManualJEModal),
//    never the Banking one — do NOT duplicate Banking's ManualJEModal on the accounting hub.
if (!/import\s*\{\s*ManualJEModal\s*\}\s*from\s*["']\.\/ManualJEModal["']/.test(hub)) {
  failures.push(`${HUB_PATH}: must import ManualJEModal from "./ManualJEModal" (the accounting one)`);
}
if (/from\s*["'][^"']*banking\/components\/ManualJEModal["']/.test(hub)) {
  failures.push(`${HUB_PATH}: must NOT import the Banking ManualJEModal`);
}

// 4. Backend: single-source-of-truth Owner-configurable threshold constant + gate helper.
if (!/export const MANUAL_JE_OWNER_THRESHOLD_CENTS\s*=\s*\d/.test(service)) {
  failures.push(`${SERVICE_PATH}: missing exported MANUAL_JE_OWNER_THRESHOLD_CENTS constant`);
}
if (!/export function canCreateManualJeAtAmount\(/.test(service)) {
  failures.push(`${SERVICE_PATH}: missing exported canCreateManualJeAtAmount(role, totalDebitCents) gate`);
}

// 5. Backend: the create route must actually call the threshold gate (amount-threshold check on
//    CREATE, not just void) before persisting.
if (!/canCreateManualJeAtAmount/.test(routes)) {
  failures.push(`${ROUTES_PATH}: POST /journal-entries must call canCreateManualJeAtAmount before create`);
}
if (!/forbidden_manual_je_owner_threshold/.test(routes)) {
  failures.push(`${ROUTES_PATH}: missing 403 forbidden_manual_je_owner_threshold response on threshold breach`);
}

if (failures.length) {
  console.error("FAIL verify-manual-je-hub-create:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("PASS verify-manual-je-hub-create — Owner-gated hub create + amount-threshold gate wired");
