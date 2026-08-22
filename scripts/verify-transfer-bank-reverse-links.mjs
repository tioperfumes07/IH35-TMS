#!/usr/bin/env node
/**
 * BANK-F12 — Transfer → bank reverse drill (Law §9 twin of ACCT-F16/F17/F18).
 *
 * Feed/recon stamps banking.bank_transactions.matched_transfer_id.
 * Transfers list/detail must project matched_bank_transaction_id and link kind=bank_transaction.
 *
 * Usage:
 *   node scripts/verify-transfer-bank-reverse-links.mjs
 *   node scripts/verify-transfer-bank-reverse-links.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-transfer-bank-reverse-links";

const SERVICE = "apps/backend/src/banking/transfers.service.ts";
const API = "apps/frontend/src/api/banking.ts";
const LIST = "apps/frontend/src/pages/banking/TransfersListPage.tsx";

/** @param {Record<string, string | null>} files */
export function check(files) {
  const f = [];
  const service = files[SERVICE] ?? "";
  if (!/matched_transfer_id/.test(service) || !/matched_bank_transaction_id/.test(service)) {
    f.push(`${SERVICE}: must project matched_bank_transaction_id via matched_transfer_id`);
  }
  if (!/TRANSFER_MATCHED_BANK_TRANSACTION_ID_SQL|bt\.matched_transfer_id\s*=\s*t\.id/.test(service)) {
    f.push(`${SERVICE}: missing TRANSFER_MATCHED_BANK subquery (or equivalent)`);
  }
  if (!/TRANSFER_MATCHED_BANK_TRANSACTION_LABEL_SQL[\s\S]*bt\.operating_company_id = t\.operating_company_id[\s\S]*bt\.matched_transfer_id = t\.id/.test(service)) {
    f.push(`${SERVICE}: matched bank transaction human label must be company scoped`);
  }

  const api = files[API] ?? "";
  if (!/matched_bank_transaction_id/.test(api) || !/export type Transfer/.test(api)) {
    f.push(`${API}: Transfer must declare matched_bank_transaction_id`);
  }
  if (!/matched_bank_transaction_label/.test(api)) f.push(`${API}: Transfer must declare matched_bank_transaction_label`);

  const list = files[LIST] ?? "";
  if (!/matched_bank_transaction_id/.test(list) || !/kind=["']bank_transaction["']/.test(list)) {
    f.push(`${LIST}: must link bank_transaction column from matched_bank_transaction_id`);
  }
  if (!/entityLabel\(row\.matched_bank_transaction_label, row\.matched_bank_transaction_id, "Bank transaction"\)/.test(list)) {
    f.push(`${LIST}: bank transaction drill must use the human transaction label`);
  }

  return f;
}

export function run(root = ROOT) {
  /** @type {Record<string, string | null>} */
  const files = {};
  for (const rel of [SERVICE, API, LIST]) {
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
    [SERVICE]: `const TRANSFER_MATCHED_BANK_TRANSACTION_ID_SQL = \`SELECT bt.id WHERE bt.matched_transfer_id = t.id\`;
      const TRANSFER_MATCHED_BANK_TRANSACTION_LABEL_SQL = \`SELECT bt.description FROM banking.bank_transactions bt WHERE bt.operating_company_id = t.operating_company_id AND bt.matched_transfer_id = t.id\`;
      AS matched_bank_transaction_id`,
    [API]: `export type Transfer = { matched_bank_transaction_id?: string | null; matched_bank_transaction_label?: string | null; };`,
    [LIST]: `key: "matched_bank_transaction_id", render: (row) => <EntityLink kind="bank_transaction" id={row.matched_bank_transaction_id} label={entityLabel(row.matched_bank_transaction_label, row.matched_bank_transaction_id, "Bank transaction")} />`,
  };
  if (check(good).length) throw new Error(`${LABEL} PASS path failed: ${check(good).join("; ")}`);
  const bad = { ...good, [LIST]: `<div>no bank</div>` };
  if (!check(bad).length) throw new Error(`${LABEL} FAIL path did not catch missing list bank hop`);
  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
