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
 * Usage:
 *   node scripts/verify-entity-label-rejects-serialized-json.mjs            # scan
 *   node scripts/verify-entity-label-rejects-serialized-json.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const LABEL_FILE = "apps/frontend/src/lib/entity-label.ts";

const JSON_GUARD_FN_RE = /function looksLikeSerializedJson\(/;
const ENTITY_LABEL_USES_GUARD_RE =
  /export function entityLabel\([\s\S]*?!looksLikeSerializedJson\(s\)[\s\S]*?\n\}/;
const VISIBLE_DOC_LABEL_USES_GUARD_RE =
  /export function visibleDocumentLabel\([\s\S]*?!looksLikeSerializedJson\(s\)[\s\S]*?\n\}/;

export function checkEntityLabelRejectsJson(src) {
  const offenders = [];
  if (!JSON_GUARD_FN_RE.test(src)) {
    offenders.push(`${LABEL_FILE}: looksLikeSerializedJson() helper missing — ACCT-F6284 regression.`);
    return offenders;
  }
  if (!ENTITY_LABEL_USES_GUARD_RE.test(src)) {
    offenders.push(
      `${LABEL_FILE}: entityLabel() no longer calls looksLikeSerializedJson() — a JSON-shaped "name" (e.g. accounting.bill_payments.memo poisoned by the bank_tx_split writer) would render as raw JSON again.`,
    );
  }
  if (!VISIBLE_DOC_LABEL_USES_GUARD_RE.test(src)) {
    offenders.push(
      `${LABEL_FILE}: visibleDocumentLabel() no longer calls looksLikeSerializedJson() — same ACCT-F6284 regression on the document-label path.`,
    );
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, LABEL_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkEntityLabelRejectsJson(src);
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
  const fixed = fs.readFileSync(path.join(repoRoot, LABEL_FILE), "utf8");

  const buggyOffenders = checkEntityLabelRejectsJson(buggy);
  const fixedOffenders = checkEntityLabelRejectsJson(fixed);

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
