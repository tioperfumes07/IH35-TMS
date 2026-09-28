#!/usr/bin/env node
// P0 (owner, real-money finding): accounting.journal_entry_postings, account "Bank Service
// Charges & Wire Fees" (role factor_wire_fee), USMCA -- 71 debit lines, $174,666.12, largest
// single line $6,644.50. A wire fee is $10.00. LIVE-CONFIRMED: 44 factoring advances
// (FAC-2026-00047 through FAC-2026-00090, a contiguous range) had their real advance/net-advance
// amount posted into the wire-fee leg instead of the tiny real wire fee -- e.g. FAC-2026-00059's
// own notes field (its FARO_FEES JSON, written at import) shows net_adv=6644.5, matching the
// wire-fee-account posting exactly; the header's own wire_fee_cents/advance_amount_cents were
// LATER zeroed (a partial repair pass, 2026-09-24) without ever correctly re-posting.
//
// ROOT CAUSE, verified not guessed: apps/backend/src/accounting/factoring-posting/poster.service.ts
// itself is correct and has NEVER regressed -- `const ach = Number(input.funding_figures?.ach_cents
// ?? 0)` (:926 and its InClientTx twin :1328) has been byte-identical across its entire git history
// (checked via `git log -p --follow`), and `ach` maps ONLY to the factor_wire_fee role account,
// never factor_fee_expense/cash_clearing. The defect is NOT a code mapping bug -- it is a bad VALUE
// passed into `funding_figures.ach_cents` (the real net-advance amount instead of the real ~$10 wire
// fee) by whatever one-time script posted this specific batch on 2026-09-24. That script was run via
// the standard withCurrentUser(OWNER_USER_ID, ...) pattern (audit.row_changes shows a real actor, not
// a raw/unattributed write) but was never committed to this repo -- searched exhaustively
// (ach_cents, "Net Adv", "feed-sep-faro-fas", "REPAIR-VOID-ZERO-ADV"; none found in git history).
//
// ALL 44 bad funding JEs are already reversed (reversed_by_je_id IS NOT NULL, confirmed live) --
// which is WHY this guard can be strict from day one with no baseline: it only checks LIVE
// (non-reversed, non-voided) funding JEs, and none of the 44 known-bad ones are live anymore. The
// deeper, separate problem -- that reversing without re-posting leaves these 44 real advances with
// NO live funding-event JE at all (confirmed via accounting.factoring_lifecycle_posting_keys: only
// one "funding" claim per advance, pointing at the reversed JE, no "funding#revN" successor) -- is
// named in the report, not fixed here. DO NOT REPOST -- report only, per the owner's own order.
import pg from "pg";

const LABEL = "verify-factoring-posting-legs-match-header";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// header_field -> [account role, whether the leg is a debit or credit]. invoice_total_cents (the
// liability credit) is included for completeness even though the order names only these four --
// finding a fifth broken leg costs nothing extra once the query is written.
const LEG_CHECKS = [
  { header_field: "advance_amount_cents", role: "cash_clearing", side: "debit" },
  { header_field: "reserve_amount_cents", role: "factor_reserve_held", side: "debit" },
  { header_field: "factor_fee_cents", role: "factor_fee_expense", side: "debit" },
  { header_field: "wire_fee_cents", role: "factor_wire_fee", side: "debit" },
  { header_field: "cash_rsv_cents", role: "factor_cash_reserve_held", side: "debit" },
];

function selftest() {
  const failures = [];
  if (LEG_CHECKS.length !== 5) failures.push("expected 5 leg checks (4 named by the order + cash_rsv bonus)");
  const fields = new Set(LEG_CHECKS.map((c) => c.header_field));
  for (const f of ["advance_amount_cents", "reserve_amount_cents", "factor_fee_cents", "wire_fee_cents"]) {
    if (!fields.has(f)) failures.push(`missing required header field check: ${f}`);
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 5 leg checks defined, all 4 owner-named fields present`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (live-data invariant by design).`);
    process.exit(0);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const roles = await client.query(
      `SELECT role, account_id::text FROM accounting.chart_of_accounts_roles
        WHERE operating_company_id = $1::uuid AND is_active = true
          AND role = ANY($2::text[])`,
      [USMCA, LEG_CHECKS.map((c) => c.role)]
    );
    const accountByRole = new Map(roles.rows.map((r) => [r.role, r.account_id]));

    const failures = [];
    for (const check of LEG_CHECKS) {
      const accountId = accountByRole.get(check.role);
      if (!accountId) {
        // Some roles (e.g. factor_cash_reserve_held) may legitimately be unbound if the company
        // never uses that leg — not a defect, just nothing to check.
        continue;
      }
      const res = await client.query(
        `
        SELECT fa.display_id, fa.${check.header_field}::bigint AS header_cents,
               COALESCE(leg.posted_cents, 0)::bigint AS posted_cents
          FROM accounting.factoring_advances fa
          JOIN accounting.factoring_lifecycle_posting_keys k
            ON k.operating_company_id = fa.operating_company_id
           AND k.factoring_advance_id = fa.id
           AND k.event_key ~ '^funding(#rev[0-9]+)?$'
          JOIN accounting.journal_entries je
            ON je.id = k.journal_entry_id AND je.reversed_by_je_id IS NULL AND je.voided_at IS NULL
          LEFT JOIN LATERAL (
            SELECT sum(jep.amount_cents) AS posted_cents
              FROM accounting.journal_entry_postings jep
             WHERE jep.journal_entry_uuid = je.id
               AND jep.account_id = $2::uuid
               AND jep.debit_or_credit = $3
          ) leg ON true
         WHERE fa.operating_company_id = $1::uuid
           AND fa.voided_at IS NULL
           AND COALESCE(fa.${check.header_field}, 0) IS DISTINCT FROM COALESCE(leg.posted_cents, 0)
        ORDER BY fa.display_id
        `,
        [USMCA, accountId, check.side]
      );
      for (const row of res.rows) {
        failures.push(
          `${row.display_id}: header.${check.header_field}=${row.header_cents ?? 0}c but live posted leg (role ${check.role})=${row.posted_cents}c`
        );
      }
    }

    await client.query("ROLLBACK");

    if (failures.length) {
      console.error(`${LABEL}: FAIL — ${failures.length} mismatch(es) between a header field and its live posted leg:`);
      for (const f of failures.slice(0, 30)) console.error(`  ✗ ${f}`);
      if (failures.length > 30) console.error(`  ...and ${failures.length - 30} more`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — every live factoring advance's posted legs match its own header fields.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
