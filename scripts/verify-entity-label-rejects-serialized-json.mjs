#!/usr/bin/env node
/**
 * verify-entity-label-rejects-serialized-json.mjs  (ACCT-F6284)
 *
 * Root cause: apps/backend/src/banking/bank-transaction-splits.service.ts writes internal audit
 * metadata (`JSON.stringify({source:"bank_tx_split", ...})`) straight into `accounting.bills.memo`
 * and `accounting.bill_payments.memo` — columns the Accounting hub's "Find Transactions" panel
 * (and any other caller of the shared `entityLabel`/`visibleDocumentLabel` helpers) reads as a
 * fallback display label. Live-confirmed via the app's own API: 2 of 5 real bill_payments rows on
 * USMCA rendered literal `{"source":"bank_tx_split","bank_transaction_id":"f9cc15bf-...",
 * "split_line_no":2}` in the UI instead of a human label.
 *
 * The write-side fix (stop storing internal metadata in a human-facing memo column) is money-ledger
 * schema work filed separately for the owning lane. This guard protects the general-class fix
 * already shipped: `entityLabel`/`visibleDocumentLabel` (343 call sites app-wide) must treat a
 * serialized-JSON "name" the same as a uuid-shaped one — not a name, fall back honestly — so ANY
 * current or future caller handed JSON-poisoned data is protected, not just this one panel.
 *
 * SAME CLASS, second site: apps/backend/src/banking/bulk-transactions.ts (and
 * categorization.routes.ts / banking.routes.ts) write the identical
 * `JSON.stringify({ps_category, ps_item, qbo_account_id})` shape into
 * `banking.bank_transactions.categorization_memo`. When a categorized bank-feed line is later
 * minted into a bank-to-bank transfer (transfers.service.ts, mintTransferForBankFeedLineInClient:
 * `categorization_memo?.trim() || description?.trim()`), that JSON can land in
 * `banking.transfers.memo` — a free-text Memo field the Transfers list/detail page
 * (TransfersListPage.tsx) rendered with a bare `row.memo || "-"`, not through entityLabel (a Memo
 * column isn't an entity-name lookup). `looksLikeSerializedJson` is exported for this exact case
 * and TransfersListPage.tsx's `memoText()` helper reuses it directly.
 *
 * Usage:
 *   node scripts/verify-entity-label-rejects-serialized-json.mjs            # scan
 *   node scripts/verify-entity-label-rejects-serialized-json.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const LABEL_FILE = "apps/frontend/src/lib/entity-label.ts";
const TRANSFERS_FILE = "apps/frontend/src/pages/banking/TransfersListPage.tsx";

const JSON_GUARD_FN_RE = /export function looksLikeSerializedJson\(/;
const ENTITY_LABEL_USES_GUARD_RE =
  /export function entityLabel\([\s\S]*?!looksLikeSerializedJson\(s\)[\s\S]*?\n\}/;
const VISIBLE_DOC_LABEL_USES_GUARD_RE =
  /export function visibleDocumentLabel\([\s\S]*?!looksLikeSerializedJson\(s\)[\s\S]*?\n\}/;
const MEMO_TEXT_HELPER_RE = /function memoText\([\s\S]*?looksLikeSerializedJson\(s\)[\s\S]*?\n\}/;
const MEMO_TEXT_CALLED_TWICE_RE = /memoText\(row\.memo\)/;
const MEMO_TEXT_CALLED_DETAIL_RE = /memoText\(detail\.transfer\.memo\)/;

export function checkEntityLabelRejectsJson(labelSrc, transfersSrc = "") {
  const offenders = [];
  if (!JSON_GUARD_FN_RE.test(labelSrc)) {
    offenders.push(`${LABEL_FILE}: exported looksLikeSerializedJson() helper missing — ACCT-F6284 regression.`);
    return offenders;
  }
  if (!ENTITY_LABEL_USES_GUARD_RE.test(labelSrc)) {
    offenders.push(
      `${LABEL_FILE}: entityLabel() no longer calls looksLikeSerializedJson() — a JSON-shaped "name" (e.g. accounting.bill_payments.memo poisoned by the bank_tx_split writer) would render as raw JSON again.`,
    );
  }
  if (!VISIBLE_DOC_LABEL_USES_GUARD_RE.test(labelSrc)) {
    offenders.push(
      `${LABEL_FILE}: visibleDocumentLabel() no longer calls looksLikeSerializedJson() — same ACCT-F6284 regression on the document-label path.`,
    );
  }
  if (transfersSrc) {
    if (!MEMO_TEXT_HELPER_RE.test(transfersSrc)) {
      offenders.push(
        `${TRANSFERS_FILE}: memoText() helper missing or no longer calls looksLikeSerializedJson() — the Transfers Memo column/detail can render raw JSON again if a bank-feed line's categorization_memo was poisoned before being minted into a transfer.`,
      );
    }
    if (!MEMO_TEXT_CALLED_TWICE_RE.test(transfersSrc)) {
      offenders.push(`${TRANSFERS_FILE}: the Memo table column no longer routes through memoText().`);
    }
    if (!MEMO_TEXT_CALLED_DETAIL_RE.test(transfersSrc)) {
      offenders.push(`${TRANSFERS_FILE}: the transfer detail panel's Memo line no longer routes through memoText().`);
    }
  }
  return offenders;
}

export function run() {
  const labelSrc = fs.readFileSync(path.join(repoRoot, LABEL_FILE), "utf8");
  const transfersSrc = fs.readFileSync(path.join(repoRoot, TRANSFERS_FILE), "utf8");
  const offenders = checkEntityLabelRejectsJson(labelSrc, transfersSrc);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const UUID_SHAPE_RE = /uuid/;
    export function entityLabel(name, id, noun = "Record") {
      if (name != null) {
        const s = String(name).trim();
        if (s !== "" && !UUID_SHAPE_RE.test(s)) return s;
      }
      if (id != null) return \`\${noun} — not visible\`;
      return "Unassigned";
    }
    export function visibleDocumentLabel(name, _id, noun = "Record") {
      if (name != null) {
        const s = String(name).trim();
        if (s !== "" && !UUID_SHAPE_RE.test(s)) return s;
      }
      return noun;
    }
  `;
  const buggyTransfers = `
    { key: "memo", label: "Memo", render: (row) => row.memo || "-" },
    <p>Memo: {detail.transfer.memo || "-"}</p>
  `;
  const fixedLabel = fs.readFileSync(path.join(repoRoot, LABEL_FILE), "utf8");
  const fixedTransfers = fs.readFileSync(path.join(repoRoot, TRANSFERS_FILE), "utf8");

  const buggyOffenders = checkEntityLabelRejectsJson(buggy, buggyTransfers);
  const fixedOffenders = checkEntityLabelRejectsJson(fixedLabel, fixedTransfers);

  if (buggyOffenders.length >= 1 && fixedOffenders.length === 0) {
    console.log("verify:entity-label-rejects-serialized-json selftest OK");
    process.exit(0);
  }
  console.error("verify:entity-label-rejects-serialized-json selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify:entity-label-rejects-serialized-json FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify:entity-label-rejects-serialized-json OK — entityLabel/visibleDocumentLabel both reject a serialized-JSON name",
  );
}
