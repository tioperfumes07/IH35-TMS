#!/usr/bin/env node
/**
 * verify-banking-designview-qbo-parity.mjs  (Doc-18 defects 1, 7, 9, 10 — regression guard)
 *
 * Locks the four QBO-parity "design-view wins" shipped into
 * apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx so they can't silently
 * regress (skill §2 — every fix gets a static CI guard):
 *
 *   DEFECT-1  Split placement — the categorize-panel footer is `justify-between` with a bottom-LEFT
 *             Split button (`setSplitTx(tx)`) opposite Post, not only in the row ▾ dropdown.
 *   DEFECT-7  Match reveal — clicking the expanded-row "Match" button also `setExpandedTxId(tx.id)`
 *             (so matchCandidatesQuery loads) and scrolls the candidates pane into view (matchPaneRef).
 *   DEFECT-9  Amount sort + grouping toggle — the single-column "Amount" header is sortable (no
 *             `sortable={false}`), and a visible "By month / All dates" toggle drives turnOffGrouping.
 *   DEFECT-10 Customer +Add — the Customer field uses ReferenceSelect with createKind="customer"
 *             ("+ Add new customer"), matching Payee/Category/Product-Service.
 *
 * Usage:
 *   node scripts/verify-banking-designview-qbo-parity.mjs            # scan the real file
 *   node scripts/verify-banking-designview-qbo-parity.mjs --selftest # pure-logic selftest
 *
 * LINKAGE: N/A (frontend regression guard). Additive only.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const TARGET = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

/** Strip block/line/JSX comments so explanatory prose can't satisfy a check. */
function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** The five assertions, each a predicate over the comment-stripped source. */
export function checksFor(src) {
  // DEFECT-9 — isolate the single-column "Amount" header cell to assert it is NOT sortable={false}.
  const amountHeader = (src.match(/columnKey="amount"[\s\S]*?\/>/) ?? [""])[0];

  return {
    // DEFECT-1: categorize footer is justify-between AND carries a bottom-left Split button.
    splitFooterPlacement:
      /flex items-center justify-between/.test(src) &&
      /onClick=\{\(\)\s*=>\s*setSplitTx\(tx\)\}>\s*Split/.test(src),
    // DEFECT-7: the Match mode button also expands the row so candidates load, + a scroll target ref.
    matchExpandsRow:
      /mode:\s*"match"\s*\}\);[\s\S]{0,120}setExpandedTxId\(tx\.id\)/.test(src) &&
      /matchPaneRef/.test(src),
    // DEFECT-9a: the Amount header cell exists and is sortable (no sortable={false}).
    amountSortable: amountHeader.length > 0 && !/sortable=\{false\}/.test(amountHeader),
    // DEFECT-9b: a visible month/all-dates toggle that drives turnOffGrouping both ways.
    // (Audit gap #5 added Money in/out; By month may also set groupMode — still must flip turnOffGrouping.)
    groupingToggle:
      />\s*By month\s*</.test(src) &&
      /turnOffGrouping:\s*true/.test(src) &&
      /turnOffGrouping:\s*false/.test(src),
    // DEFECT-10: Customer field uses ReferenceSelect with createKind="customer".
    customerReferenceSelect: /createKind="customer"/.test(src),
  };
}

const CHECK_LABELS = {
  splitFooterPlacement: "DEFECT-1 — categorize footer justify-between with a bottom-left Split button",
  matchExpandsRow: "DEFECT-7 — Match button sets expandedTxId + scrolls the candidates pane (matchPaneRef)",
  amountSortable: "DEFECT-9a — single-column Amount header is sortable (no sortable={false})",
  groupingToggle: "DEFECT-9b — visible month/all-dates grouping toggle drives turnOffGrouping",
  customerReferenceSelect: 'DEFECT-10 — Customer field uses ReferenceSelect createKind="customer"',
};

export function run() {
  const full = path.join(repoRoot, TARGET);
  if (!fs.existsSync(full)) {
    console.error(`[verify-banking-designview-qbo-parity] FAIL — missing ${TARGET}`);
    return { ok: false, offenders: [`${TARGET} — MISSING`] };
  }
  const src = stripComments(fs.readFileSync(full, "utf8"));
  const results = checksFor(src);
  const offenders = Object.entries(results)
    .filter(([, ok]) => !ok)
    .map(([key]) => CHECK_LABELS[key]);
  if (offenders.length) {
    console.error("[verify-banking-designview-qbo-parity] FAIL — a Doc-18 parity fix regressed:");
    for (const f of offenders) console.error(`  - ${f}`);
    return { ok: false, offenders };
  }
  console.log("[verify-banking-designview-qbo-parity] PASS — all 5 Doc-18 parity assertions hold (defects 1,7,9,10)");
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const good = `
    <div className="mt-2 flex items-center justify-between gap-2">
      <Button onClick={() => setSplitTx(tx)}>Split</Button>
      <div className="flex gap-2"><Button onClick={() => void postTransaction(tx)}>Post</Button></div>
    </div>
    <button onClick={() => { setDraft(tx, { mode: "match" }); setExpandedTxId(tx.id); matchPaneRef.current?.scrollIntoView(); }}>Match</button>
    <div ref={matchPaneRef} />
    <TableHeaderCell columnKey="amount" label="Amount" sortKey={sortBy.key} onResize={setTxColWidth} />
    <button onClick={() => setViewSettings((prev) => ({ ...prev, turnOffGrouping: false, groupMode: "month" }))}>By month</button>
    <button onClick={() => setViewSettings((prev) => ({ ...prev, turnOffGrouping: true }))}>All dates</button>
    <ReferenceSelect createKind="customer" />
  `;
  const bad = `
    <div className="mt-2 flex justify-end gap-2">
      <Button onClick={() => setExpandedTxId(null)}>Cancel</Button>
      <Button onClick={() => void postTransaction(tx)}>Post</Button>
    </div>
    <button onClick={() => setDraft(tx, { mode: "match" })}>Match</button>
    <TableHeaderCell columnKey="amount" label="Amount" sortable={false} sortKey={sortBy.key} />
    <SelectCombobox value={draft.customerId}><option>Select customer</option></SelectCombobox>
  `;
  const g = checksFor(stripComments(good));
  const b = checksFor(stripComments(bad));
  const failures = [];
  for (const key of Object.keys(CHECK_LABELS)) {
    if (!g[key]) failures.push(`good fixture should PASS ${key}`);
    if (b[key]) failures.push(`bad fixture should FAIL ${key}`);
  }
  if (failures.length) {
    console.error("[verify-banking-designview-qbo-parity] SELFTEST FAIL:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`[verify-banking-designview-qbo-parity] SELFTEST PASS — ${Object.keys(CHECK_LABELS).length} checks flag regressions`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
