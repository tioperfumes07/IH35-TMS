#!/usr/bin/env node
/**
 * ACCT-F5703 — `/banking/driver-escrow` (and the "Driver Escrow Pool" KPI tile) used to read
 * driver_finance.escrow_balances/escrow_ledger — a separate, near-empty operational ledger (1 row
 * system-wide, live-confirmed 2026-08-21) that was never kept in sync with the real GL-linked
 * liability subledger accounting.escrow_accounts/escrow_postings (Block-23) that /accounting/escrow
 * already reads correctly. Filed by CC-2 as BANKING-DRIVER-ESCROW-VIEW-BLIND-TO-REAL-ACCOUNTING-DATA.
 *
 * This guard locks the fix shape across all four code sites that fed the banking driver-escrow
 * surfaces from the wrong table, plus the KPI view migration.
 *
 * FAIL: any site still joins/sources the stale driver_finance.escrow_balances/escrow_ledger tables
 * for driver-escrow balance/timeline/register/KPI data, or the accounting.escrow_accounts repoint is
 * missing.
 * PASS: all four sites + the view migration are repointed.
 *
 * Self-test: node scripts/verify-banking-driver-escrow-uses-accounting-escrow-source.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-banking-driver-escrow-uses-accounting-escrow-source";
const VISUALIZER = "apps/backend/src/banking/escrow-visualizer.routes.ts";
const BANKING_ROUTES = "apps/backend/src/banking/banking.routes.ts";
const COUNTS = "apps/backend/src/banking/driver-escrow-counts.ts";
const MIGRATION = "db/migrations/202612960000_acct_banking_driver_escrow_source_repoint.sql";

function failures(sources) {
  const out = [];
  const visualizer = sources[VISUALIZER];
  const bankingRoutes = sources[BANKING_ROUTES];
  const counts = sources[COUNTS];
  const migration = sources[MIGRATION];

  // Site 1+2: escrow-visualizer.routes.ts (driver-balances list + per-driver timeline)
  if (/JOIN driver_finance\.escrow_balances/.test(visualizer) || /FROM driver_finance\.escrow_ledger/.test(visualizer)) {
    out.push(`${VISUALIZER}: still sources driver_finance.escrow_balances/escrow_ledger — must read accounting.escrow_accounts/escrow_postings`);
  }
  if (!/LEFT JOIN accounting\.escrow_accounts ea/.test(visualizer)) {
    out.push(`${VISUALIZER}: driver-balances list must LEFT JOIN accounting.escrow_accounts`);
  }
  if (!/FROM accounting\.escrow_accounts ea\s*\n\s*JOIN accounting\.escrow_postings ep/.test(visualizer)) {
    out.push(`${VISUALIZER}: per-driver timeline must join accounting.escrow_accounts + accounting.escrow_postings`);
  }
  if (!/purpose = 'driver_bond'/.test(visualizer)) {
    out.push(`${VISUALIZER}: must scope to purpose='driver_bond' (driver escrow specifically, not vendor/factor reserves)`);
  }

  // Site 3: banking.routes.ts virtual "escrow" register branch
  // GR1-MONEY-GUARDS-STALE-AFTER-CANONICAL-REFRACTORS — this used to slice a fixed 1400 chars from
  // the branch start, which stopped BEFORE the real accounting.escrow_postings/escrow_accounts joins
  // once BANKING-DRIVER-ESCROW-REGISTER-MISSING-SETTLEMENT-JE-LINK/BANK-F5751/BANK-F6050 added ~1400
  // chars of explanatory comment ahead of the SELECT (live-measured: FROM lands at offset 2529, JOIN
  // at 2578, branch itself runs 3381 chars before the next `if (virtual ===` sibling). A magic number
  // goes stale every time a future finding adds another comment; slicing to the NEXT sibling `if
  // (virtual === ` branch (or end of file) is self-sizing and cannot go stale the same way again.
  const escrowBranchStart = bankingRoutes.indexOf('if (virtual === "escrow")');
  if (escrowBranchStart === -1) {
    out.push(`${BANKING_ROUTES}: virtual "escrow" register branch not found — re-check this guard`);
  } else {
    const nextBranch = bankingRoutes.indexOf('if (virtual === ', escrowBranchStart + 1);
    const scoped = bankingRoutes.slice(escrowBranchStart, nextBranch === -1 ? undefined : nextBranch);
    if (/FROM driver_finance\.escrow_ledger/.test(scoped)) {
      out.push(`${BANKING_ROUTES}: virtual escrow register branch still sources driver_finance.escrow_ledger`);
    }
    if (!/FROM accounting\.escrow_postings ep/.test(scoped) || !/JOIN accounting\.escrow_accounts ea/.test(scoped)) {
      out.push(`${BANKING_ROUTES}: virtual escrow register branch must read accounting.escrow_postings/escrow_accounts`);
    }
  }

  // Site 4: driver-escrow-counts.ts (KPI counts)
  if (/JOIN driver_finance\.escrow_balances/.test(counts)) {
    out.push(`${COUNTS}: KPI counts still join driver_finance.escrow_balances`);
  }
  if (!/JOIN accounting\.escrow_accounts ea/.test(counts)) {
    out.push(`${COUNTS}: KPI counts must join accounting.escrow_accounts`);
  }
  if (!/holder_type = 'driver'/.test(counts) || !/purpose = 'driver_bond'/.test(counts)) {
    out.push(`${COUNTS}: KPI counts must scope to holder_type='driver' AND purpose='driver_bond'`);
  }

  // Site 5: the KPI view migration itself
  if (!migration) {
    out.push(`${MIGRATION}: migration file missing`);
  } else {
    if (!/CREATE OR REPLACE VIEW views\.banking_account_tiles/.test(migration)) {
      out.push(`${MIGRATION}: must CREATE OR REPLACE VIEW views.banking_account_tiles`);
    }
    if (/FROM driver_finance\.escrow_balances eb/.test(migration)) {
      out.push(`${MIGRATION}: escrow_union must not source driver_finance.escrow_balances`);
    }
    if (!/FROM accounting\.escrow_accounts ea/.test(migration)) {
      out.push(`${MIGRATION}: escrow_union must source accounting.escrow_accounts`);
    }
  }

  return out;
}

const live = {
  [VISUALIZER]: fs.readFileSync(VISUALIZER, "utf8"),
  [BANKING_ROUTES]: fs.readFileSync(BANKING_ROUTES, "utf8"),
  [COUNTS]: fs.readFileSync(COUNTS, "utf8"),
  [MIGRATION]: fs.existsSync(MIGRATION) ? fs.readFileSync(MIGRATION, "utf8") : "",
};

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    {
      name: "visualizer driver-balances list reverted to driver_finance.escrow_balances",
      file: VISUALIZER,
      mutate: (text) => text.replace("LEFT JOIN accounting.escrow_accounts ea", "LEFT JOIN driver_finance.escrow_balances ea"),
    },
    {
      name: "visualizer per-driver timeline join to accounting.escrow_postings removed",
      file: VISUALIZER,
      mutate: (text) => text.replace("JOIN accounting.escrow_postings ep", "-- JOIN accounting.escrow_postings ep"),
    },
    {
      name: "visualizer driver_bond purpose scope dropped",
      file: VISUALIZER,
      mutate: (text) => text.replace(/purpose = 'driver_bond'/g, "1=1"),
    },
    {
      name: "banking.routes.ts virtual escrow branch reverted to driver_finance.escrow_ledger",
      file: BANKING_ROUTES,
      mutate: (text) => text.replace("FROM accounting.escrow_postings ep\n              JOIN accounting.escrow_accounts ea", "FROM driver_finance.escrow_ledger el"),
    },
    {
      name: "driver-escrow-counts.ts reverted to driver_finance.escrow_balances",
      file: COUNTS,
      mutate: (text) => text.replace(/JOIN accounting\.escrow_accounts ea/g, "JOIN driver_finance.escrow_balances ea"),
    },
    {
      name: "migration escrow_union reverted to driver_finance.escrow_balances",
      file: MIGRATION,
      mutate: (text) => text.replace("FROM accounting.escrow_accounts ea", "FROM driver_finance.escrow_balances ea"),
    },
  ];
  const escaped = [];
  for (const { name, file, mutate } of mutations) {
    const mutated = mutate(live[file]);
    if (mutated === live[file]) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    const mutant = { ...live, [file]: mutated };
    if (failures(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — banking driver-escrow surfaces (balances list, timeline, register, KPI counts, KPI view) all read the canonical accounting.escrow_accounts/escrow_postings subledger`);
