#!/usr/bin/env node
/**
 * ACCT-SURF-09 reverse-drill — Settlements → Escrow → Factoring JE (not toast / dead-end).
 *
 * Complements scripts/verify-acct-surf-09-crosslinks.mjs (More ▾ + forward chrome).
 * Does NOT flip scoreboard PASS — Neon density + browser economics stay UNVERIFIED (Rule 23).
 *
 *   node scripts/verify-acct-surf-09-reverse-drill.mjs
 *   node scripts/verify-acct-surf-09-reverse-drill.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-surf-09-reverse-drill";

const FILES = {
  settlementDetail: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
  escrowPage: "apps/frontend/src/pages/accounting/EscrowPage.tsx",
  factoringDetail: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
  accountingApi: "apps/frontend/src/api/accounting.ts",
  packetRoute: "apps/backend/src/accounting/factoring-advances.routes.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function contractErrors(src) {
  const errors = [];

  // Settlements → Accounting Escrow (canonical books), not toast-only.
  if (!src.settlementDetail.includes("/accounting/escrow")) {
    errors.push("SettlementDetailPage must navigate to /accounting/escrow for escrow reverse drill");
  }
  if (!src.settlementDetail.includes("holder_id") || !src.settlementDetail.includes("onOpenEscrow")) {
    errors.push("SettlementDetailPage DebtBanner onOpenEscrow must pass holder_id deep-link");
  }
  if (!src.settlementDetail.includes("onOpenTimeline")) {
    errors.push("SettlementDetail EscrowVisualizer onOpenTimeline must reverse-drill to Accounting Escrow");
  }
  if (/pushToast\([^)]*escrow/i.test(src.settlementDetail) && !src.settlementDetail.includes("/accounting/escrow")) {
    errors.push("SettlementDetail must not toast-only for escrow open when reverse drill is required");
  }

  // Escrow page: Accounting chrome + deep-link + cross-links.
  if (!src.escrowPage.includes("AccountingSubNavWrapper")) {
    errors.push("EscrowPage must wrap AccountingSubNavWrapper (Accounting More ▾ chrome)");
  }
  if (!src.escrowPage.includes("useSearchParams") || !src.escrowPage.includes("holder_id")) {
    errors.push("EscrowPage must honor ?holder_id= / ?account_id= deep-links");
  }
  if (!src.escrowPage.includes("escrow-settlements-cross-link") || !src.escrowPage.includes("/driver-finance/settlements")) {
    errors.push("EscrowPage must cross-link Settlements");
  }
  if (!src.escrowPage.includes("escrow-factoring-cross-link") || !src.escrowPage.includes("/accounting/factoring")) {
    errors.push("EscrowPage must cross-link Factoring");
  }

  // Factoring detail: packet + JE EntityLinks.
  if (!src.accountingApi.includes("getFactoringAdvancePacket") || !src.accountingApi.includes("/packet")) {
    errors.push("accounting.ts must export getFactoringAdvancePacket → /factoring-advances/:id/packet");
  }
  if (!src.factoringDetail.includes("getFactoringAdvancePacket")) {
    errors.push("FactoringDetailPage must load advance packet for JE reverse drill");
  }
  if (!src.factoringDetail.includes('kind="journal_entry"') || !src.factoringDetail.includes("reserve_movements")) {
    errors.push("FactoringDetailPage must EntityLink journal_entry on reserve_movements / interest accruals");
  }
  if (!src.packetRoute.includes("/packet") || !src.packetRoute.includes("reserve_movements")) {
    errors.push("Backend factoring packet route must remain mounted with reserve_movements");
  }

  return errors;
}

function selftest() {
  const bad = {
    settlementDetail: "export function SettlementDetailPage() { return null }",
    escrowPage: "export function EscrowPage() { return null }",
    factoringDetail: "export function FactoringDetailPage() { return null }",
    accountingApi: "export function listEscrowAccounts() {}",
    packetRoute: "// empty",
  };
  const errs = contractErrors(bad);
  if (errs.length < 5) {
    throw new Error(`${LABEL} selftest expected multiple failures, got ${errs.length}`);
  }
  console.log(`${LABEL} selftest PASS (${errs.length} planted failures)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const errors = contractErrors(src);
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
