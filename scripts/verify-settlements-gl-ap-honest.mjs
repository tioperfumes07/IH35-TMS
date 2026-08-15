#!/usr/bin/env node
/**
 * SETTLEMENTS-GL-AP-HONEST + accounting list/reports gl_je chrome —
 * DROP gl_je/ap_bill where FE has no journal_entry / vendor-bill EntityLink;
 * TAG period_close + month_close as gl_je built (MonthClose checklist → JE list).
 *
 * CLS-WAVE-C-MATRIX-GL-JE-LIABILITY-STALE (board #6230, CC-2 found / CC-1 fixed 2026-08-12):
 * settlements.detail's gl_je/ap_bill DROP was stale — SettlementDetailPage.tsx now renders real
 * EntityLink kind="journal_entry" (bill_journal_entry_id) and kind="bill" (linked vendor bill).
 * Re-scoped from FORBIDDEN to MUST_KEEP; settlements.required.json's settlements.detail leaf
 * updated to require gl_je + ap_bill to match.
 *
 * SETTLEMENTS-GL-AP-HONEST-MATRIX-DRIFT (GUARD-WORKORDERS.md, filed by Codex 2026-08-14, fixed
 * CC-1 2026-08-15): the opposite drift — this guard's own MUST_KEEP still asserted
 * cash_advances: ["liability"] after a LATER, more careful honesty audit
 * (settlements.required.json honesty_audit.liability_2026_08_13_secondary) correctly dropped
 * `liability` from that leaf. Verified live 2026-08-15: CashAdvanceRequestsPage.tsx
 * (route /driver-finance/cash-advance-requests) only renders EntityLink kind="driver" — this
 * screen lists PENDING requests, not yet-disbursed advances, so there is no
 * driver_finance.driver_liabilities row to link to yet (same pre-persistence shape as the
 * internal_fines.create / FineConvertConfirmModal false-required leaves from LINK-F5187 cluster
 * A). Removed the stale MUST_KEEP entry so this guard follows the shipped, honesty-audited
 * required.json instead of contradicting it.
 *
 * @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^(period_close|month_close)$","task":"WAVE-C-gl_je-month-close","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["gl_je","ap_bill"],"leafRe":"^settlements\\.detail$","task":"CLS-WAVE-C-MATRIX-GL-JE-LIABILITY-STALE","vertical":"column-wave"}
 *
 * Usage: node scripts/verify-settlements-gl-ap-honest.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-gl-ap-honest";

const FORBIDDEN = {
  settlements: {
    "settlements.list": ["gl_je", "ap_bill"],
    settlement_close: ["gl_je"],
    cash_advances: ["gl_je"],
  },
  accounting: {
    "invoices.list": ["gl_je"],
  },
};

const MUST_KEEP = {
  settlements: {
    "settlements.list": ["liability"],
    // CLS-WAVE-C-MATRIX-GL-JE-LIABILITY-STALE (board #6230, CC-2 found / CC-1 fixed): the DROP
    // below was written when SettlementDetailPage had no journal_entry/bill EntityLink. It now
    // renders both (kind="journal_entry" on bill_journal_entry_id, kind="bill" on the linked
    // vendor bill) — re-scoped from FORBIDDEN to MUST_KEEP so the matrix follows the shipped code
    // instead of a stale annotation.
    "settlements.detail": ["liability", "gl_je", "ap_bill"],
    settlement_close: ["liability"],
  },
  accounting: {
    "invoices.create": ["gl_je"],
    period_close: ["gl_je"],
    month_close: ["gl_je"],
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
  const leaf = clone.leaves.find((l) => l.id === "settlements.list");
  if (!leaf) fail("selftest: settlements.list missing");
  leaf.required = [...(leaf.required || []), "gl_je"];
  const bad = checkForbidden(clone, FORBIDDEN.settlements, "settlements");
  if (!bad.length) fail("selftest poison missed");
  console.log(`${LABEL} --selftest PASS (poison would trip ${bad.length})`);
  process.exit(0);
}

const failures = [];
for (const [mod, leafCols] of Object.entries(FORBIDDEN)) {
  failures.push(...checkForbidden(loadMod(mod), leafCols, mod));
}
for (const [mod, leafCols] of Object.entries(MUST_KEEP)) {
  failures.push(...checkKeep(loadMod(mod), leafCols, mod));
}

const detail = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx"),
  "utf8",
);
// CLS-WAVE-C-MATRIX-GL-JE-LIABILITY-STALE fix: settlements.detail is now MUST_KEEP gl_je/ap_bill
// (real EntityLinks shipped) — assert they stay present instead of forbidding them.
if (!/kind=["']journal_entry["']/.test(detail)) {
  failures.push("SettlementDetail must KEEP journal_entry EntityLink (gl_je)");
}
if (!/kind=["']bill["']/.test(detail)) {
  failures.push("SettlementDetail must KEEP bill EntityLink (ap_bill)");
}

const invList = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/InvoicesListPage.tsx"), "utf8");
if (/kind=["']journal_entry["']/.test(invList)) {
  failures.push("InvoicesListPage now has journal_entry EntityLink — re-scope invoices.list DROP");
}

const month = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/MonthClosePage.tsx"), "utf8");
if (!/journal-entries/.test(month) || !/adjusting_entries/.test(month)) {
  failures.push("MonthClosePage must surface adjusting_entries + link to journal-entries");
}

const manifest = fs.readFileSync(path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"), "utf8");
if (!/path=\"\/accounting\/period-close\"[\s\S]*?Navigate to=\"\/accounting\/month-close\"/.test(manifest)) {
  failures.push("period-close must alias to month-close");
}

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — settlements gl_je/ap_bill DROPs; invoices.list/reports DROPs; month/period_close tagged`);
