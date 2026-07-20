#!/usr/bin/env node
/**
 * verify-bank-recon-workspace-has-balance-header.mjs (bnk-03)
 *
 * Root cause: ReconciliationWorkspace / BankReconciliationPage lacked the
 * QBO-standard header (Beginning balance / Ending balance / Last reconciled).
 *
 * Fix (UI-only, no migration): surface prior reconciled session's
 * statement_balance_cents as beginning, current statement_balance_cents as
 * ending, and reconciled_at as last-reconciled — columns already on
 * banking.reconciliation_sessions (0075). No invented balance column.
 *
 * Usage:
 *   node scripts/verify-bank-recon-workspace-has-balance-header.mjs
 *   node scripts/verify-bank-recon-workspace-has-balance-header.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-recon-workspace-has-balance-header";
const WORKSPACE = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";
const RECON_PAGE = "apps/frontend/src/pages/banking/BankReconciliationPage.tsx";

const REQUIRED = ["Beginning balance", "Ending balance", "Last reconciled"];

/** @param {{ workspace: string, reconPage: string }} input */
export function check({ workspace, reconPage }) {
  const f = [];

  for (const [rel, src] of [
    [WORKSPACE, workspace],
    [RECON_PAGE, reconPage],
  ]) {
    if (!src) {
      f.push(`${rel}: missing`);
      continue;
    }
    for (const label of REQUIRED) {
      if (!src.includes(label)) {
        f.push(`${rel}: must render "${label}" in the recon balance header`);
      }
    }
    if (!/getReconciliationSessions/.test(src)) {
      f.push(`${rel}: must call getReconciliationSessions (prior session → beginning / last reconciled)`);
    }
    if (!/statement_balance_cents/.test(src)) {
      f.push(`${rel}: must read statement_balance_cents (existing column — not invented beginning balance)`);
    }
    if (!/reconciled_at/.test(src)) {
      f.push(`${rel}: must read reconciled_at for Last reconciled`);
    }
    // Must not invent a non-existent column in this UI-only block.
    if (/beginning_balance_cents/.test(src)) {
      f.push(`${rel}: must not reference beginning_balance_cents (column does not exist — H2 gated)`);
    }
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return "";
    }
  };
  return check({ workspace: read(WORKSPACE), reconPage: read(RECON_PAGE) });
}

function selftest() {
  const good = `
    getReconciliationSessions
    statement_balance_cents
    reconciled_at
    <div>Beginning balance</div>
    <div>Ending balance</div>
    <div>Last reconciled</div>
  `;
  const badMissing = `
    getReconciliationSessions
    statement_balance_cents
    reconciled_at
    <div>Ending balance</div>
  `;
  const badInvented = `
    getReconciliationSessions
    beginning_balance_cents
    statement_balance_cents
    reconciled_at
    <div>Beginning balance</div>
    <div>Ending balance</div>
    <div>Last reconciled</div>
  `;

  const checks = [
    ["good fixture passes", check({ workspace: good, reconPage: good }).length === 0],
    [
      "missing Beginning balance fails",
      check({ workspace: badMissing, reconPage: good }).some((m) => m.includes("Beginning balance")),
    ],
    [
      "invented beginning_balance_cents fails",
      check({ workspace: badInvented, reconPage: good }).some((m) => m.includes("beginning_balance_cents")),
    ],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const failures = run();
    if (failures.length) {
      console.error(`${LABEL} FAIL:`);
      for (const msg of failures) console.error("  ✗ " + msg);
      process.exit(1);
    }
    console.log(
      `${LABEL} PASS — both recon pages render Beginning/Ending/Last reconciled from reconciliation_sessions`
    );
  }
}
