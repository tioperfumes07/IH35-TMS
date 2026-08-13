#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["connectivity","picker_law"],"leafRe":"^(je\\.(list|create)|je)$","task":"ACCT-F5056-MANUAL-JE-CREATE-URL","pr":"#6460"}
 * ACCT-PR-4/6 — Manual JE create on the Accounting Hub.
 *
 * Guards the audit requirement:
 *   - AccountingHubPage has a "+ Create Manual JE" primary button (never "+ New"/"+ Add").
 *   - It wires the SAME accounting ManualJEModal used by ManualJEListPage (no duplicate Banking modal
 *     import on the hub page).
 *   - Access follows the EXISTING accounting role gate (canAccessAccounting: Owner / Administrator /
 *     Accountant) — the same bar as every other create surface in this module.
 *
 * NO AMOUNT THRESHOLD. This guard previously required an invented $1,000 Owner-only ceiling
 * (MANUAL_JE_OWNER_THRESHOLD_CENTS / canCreateManualJeAtAmount), plus an Owner-only render condition
 * on the hub button. That was a business rule no owner authorised, and it failed closed with a bare
 * 403 `forbidden_manual_je_owner_threshold` that no UI surfaced — an Accountant entering a $1,500 JE
 * got a silent rejection. Owner ruling 2026-07-22: "remove threshold." Both the ceiling and the
 * Owner-only button gate are gone, and this guard now asserts their ABSENCE so neither creeps back
 * in without an owner decision.
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
const LIST_PATH = "apps/frontend/src/pages/accounting/ManualJEListPage.tsx";
const TOPBAR_PATH = "apps/frontend/src/components/Topbar.tsx";
const SERVICE_PATH = "apps/backend/src/accounting/journal-entries.service.ts";
const ROUTES_PATH = "apps/backend/src/accounting/journal-entries.routes.ts";

const hub = read(HUB_PATH);
const list = read(LIST_PATH);
const topbar = read(TOPBAR_PATH);
const service = read(SERVICE_PATH);
const routes = read(ROUTES_PATH);

// 1. Primary button text + locked-button-law compliance (no "+ New" / "+ Add").
if (!/\+ Create Manual JE/.test(hub)) {
  failures.push(`${HUB_PATH}: missing "+ Create Manual JE" primary button text`);
}
if (/["'>]\s*\+\s*New\b/.test(hub) || /["'>]\s*\+\s*Add\b/.test(hub)) {
  failures.push(`${HUB_PATH}: primary button must be "+ Create" / "+ Create Manual JE" — never "+ New"/"+ Add"`);
}

// 2. NOT role-narrowed at the button: access is the module's existing canAccessAccounting gate.
//    An Owner-only render here would hide the action from the Administrators and Accountants who
//    are exactly the people expected to post manual journal entries.
if (/user\?\.role === ["']Owner["'][\s\S]{0,200}?Create Manual JE/.test(hub)) {
  failures.push(
    `${HUB_PATH}: "+ Create Manual JE" must NOT be narrowed to Owner — access follows canAccessAccounting (owner ruling 2026-07-22 "remove threshold")`
  );
}

// 3. Must import the accounting ManualJEModal (re-exports components/accounting/ManualJEModal),
//    never the Banking one — do NOT duplicate Banking's ManualJEModal on the accounting hub.
if (!/import\s*\{\s*ManualJEModal\s*\}\s*from\s*["']\.\/ManualJEModal["']/.test(hub)) {
  failures.push(`${HUB_PATH}: must import ManualJEModal from "./ManualJEModal" (the accounting one)`);
}
if (/from\s*["'][^"']*banking\/components\/ManualJEModal["']/.test(hub)) {
  failures.push(`${HUB_PATH}: must NOT import the Banking ManualJEModal`);
}

// ACCT-F5056 — Topbar Create→Journal entry must open ManualJEModal via ?create=1.
if (!topbar.includes("/accounting/journal-entries?create=1")) {
  failures.push(`${TOPBAR_PATH}: Create→Journal entry must navigate to /accounting/journal-entries?create=1`);
}
if (!/searchParams\.get\(["']create["']\)\s*===\s*["']1["']/.test(list)) {
  failures.push(`${LIST_PATH}: must honor ?create=1 for ManualJEModal`);
}
if (!/params\.delete\(["']create["']\)/.test(list) || !/params\.set\(["']create["'],\s*["']1["']\)/.test(list)) {
  failures.push(`${LIST_PATH}: must URL-sync create open/close`);
}

// 4/5. Backend: NO amount threshold anywhere on the manual-JE create path (owner ruling
//       2026-07-22). Assert absence, so the ceiling cannot be reintroduced without an owner call.
for (const [label, source] of [[SERVICE_PATH, service], [ROUTES_PATH, routes]]) {
  if (/MANUAL_JE_OWNER_THRESHOLD_CENTS|canCreateManualJeAtAmount|forbidden_manual_je_owner_threshold/.test(source)) {
    failures.push(
      `${label}: manual-JE amount threshold reintroduced — the owner removed it on 2026-07-22. A dollar ceiling on posting is a business decision, not an engineering default.`
    );
  }
}

if (failures.length) {
  console.error("FAIL verify-manual-je-hub-create:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("PASS verify-manual-je-hub-create — hub create wired via canAccessAccounting; no amount threshold");
