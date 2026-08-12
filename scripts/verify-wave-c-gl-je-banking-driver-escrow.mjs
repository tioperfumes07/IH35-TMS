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
 * Fixed by a read-only LEFT JOIN escrow_ledger -> driver_settlement_gl_runs (by settlement_id) ->
 * accounting.journal_entries (by deduction_journal_entry_id). No new GL math, no posting from this
 * read, no new table. A movement with no settlement_id or an unposted settlement honestly returns
 * NULL (renders "—"), never a fabricated link.
 *
 * banking's OTHER open liability/gl_je leaf, "factoring", stays undocumented-OPEN here — it reads
 * views.factoring_balance_invoice_linkage, the SAME HELD-FOR-JORGE TIER-1-FINANCIAL view the 3
 * documented-held factoring-module leaves depend on (db/migrations/.held-migrations.json). Not
 * forced.
 *
 * @matrix-built {"modules":["banking"],"cols":["gl_je"],"leafRe":"^driver_escrow$","task":"WAVE-C-gl_je-banking-driver-escrow","vertical":"column-wave"}
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
    name: "escrow-visualizer.routes.ts joins driver_settlement_gl_runs for deduction_journal_entry_id",
    file: "apps/backend/src/banking/escrow-visualizer.routes.ts",
    pattern: /LEFT JOIN driver_finance\.driver_settlement_gl_runs sgr/,
  },
  {
    name: "escrow-visualizer.routes.ts joins accounting.journal_entries for the resolved JE",
    file: "apps/backend/src/banking/escrow-visualizer.routes.ts",
    pattern: /je\.id = sgr\.deduction_journal_entry_id/,
  },
  {
    name: "DriverEscrowTabContent.tsx renders the Journal Entry column",
    file: "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx",
    pattern: /banking-escrow-journal-entry-link/,
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
      "LEFT JOIN driver_finance.driver_settlement_gl_runs sgr ON sgr.settlement_id = el.settlement_id ... je.id = sgr.deduction_journal_entry_id",
    "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx": 'data-testid="banking-escrow-journal-entry-link"',
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
