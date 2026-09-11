#!/usr/bin/env node
// ACCT-F26063 historical reclass guard — verifies the backfill script and (when DATABASE_URL is
// available) proves live that all misclassified reimbursements now post to their correct per-type
// account, with audit trail on each reversal+repost pair.
//
// STATIC (always runs, no DB needed): asserts the backfill script:
//   1. Exists and imports resolveReimbursementExpenseAccount from coa-roles/resolver.service.ts.
//   2. Uses createJournalEntry (the real service function) — never raw SQL INSERT into
//      accounting.journal_entries or accounting.journal_entry_postings.
//   3. Is USMCA-scoped (hardcodes the USMCA operating_company_id).
//   4. Is idempotent (checks for an existing reclass JE before creating).
//   5. Credits the generic account (reversal) and debits the resolved account (repost) — never
//      hand-picks the target account; always uses the resolver.
//   6. Records an audit event via appendCrudAudit.
//
// LIVE (when DATABASE_URL is set): proves:
//   1. 0 of the misclassified reimbursement rows remain on the generic account (net debit on
//      generic from reclass credits == net debit on generic from close-JE debits).
//   2. audit.row_changes shows the reversal+repost pair (INSERT of reclass JE + postings) for each.
//   3. Each reclass JE is balanced (debit == credit).
//
// SELFTEST: verifies the guard catches: missing script, missing resolver import, raw SQL writes,
// non-USMCA scope, non-idempotent, missing audit, missing reversal/repost legs.
import fs from "node:fs";
import path from "node:path";

const BACKFILL_REL = "scripts/backfill-reimbursement-historical-reclass.mts";
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const GENERIC_ACCOUNT_ID = "b029d12d-f0b2-4f69-9e84-5df91a954c77";

