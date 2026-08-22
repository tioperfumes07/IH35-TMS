#!/usr/bin/env node
/**
 * GL-JE-HONEST-BUILT — DROP gl_je (and hub money chrome) on Accounting home / CoA roles
 * that have no journal_entry EntityLink; TAG proven JE surfaces as @matrix-built.
 *
 * @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^(je\\.list|je\\.create|escrow|coa|transactions)$","task":"WAVE-C-gl_je-honest-built","vertical":"column-wave"}
 *
 * Usage: node scripts/verify-gl-je-honest-built.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-gl-je-honest-built";

const FORBIDDEN = {
  accounting: {
    home: ["gl_je", "ap_bill", "expense"],
    coa_roles: ["gl_je"],
  },
};

const MUST_KEEP = {
  accounting: {
    "je.list": ["gl_je"],
    "je.create": ["gl_je"],
    escrow: ["gl_je", "liability"],
    coa: ["gl_je"],
    transactions: ["gl_je"],
  },
};

function loadMod(mod) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, `docs/specs/scoreboard/modules/${mod}.required.json`), "utf8"),
  );
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function checkForbidden(doc, leafCols, mod) {
  const out = [];
  const byId = Object.fromEntries((doc.leaves || []).map((l) => [l.id, l]));
  for (const [id, cols] of Object.entries(leafCols)) {
    const leaf = byId[id];
    if (!leaf) {
      out.push(`${mod} missing ${id}`);
      continue;
    }
    for (const c of cols) {
      if ((leaf.required || []).includes(c)) out.push(`${mod}.${id} must NOT require ${c}`);
    }
  }
  return out;
}

function checkKeep(doc, leafCols, mod) {
  const out = [];
  const byId = Object.fromEntries((doc.leaves || []).map((l) => [l.id, l]));
  for (const [id, cols] of Object.entries(leafCols)) {
    const leaf = byId[id];
    if (!leaf) {
      out.push(`${mod} missing KEEP ${id}`);
      continue;
    }
    for (const c of cols) {
      if (!(leaf.required || []).includes(c)) out.push(`${mod}.${id} must KEEP require ${c}`);
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const doc = loadMod("accounting");
  const clone = structuredClone(doc);
  const home = clone.leaves.find((l) => l.id === "home");
  if (!home) fail("selftest: home missing");
  home.required = [...(home.required || []), "gl_je"];
  const bad = checkForbidden(clone, FORBIDDEN.accounting, "accounting");
  if (!bad.length) fail("selftest poison missed");
  console.log(`${LABEL} --selftest PASS (poison would trip ${bad.length})`);
  process.exit(0);
}

const failures = [];
failures.push(...checkForbidden(loadMod("accounting"), FORBIDDEN.accounting, "accounting"));
failures.push(...checkKeep(loadMod("accounting"), MUST_KEEP.accounting, "accounting"));

const hub = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/AccountingHubPage.tsx"), "utf8");
if (/kind=["']journal_entry["']/.test(hub)) {
  failures.push("AccountingHub now has journal_entry EntityLink — re-scope home DROP");
}

const roles = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/CoaRolesPage.tsx"), "utf8");
if (/kind=["']journal_entry["']/.test(roles)) {
  failures.push("CoaRolesPage now has journal_entry EntityLink — re-scope coa_roles DROP");
}

const jeList = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/ManualJEListPage.tsx"), "utf8");
if (!/listJournalEntries/.test(jeList) || !/kind=["']journal_entry["']/.test(jeList)) {
  failures.push("ManualJEListPage must list JE + EntityLink journal_entry");
}
if (!/Reversal of journal entry \[0-9a-f\]\{8\}/.test(jeList)) {
  failures.push("humanMemo must strip Reversal of journal entry <uuid> (live 0cec933 Record tombstone class)");
}

const jeModal = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/accounting/ManualJEModal.tsx"), "utf8");
if (!/createJournalEntry/.test(jeModal)) {
  failures.push("ManualJEModal must createJournalEntry");
}

const escrow = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/EscrowPage.tsx"), "utf8");
if (!/linked_journal_entry_id/.test(escrow) || !/kind=["']journal_entry["']/.test(escrow)) {
  failures.push("EscrowPage must EntityLink linked_journal_entry_id");
}

const coaList = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx"),
  "utf8",
);
if (!/chart-of-accounts\/register\//.test(coaList)) {
  failures.push("ChartOfAccountsListPage must link to account register");
}

const register = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx"), "utf8");
if (!/kind=["']journal_entry["']/.test(register)) {
  failures.push("AccountRegisterPage must EntityLink journal_entry");
}

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — home/coa_roles gl_je chrome DROPs; je/escrow/coa/transactions tagged built`);
