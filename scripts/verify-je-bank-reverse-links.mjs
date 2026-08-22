#!/usr/bin/env node
/**
 * ACCT-F18 — Journal Entry → bank reverse drill (Law §9 twin of ACCT-F16/F17).
 *
 * match.service stamps banking.bank_transactions.matched_journal_entry_id on accept.
 * JE list/detail must project matched_bank_transaction_id and link kind=bank_transaction.
 *
 * Usage:
 *   node scripts/verify-je-bank-reverse-links.mjs
 *   node scripts/verify-je-bank-reverse-links.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-je-bank-reverse-links";

const SERVICE = "apps/backend/src/accounting/journal-entries.service.ts";
const API = "apps/frontend/src/api/accounting.ts";
const DETAIL = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";
const LIST = "apps/frontend/src/pages/accounting/ManualJEListPage.tsx";

/** @param {Record<string, string | null>} files */
export function check(files) {
  const f = [];
  const service = files[SERVICE] ?? "";
  if (!/matched_journal_entry_id/.test(service) || !/matched_bank_transaction_id/.test(service)) {
    f.push(`${SERVICE}: must project matched_bank_transaction_id via matched_journal_entry_id`);
  }
  if (!/JE_MATCHED_BANK_TRANSACTION_ID_SQL|bt\.matched_journal_entry_id\s*=\s*je\.id/.test(service)) {
    f.push(`${SERVICE}: missing JE_MATCHED_BANK subquery (or equivalent)`);
  }

  if (!/matched_bank_transaction_description/.test(service) || !/JE_MATCHED_BANK_TRANSACTION_LABEL_SQL/.test(service)) {
    f.push(`${SERVICE}: must project matched_bank_transaction_description (merchant/description) beside the id hop`);
  }

  const api = files[API] ?? "";
  if (!/matched_bank_transaction_id/.test(api) || !/matched_bank_transaction_description/.test(api) || !/JournalEntry\s*=/.test(api)) {
    f.push(`${API}: JournalEntry must declare matched_bank_transaction_id and matched_bank_transaction_description`);
  }

  const detail = files[DETAIL] ?? "";
  if (!/matched_bank_transaction_id/.test(detail) || !/kind=["']bank_transaction["']/.test(detail)) {
    f.push(`${DETAIL}: must link kind=bank_transaction from matched_bank_transaction_id`);
  }
  if (/entityLabel\(\s*null\s*,\s*entry\.matched_bank_transaction_id/.test(detail)) {
    f.push(`${DETAIL}: must not entityLabel(null, matched_bank_transaction_id) — use description`);
  }

  const list = files[LIST] ?? "";
  if (!/matched_bank_transaction_id/.test(list) || !/kind=["']bank_transaction["']/.test(list)) {
    f.push(`${LIST}: must link bank_transaction column from matched_bank_transaction_id`);
  }
  if (/entityLabel\(\s*null\s*,\s*entry\.matched_bank_transaction_id/.test(list)) {
    f.push(`${LIST}: must not entityLabel(null, matched_bank_transaction_id) — use description`);
  }

  return f;
}

export function run(root = ROOT) {
  /** @type {Record<string, string | null>} */
  const files = {};
  for (const rel of [SERVICE, API, DETAIL, LIST]) {
    try {
      files[rel] = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      files[rel] = null;
    }
  }
  return check(files);
}

if (process.argv.includes("--selftest")) {
  const good = {
    [SERVICE]: `const JE_MATCHED_BANK_TRANSACTION_ID_SQL = \`SELECT bt.id WHERE bt.matched_journal_entry_id = je.id\`;
      const JE_MATCHED_BANK_TRANSACTION_LABEL_SQL = \`SELECT bt.merchant_name\`;
      AS matched_bank_transaction_id AS matched_bank_transaction_description`,
    [API]: `export type JournalEntry = { matched_bank_transaction_id?: string | null; matched_bank_transaction_description?: string | null; };`,
    [DETAIL]: `<EntityLink kind="bank_transaction" id={entry.matched_bank_transaction_id} label={entityLabel(entry.matched_bank_transaction_description, entry.matched_bank_transaction_id, "Bank transaction")} />`,
    [LIST]: `key: "matched_bank_transaction_id", render: (r) => <EntityLink kind="bank_transaction" id={r.matched_bank_transaction_id} label={entityLabel(r.matched_bank_transaction_description, r.matched_bank_transaction_id, "Bank transaction")} />`,
  };
  if (check(good).length) throw new Error(`${LABEL} PASS path failed: ${check(good).join("; ")}`);
  const bad = { ...good, [DETAIL]: `<div>no bank</div>` };
  if (!check(bad).length) throw new Error(`${LABEL} FAIL path did not catch missing detail bank hop`);
  const tombstone = {
    ...good,
    [LIST]: `key: "matched_bank_transaction_id", render: (r) => <EntityLink kind="bank_transaction" id={r.matched_bank_transaction_id} label={entityLabel(null, entry.matched_bank_transaction_id, "Bank transaction")} />`,
  };
  if (!check(tombstone).length) throw new Error(`${LABEL} FAIL path did not catch UUID tombstone Bank label`);
  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
