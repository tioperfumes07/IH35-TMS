#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^escrow$","task":"ACCT-F5313-accounting-escrow-holder-reverse"} */
/**
 * GUARD: the driver's own profile can jump straight into the canonical Accounting → Escrow ledger
 * pre-scoped to that driver's holder account, and the ledger itself honors the deep link on load.
 *
 * EscrowHistoryView.tsx (mounted on the driver profile) already links OUT to the Banking Driver
 * Escrow visualizer, but had no reverse hop into /accounting/escrow — the canonical subledger/GL
 * surface (accounting.required.json leaf "escrow") — even though EscrowPage.tsx already reads a
 * `holder_id` query param on load (ACCT-SURF-09) to select a matching account row. The Required
 * `reverse_link` column for accounting:escrow was therefore unproven: nothing outside EscrowPage
 * itself demonstrably drilled INTO it. Last open leaf of CODEX-ZERO-REMAINDER-PROTECTED-MONEY-20.
 *
 * Fix contract this guard pins:
 *   1. EscrowHistoryView.tsx links to /accounting/escrow?holder_id=<this driver>.
 *   2. EscrowPage.tsx reads holder_id from the URL search params on load.
 *   3. EscrowPage.tsx resolves the deep link against a loaded account row (holder_id match) and
 *      selects it — a hand-typed/linked param that is silently ignored is not a real reverse link.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_VIEW = "apps/frontend/src/pages/drivers/operations/EscrowHistoryView.tsx";
const ESCROW_PAGE = "apps/frontend/src/pages/accounting/EscrowPage.tsx";
const FILES = [HISTORY_VIEW, ESCROW_PAGE];
const LABEL = "verify-accounting-escrow-holder-reverse-link";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertAccountingEscrowHolderReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const historyView = src[HISTORY_VIEW];
  const escrowPage = src[ESCROW_PAGE];

  if (!/\/accounting\/escrow\?holder_id=\$\{driverId\}/.test(historyView)) {
    problems.push(`${HISTORY_VIEW}: must link to /accounting/escrow?holder_id=\${driverId}`);
  }
  if (!/searchParams\.get\("holder_id"\)/.test(escrowPage)) {
    problems.push(`${ESCROW_PAGE}: must read holder_id from the URL search params`);
  }
  if (!/row\.holder_id\s*===\s*holderId/.test(escrowPage)) {
    problems.push(`${ESCROW_PAGE}: must resolve the deep-linked holder_id against a loaded account row`);
  }
  if (!/setSelectedAccountId\(next\.id\)/.test(escrowPage)) {
    problems.push(`${ESCROW_PAGE}: must select the resolved account row, not just read the param`);
  }
  return problems;
}

function selftest() {
  const good = {
    [HISTORY_VIEW]: `
      import { Link } from "react-router-dom";
      <Link to={\`/accounting/escrow?holder_id=\${driverId}\`}>View in Accounting</Link>
    `,
    [ESCROW_PAGE]: `
      const accountId = searchParams.get("account_id");
      const holderId = searchParams.get("holder_id");
      if (!accountId && !holderId) return;
      let next;
      if (accountId) next = accountRows.find((row) => row.id === accountId);
      if (!next && holderId) next = accountRows.find((row) => row.holder_id === holderId);
      if (next && next.id !== selectedAccountId) {
        setSelectedAccountId(next.id);
      }
    `,
  };
  const goodProblems = assertAccountingEscrowHolderReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [HISTORY_VIEW]: good[HISTORY_VIEW].replace("/accounting/escrow?holder_id=${driverId}", "/accounting/escrow") },
    { ...good, [ESCROW_PAGE]: good[ESCROW_PAGE].replace('searchParams.get("holder_id")', '""') },
    { ...good, [ESCROW_PAGE]: good[ESCROW_PAGE].replace("row.holder_id === holderId", "row.id === holderId") },
    { ...good, [ESCROW_PAGE]: good[ESCROW_PAGE].replace("setSelectedAccountId(next.id);", "") },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertAccountingEscrowHolderReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertAccountingEscrowHolderReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
