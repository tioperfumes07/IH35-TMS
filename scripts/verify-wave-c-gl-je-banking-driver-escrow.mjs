#!/usr/bin/env node
/**
 * WAVE-C-gl_je-banking-driver-escrow — banking module "GL / JE" column, leaf driver_escrow.
 * VERTICAL-WIRING-LAW-2026-08-12.
 *
 * driver_escrow's "liability" col was already real (DriverEscrowTabContent.tsx renders the real
 * driver_finance.escrow_balances.current_balance_cents balance). "gl_je" was a genuine gap:
 * driver_finance.escrow_ledger has no journal_entry_id column of its own (§4 landmine, see the
 * route's own comment) — the JE that actually recorded a deduction lives one hop over, on the
 * settlement's GL posting run (driver_finance.driver_settlement_gl_runs.deduction_journal_entry_id,
 * written by the existing settlement GL poster, 202607060900_settlement_bill_payment_posting.sql).
 *
 * Originally fixed by a read-only LEFT JOIN escrow_ledger -> driver_settlement_gl_runs (by
 * settlement_id) -> accounting.journal_entries (by deduction_journal_entry_id). No new GL math, no
 * posting from this read, no new table. A movement with no settlement_id or an unposted settlement
 * honestly returns NULL (renders "—"), never a fabricated link.
 *
 * GR1-MONEY-GUARDS-STALE-AFTER-CANONICAL-REFRACTORS (2026-08-31): ACCT-F5703 later repointed this
 * SAME timeline query off the near-empty driver_finance.escrow_ledger entirely, onto the real
 * accounting.escrow_postings/escrow_accounts subledger (Block-23) that /accounting/escrow already
 * reads correctly. That subledger's postings are ALREADY directly linked to their GL journal entry
 * via ep.linked_journal_entry_id -- no settlement-hop join is needed anymore, because the retired
 * driver_finance.escrow_ledger path (which had no JE column of its own) is exactly what forced the
 * settlement-hop detour in the first place. The two checks below were re-anchored to the current
 * canonical shape (JOIN accounting.escrow_postings ep ... LEFT JOIN accounting.journal_entries je
 * ON je.id = ep.linked_journal_entry_id) rather than the retired one, per LAW's own Rule 4 (import
 * canon, never re-implement / never demand a retired shape). See
 * verify-banking-driver-escrow-uses-accounting-escrow-source.mjs for the sibling guard that already
 * enforces this same canonical source across the OTHER banking driver-escrow surfaces.
 *
 * banking's OTHER open liability/gl_je leaf, "factoring", stays undocumented-OPEN here — it reads
 * views.factoring_balance_invoice_linkage, the SAME HELD-FOR-JORGE TIER-1-FINANCIAL view the 3
 * documented-held factoring-module leaves depend on (db/migrations/.held-migrations.json). Not
 * forced.
 *
 * @matrix-built {"modules":["banking"],"cols":["gl_je"],"leafRe":"^driver_escrow$","task":"WAVE-C-gl_je-banking-driver-escrow","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["gl_je"],"leafRe":"^(transactions\\.list|transactions\\.categorize|reconciliation)$","task":"WAVE-C-gl_je-banking-transactions-recon","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-banking-driver-escrow.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-banking-driver-escrow";

const CHECKS = [
  {
    name: "escrow-visualizer.routes.ts joins accounting.escrow_postings for the driver-escrow timeline",
    file: "apps/backend/src/banking/escrow-visualizer.routes.ts",
    pattern: /JOIN accounting\.escrow_postings ep/,
  },
  {
    name: "escrow-visualizer.routes.ts joins accounting.journal_entries via ep.linked_journal_entry_id (no settlement hop)",
    file: "apps/backend/src/banking/escrow-visualizer.routes.ts",
    pattern: /je\.id = ep\.linked_journal_entry_id/,
  },
  {
    name: "DriverEscrowTabContent.tsx renders the Journal Entry column",
    file: "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx",
    pattern: /banking-escrow-journal-entry-link/,
  },
  {
    name: "BankingTransactionsDesignView.tsx EntityLinks matched_journal_entry_id",
    file: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    pattern: /kind=\"journal_entry\"[\s\S]*matched_journal_entry_id/,
  },
  {
    name: "BankReconciliationPage.tsx EntityLinks journal_entry_id",
    file: "apps/frontend/src/pages/banking/BankReconciliationPage.tsx",
    pattern: /kind=\"journal_entry\"[\s\S]*journal_entry_id/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/backend/src/banking/escrow-visualizer.routes.ts":
      "JOIN accounting.escrow_postings ep ON ep.escrow_account_id = ea.id ... LEFT JOIN accounting.journal_entries je ON je.id = ep.linked_journal_entry_id",
    "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx": 'data-testid="banking-escrow-journal-entry-link"',
    "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx":
      'kind="journal_entry"\nid={tx.matched_journal_entry_id}',
    "apps/frontend/src/pages/banking/BankReconciliationPage.tsx":
      'kind="journal_entry" id={entry.journal_entry_id}',
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — driver_escrow gl_je wiring present`);
