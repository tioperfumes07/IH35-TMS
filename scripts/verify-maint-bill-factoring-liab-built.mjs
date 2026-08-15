#!/usr/bin/env node
/**
 * MAINT-BILL-FACTORING-LIAB-BUILT —
 * Tag bills.create.maintenance inventory+scenario.maintenance (WO FK + parts lines);
 * tag accounting factoring.list liability (reserve_amount_cents);
 * DROP liability on driver bill create chrome.
 *
 * LIABILITY-PRE-SETTLEMENT-DROP-GUARD-DRIFT / ACCT-F5308 (2026-08-15): pre_settlements moved from
 * FORBIDDEN to MUST_KEEP. LINK-F5187 added a real per-row `EntityLink kind="liability"` to
 * PreSettlementsPanel.tsx (settlement.liability_ids -> driver_finance.driver_liabilities, the same
 * ids the Settlements list's Debt Flag column links) after this guard's original 2026-08-12 DROP —
 * verified live, not assumed. accounting.required.json's honesty_audit
 * `pre_settlements_liability_2026_08_15_restore` documents the correction (append-only, the
 * original `maint_bill_factoring_liab_2026_08_12` drop entry is untouched). bills.create.driver's
 * liability DROP is separate and unaffected — do not restore it without the same live evidence.
 *
 * @matrix-built {"modules":["accounting"],"cols":["inventory","scenario.maintenance"],"leafRe":"^bills\\.create\\.maintenance$","task":"WAVE-C-maint-bill-inventory","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["liability"],"leafRe":"^factoring\\.list$","task":"WAVE-C-liability-factoring-list","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["liability"],"leafRe":"^pre_settlements$","task":"ACCT-F5308-liability-pre-settlements","vertical":"column-wave"}
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
  },
};

const MUST_KEEP = {
  accounting: {
    "bills.create.maintenance": ["inventory", "scenario.maintenance", "ap_bill"],
    "factoring.list": ["liability", "gl_je"],
    pre_settlements: ["liability"],
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

  // ACCT-F5308: mutation-prove the MUST_KEEP direction too — dropping liability from
  // pre_settlements must be caught, the exact regression this fix corrects for.
  const clone2 = structuredClone(doc);
  const pl = clone2.leaves.find((l) => l.id === "pre_settlements");
  if (!pl) fail("selftest: pre_settlements missing");
  pl.required = (pl.required || []).filter((c) => c !== "liability");
  const bad2 = checkKeep(clone2, MUST_KEEP.accounting, "accounting");
  if (!bad2.some((f) => f.includes("pre_settlements"))) fail("selftest: pre_settlements liability drop poison missed");

  console.log(`${LABEL} --selftest PASS (2 planted regressions caught: ${bad.length} FORBIDDEN + pre_settlements KEEP)`);
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
// ACCT-F5308: pre_settlements now MUST_KEEP liability (see file header) — assert the real drill
// stays wired, the inverse of the old DROP-era check.
if (!/kind=["']liability["']/.test(pre)) {
  failures.push("PreSettlementsPanel must keep its real liability EntityLink (kind=\"liability\")");
}
if (!/liability_ids/.test(pre)) {
  failures.push("PreSettlementsPanel must keep reading settlement.liability_ids (real driver_finance.driver_liabilities FK, not a fabricated id)");
}

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — maint bill inventory/scenario tagged; factoring.list + pre_settlements liability tagged; driver bill create DROP held`);
