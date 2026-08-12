#!/usr/bin/env node
/**
 * MAINT-BILL-FACTORING-LIAB-BUILT —
 * Tag bills.create.maintenance inventory+scenario.maintenance (WO FK + parts lines);
 * tag accounting factoring.list liability (reserve_amount_cents);
 * DROP liability on driver bill create + accounting pre_settlements chrome.
 *
 * @matrix-built {"modules":["accounting"],"cols":["inventory","scenario.maintenance"],"leafRe":"^bills\\.create\\.maintenance$","task":"WAVE-C-maint-bill-inventory","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["liability"],"leafRe":"^factoring\\.list$","task":"WAVE-C-liability-factoring-list","vertical":"column-wave"}
 *
 * Usage: node scripts/verify-maint-bill-factoring-liab-built.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maint-bill-factoring-liab-built";

const FORBIDDEN = {
  accounting: {
    "bills.create.driver": ["liability"],
    pre_settlements: ["liability"],
  },
};

const MUST_KEEP = {
  accounting: {
    "bills.create.maintenance": ["inventory", "scenario.maintenance", "ap_bill"],
    "factoring.list": ["liability", "gl_je"],
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
  const leaf = clone.leaves.find((l) => l.id === "bills.create.driver");
  if (!leaf) fail("selftest: bills.create.driver missing");
  leaf.required = [...(leaf.required || []), "liability"];
  const bad = checkForbidden(clone, FORBIDDEN.accounting, "accounting");
  if (!bad.length) fail("selftest poison missed");
  console.log(`${LABEL} --selftest PASS (poison would trip ${bad.length})`);
  process.exit(0);
}

const failures = [];
failures.push(...checkForbidden(loadMod("accounting"), FORBIDDEN.accounting, "accounting"));
failures.push(...checkKeep(loadMod("accounting"), MUST_KEEP.accounting, "accounting"));

const form = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/accounting/VendorBillForm.tsx"), "utf8");
if (!/work_order_id/.test(form) || !/kind=["']work_order["']/.test(form)) {
  failures.push("VendorBillForm must link work_order_id");
}
if (!/parts-and-labor/.test(form)) {
  failures.push("VendorBillForm must use parts-and-labor line editor (inventory)");
}

const factList = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/FactoringListPage.tsx"), "utf8");
if (!/reserve_amount_cents/.test(factList)) {
  failures.push("FactoringListPage must show reserve_amount_cents");
}

const pre = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx"),
  "utf8",
);
if (/kind=["']liability["']|LiabilityBreakdown|DebtBanner/.test(pre)) {
  failures.push("PreSettlementsPanel now has liability UI — re-scope DROP");
}

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — maint bill inventory/scenario tagged; factoring.list liability tagged; driver/pre_settlements DROPs`);
