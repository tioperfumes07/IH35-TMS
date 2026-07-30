#!/usr/bin/env node
/**
 * BANK-F02 follow-on — /banking/accounts/:id must open Record Transfer (not Sync/Disconnect only).
 * Companion to verify-bank-record-transfer-trigger-wired (Home + Transfers list).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-account-detail-record-transfer";
const DETAIL = "apps/frontend/src/pages/banking/BankAccountDetail.tsx";

/** @param {{ detail: string | null }} input */
export function check({ detail }) {
  const f = [];
  if (!detail) {
    f.push(`${DETAIL}: missing`);
    return f;
  }
  if (!/from ["']\.\/TransferModal["']/.test(detail) && !/from ["']\.\/TransferModal\.tsx["']/.test(detail)) {
    f.push(`${DETAIL}: must import TransferModal`);
  }
  if (!/data-testid=["']bank-account-detail-record-transfer["']/.test(detail)) {
    f.push(`${DETAIL}: must expose data-testid=bank-account-detail-record-transfer`);
  }
  if (!/\+ Record Transfer/.test(detail) || !/setTransferModalOpen\(true\)/.test(detail)) {
    f.push(`${DETAIL}: must open TransferModal via + Record Transfer`);
  }
  if (!/<TransferModal[\s\S]*prefill=\{id \? \{ from_account_id: id \} : null\}/.test(detail)) {
    f.push(`${DETAIL}: TransferModal must prefill from_account_id with the route account id`);
  }
  return f;
}

export function run(root = ROOT) {
  let detail = null;
  try {
    detail = fs.readFileSync(path.join(root, DETAIL), "utf8");
  } catch {
    detail = null;
  }
  return check({ detail });
}

if (process.argv.includes("--selftest")) {
  const good = `
    import { TransferModal } from "./TransferModal";
    <ActionButton data-testid="bank-account-detail-record-transfer" onClick={() => setTransferModalOpen(true)}>+ Record Transfer</ActionButton>
    <TransferModal open={transferModalOpen} prefill={id ? { from_account_id: id } : null} onClose={() => {}} onSaved={() => {}} />
  `;
  if (check({ detail: good }).length) throw new Error(`${LABEL} PASS fail`);
  if (!check({ detail: `<ActionButton>Sync Now</ActionButton>` }).length) throw new Error(`${LABEL} FAIL fail`);
  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