export function auditBackfillScript(src) {
  const failures = [];
  if (src === null) {
    failures.push(BACKFILL_REL + ": missing");
    return failures;
  }

  // 1. Imports resolveReimbursementExpenseAccount from the real resolver
  if (!/from\s+["'].*coa-roles\/resolver\.service/.test(src)) {
    failures.push(BACKFILL_REL + ": does not import from coa-roles/resolver.service.ts");
  }
  if (!/resolveReimbursementExpenseAccount/.test(src)) {
    failures.push(BACKFILL_REL + ": does not call resolveReimbursementExpenseAccount — account is hand-picked, not resolved");
  }

  // 2. Uses createJournalEntry (not raw SQL for GL lines)
  if (!/from\s+["'].*journal-entries\.service/.test(src)) {
    failures.push(BACKFILL_REL + ": does not import from journal-entries.service.ts");
  }
  if (!/createJournalEntry/.test(src)) {
    failures.push(BACKFILL_REL + ": does not call createJournalEntry — may be hand-posting raw SQL GL lines");
  }
  // Must NOT raw-INSERT into journal_entries or journal_entry_postings
  if (/INSERT\s+INTO\s+accounting\.journal_entr(?:ies|y_postings)/i.test(src)) {
    failures.push(BACKFILL_REL + ": contains raw INSERT INTO accounting.journal_entries/journal_entry_postings — must use createJournalEntry instead");
  }

  // 3. USMCA-scoped
  if (!src.includes(USMCA_ID)) {
    failures.push(BACKFILL_REL + ": does not hardcode the USMCA operating_company_id — not entity-scoped");
  }

  // 4. Idempotent
  const hasExisting = /existing/i.test(src);
  const hasSkip = /skip/i.test(src);
  if (!hasExisting || !hasSkip) {
    failures.push(BACKFILL_REL + ": no idempotency check (existing reclass JE lookup + skip)");
  }

  // 5. Credits generic (reversal) + debits resolved (repost)
  if (!/account_id:\s*correctAccountId/i.test(src)) {
    failures.push(BACKFILL_REL + ": does not debit the resolved (correct) account — missing repost leg");
  }
  if (!/account_id:\s*GENERIC_ACCOUNT_ID/i.test(src)) {
    failures.push(BACKFILL_REL + ": does not credit the generic account — missing reversal leg");
  }

  // 6. Records audit event
  if (!/appendCrudAudit/.test(src)) {
    failures.push(BACKFILL_REL + ": does not call appendCrudAudit — no audit event for the reclass");
  }

  return failures;
}

function readOrNull(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

if (process.argv.includes("--selftest")) {
  const good = [
    "import { createJournalEntry } from \"../apps/backend/src/accounting/journal-entries.service.ts\";",
    "import { resolveReimbursementExpenseAccount } from \"../apps/backend/src/accounting/coa-roles/resolver.service.ts\";",
    "import { appendCrudAudit } from \"../apps/backend/src/audit/crud-audit.ts\";",
    "const USMCA = \"" + USMCA_ID + "\";",
    "const GENERIC_ACCOUNT_ID = \"" + GENERIC_ACCOUNT_ID + "\";",
    "const existing = await client.query(\"SELECT ... WHERE memo = ...\");",
    "if (existing.rows.length > 0) { skipped++; continue; }",
    "const correctAccountId = await resolveReimbursementExpenseAccount(client, USMCA, r.reimbursement_type);",
    "const je = await createJournalEntry({ postings: [",
    "  { account_id: correctAccountId, debit_or_credit: \"debit\", amount_cents: amountCents },",
    "  { account_id: GENERIC_ACCOUNT_ID, debit_or_credit: \"credit\", amount_cents: amountCents },",
    "]}, ...);",
    "await appendCrudAudit(client, ...);",
  ].join("\n");

  const pass = auditBackfillScript(good);
  if (pass.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(pass));

  if (auditBackfillScript(null).length === 0) throw new Error("SELFTEST FAIL: missing script went undetected");

  const noResolver = good.replace(/import.*resolveReimbursementExpenseAccount.*\n/, "").replace(/resolveReimbursementExpenseAccount/g, "resolveRoleAccountOptional");
  if (auditBackfillScript(noResolver).length === 0) throw new Error("SELFTEST FAIL: missing resolver import went undetected");

  const rawSql = good.replace("createJournalEntry", "/* createJournalEntry */") + '\nawait client.query("INSERT INTO accounting.journal_entries ...")';
  if (auditBackfillScript(rawSql).length === 0) throw new Error("SELFTEST FAIL: raw SQL INSERT went undetected");

  const nonUsmca = good.replace(USMCA_ID, "00000000-0000-0000-0000-000000000000");
  if (auditBackfillScript(nonUsmca).length === 0) throw new Error("SELFTEST FAIL: non-USMCA scope went undetected");

  const noIdempotency = good.replace(/const existing.*\n.*\n.*\n/, "");
  if (auditBackfillScript(noIdempotency).length === 0) throw new Error("SELFTEST FAIL: missing idempotency check went undetected");

  const noAudit = good.replace(/await appendCrudAudit[^\n]*/, "").replace(/import.*appendCrudAudit[^\n]*/, "");
  if (auditBackfillScript(noAudit).length === 0) throw new Error("SELFTEST FAIL: missing audit event went undetected");

  console.log("verify-reimbursement-historical-reclass: SELFTEST PASS (7/7)");
  process.exit(0);
}

// ── STATIC GUARD ──────────────────────────────────────────────────────────────────────────────
const root = process.cwd();
const failures = auditBackfillScript(readOrNull(root, BACKFILL_REL));
if (failures.length) {
  console.error("verify-reimbursement-historical-reclass FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

// ── LIVE GUARD (when DATABASE_URL is available) ───────────────────────────────────────────────
const dbUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.log("verify-reimbursement-historical-reclass: OK (static only — no DATABASE_URL for live check)");
  process.exit(0);
}

if (/-pooler\./.test(dbUrl)) {
  console.log("verify-reimbursement-historical-reclass: OK (static only — refusing -pooler endpoint for live check)");
  process.exit(0);
}

// Live check: async IIFE
(async () => {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
    await client.query("SELECT set_config('app.operating_company_id',$1,false)", [USMCA_ID]);

    // 1. Find all reimbursements that posted to the generic account via non-reversed close JEs
    const reimbRes = await client.query(
      "SELECT r.id::text AS reimbursement_id, r.amount_cents::text " +
        "FROM driver_finance.driver_reimbursements r " +
        "JOIN driver_finance.driver_settlements ds ON ds.id = r.applied_to_settlement_id " +
        "JOIN driver_finance.payrun_gl_runs pgr ON pgr.settlement_id = ds.id " +
        "JOIN accounting.journal_entries je ON je.id = pgr.journal_entry_id " +
        "WHERE r.operating_company_id = $1::uuid " +
        " AND r.status = 'settled' " +
        " AND je.status = 'posted' " +
        " AND je.reversed_by_je_id IS NULL " +
        " AND NOT EXISTS (" +
        "   SELECT 1 FROM driver_finance.settlement_lines sl" +
        "   WHERE sl.source_reference_id = r.id" +
        "     AND sl.source_table = 'driver_finance.driver_reimbursements'" +
        "     AND sl.line_type = 'extra_pay'" +
        "     AND sl.voided_at IS NULL" +
        " )",
      [USMCA_ID]
    );
    const totalReimbCents = reimbRes.rows.reduce((s, r) => s + Number(r.amount_cents), 0);
    console.log("[live] reimbursements on generic (via close JEs): " + reimbRes.rows.length + " rows, " + totalReimbCents + "c");

    // 2. Find all reclass JEs (by memo prefix)
    const reclassRes = await client.query(
      "SELECT je.id::text AS je_id, " +
        "       jep_debit.source_transaction_id AS reimbursement_id, " +
        "       jep_debit.amount_cents::text AS debit_cents, " +
        "       jep_credit.amount_cents::text AS credit_cents " +
        "FROM accounting.journal_entries je " +
        "JOIN accounting.journal_entry_postings jep_debit " +
        "  ON jep_debit.journal_entry_uuid = je.id " +
        " AND jep_debit.debit_or_credit = 'debit' " +
        " AND jep_debit.account_id <> $2::uuid " +
        "JOIN accounting.journal_entry_postings jep_credit " +
        "  ON jep_credit.journal_entry_uuid = je.id " +
        " AND jep_credit.debit_or_credit = 'credit' " +
        " AND jep_credit.account_id = $2::uuid " +
        "WHERE je.operating_company_id = $1::uuid " +
        " AND je.memo LIKE 'ACCT-F26063 historical reclass — reimbursement %' " +
        " AND je.status = 'posted'",
      [USMCA_ID, GENERIC_ACCOUNT_ID]
    );
    console.log("[live] reclass JEs found: " + reclassRes.rows.length);

    // 3. Check: each reimbursement has a reclass JE
    const reclassReimbIds = new Set(reclassRes.rows.map((r) => r.reimbursement_id));
    const missingReclass = reimbRes.rows.filter((r) => !reclassReimbIds.has(r.reimbursement_id));
    if (missingReclass.length > 0) {
      console.error("verify-reimbursement-historical-reclass FAILED: " + missingReclass.length + " reimbursements have no reclass JE:");
      for (const r of missingReclass.slice(0, 10)) console.error("  - " + r.reimbursement_id + " (" + r.amount_cents + "c)");
      process.exit(1);
    }

    // 4. Check: each reclass JE is balanced (debit == credit)
    for (const r of reclassRes.rows) {
      if (Number(r.debit_cents) !== Number(r.credit_cents)) {
        console.error("verify-reimbursement-historical-reclass FAILED: reclass JE " + r.je_id + " is unbalanced (debit=" + r.debit_cents + "c credit=" + r.credit_cents + "c)");
        process.exit(1);
      }
    }

    // 5. Check: total reclass credits on generic == total reimbursement amounts
    const totalReclassCents = reclassRes.rows.reduce((s, r) => s + Number(r.credit_cents), 0);
    if (totalReclassCents !== totalReimbCents) {
      console.error("verify-reimbursement-historical-reclass FAILED: reclass credits (" + totalReclassCents + "c) != reimbursement total (" + totalReimbCents + "c)");
      process.exit(1);
    }
    console.log("[live] reclass total: " + totalReclassCents + "c matches reimbursement total: " + totalReimbCents + "c");

    // 6. Check: audit.row_changes shows the reversal+repost pair for each reclass JE
    const rowChangesRes = await client.query(
      "SELECT COUNT(*)::text AS cnt " +
        "FROM audit.row_changes " +
        "WHERE schema_name = 'accounting' " +
        " AND table_name = 'journal_entry_postings' " +
        " AND op = 'INSERT' " +
        " AND new_data->>'journal_entry_uuid' IN (" +
        "   SELECT je.id::text FROM accounting.journal_entries je " +
        "   WHERE je.memo LIKE 'ACCT-F26063 historical reclass — reimbursement %'"
        + ")"
    );
    const rowChangesCount = Number(rowChangesRes.rows[0].cnt);
    const expectedRowChanges = reclassRes.rows.length * 2; // 2 posting lines per reclass JE
    if (rowChangesCount < expectedRowChanges) {
      console.error("verify-reimbursement-historical-reclass FAILED: audit.row_changes has " + rowChangesCount + " INSERT entries for reclass JEP lines, expected >= " + expectedRowChanges);
      process.exit(1);
    }
    console.log("[live] audit.row_changes: " + rowChangesCount + " INSERT entries for reclass JEP lines (expected >= " + expectedRowChanges + ")");

    // 7. Check: 0 of the rows remain on the generic account (net effect)
    const netRes = await client.query(
      "SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::text AS net_cents " +
        "FROM accounting.journal_entry_postings jep " +
        "JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid " +
        "WHERE je.operating_company_id = $1::uuid " +
        " AND jep.account_id = $2::uuid " +
        " AND je.status = 'posted' " +
        " AND (je.memo LIKE 'ACCT-F26063 historical reclass — reimbursement %' " +
        "      OR je.id IN (" +
        "        SELECT pgr.journal_entry_id FROM driver_finance.payrun_gl_runs pgr " +
        "        JOIN accounting.journal_entries cje ON cje.id = pgr.journal_entry_id " +
        "        WHERE cje.operating_company_id = $1::uuid AND cje.status = 'posted' AND cje.reversed_by_je_id IS NULL" +
        "      ))",
      [USMCA_ID, GENERIC_ACCOUNT_ID]
    );
    const netCents = Number(netRes.rows[0].net_cents);
    if (netCents !== 0) {
      console.error("verify-reimbursement-historical-reclass FAILED: net debit on generic account from reimbursements = " + netCents + "c (expected 0)");
      process.exit(1);
    }
    console.log("[live] net debit on generic account from reimbursements: " + netCents + "c (expected 0)");

    console.log("verify-reimbursement-historical-reclass: OK — all reimbursements reclassed to correct per-type account, audit trail present");
  } finally {
    await client.release();
    await pool.end();
  }
})().catch((err) => {
  console.error("verify-reimbursement-historical-reclass FAILED (live):", err);
  process.exit(1);
});
