#!/usr/bin/env node
/**
 * ACCT-FACTORING-LIST-GL-JE-BUILT + SETTLEMENTS-LIABILITY-CHROME —
 * Tag accounting factoring.list gl_je (detail EntityLink); DROP liability on
 * settlements disputes / cash_advances chrome with no liability UI.
 *
 * @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^factoring\\.list$","task":"WAVE-C-gl_je-factoring-list","vertical":"column-wave"}
 *
 * Usage: node scripts/verify-factoring-list-gl-je-built.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-list-gl-je-built";

const FORBIDDEN = {
  settlements: {
    "settlements.disputes": ["liability"],
    cash_advances: ["liability"],
  },
};

const MUST_KEEP = {
  accounting: {
    "factoring.list": ["gl_je", "liability"],
    "invoices.create": ["gl_je"],
    "payments.receive": ["gl_je"],
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
  const doc = loadMod("settlements");
  const clone = structuredClone(doc);
  const leaf = clone.leaves.find((l) => l.id === "settlements.disputes");
  if (!leaf) fail("selftest: settlements.disputes missing");
  leaf.required = [...(leaf.required || []), "liability"];
  const bad = checkForbidden(clone, FORBIDDEN.settlements, "settlements");
  if (!bad.length) fail("selftest poison missed");
  console.log(`${LABEL} --selftest PASS (poison would trip ${bad.length})`);
  process.exit(0);
}

const failures = [];
failures.push(...checkForbidden(loadMod("settlements"), FORBIDDEN.settlements, "settlements"));
failures.push(...checkKeep(loadMod("accounting"), MUST_KEEP.accounting, "accounting"));

const detail = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx"), "utf8");
if (!/journal_entry_id/.test(detail) || !/kind=["']journal_entry["']/.test(detail)) {
  failures.push("FactoringDetailPage must EntityLink journal_entry_id");
}

const disputes = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx"),
  "utf8",
);
if (/kind=["']liability["']|LiabilityBreakdown|DebtBanner/.test(disputes)) {
  failures.push("SettlementDisputesTab now has liability UI — re-scope DROP");
}

const caGlob = [
  "apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx",
  "apps/frontend/src/pages/driver-finance/CashAdvancesPage.tsx",
];
let caHit = false;
for (const rel of caGlob) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  caHit = true;
  const t = fs.readFileSync(p, "utf8");
  if (/kind=["']liability["']|LiabilityBreakdown|DebtBanner/.test(t)) {
    failures.push(`${rel} now has liability UI — re-scope cash_advances DROP`);
  }
}
if (!caHit) {
  // soft: page may be named differently — ensure disputes DROP still held
}

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — factoring.list gl_je tagged; disputes/cash_advances liability DROPs`);
