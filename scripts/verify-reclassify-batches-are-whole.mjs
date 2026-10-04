#!/usr/bin/env node
// Reclassify Transactions guard (Lead 2026-10-01, QBO spec §24). Live invariants on prod:
//   1. every APPLIED batch line names a RECLASSIFICATION journal entry that is posted (or reversed by its undo JE when the batch is undone);
//   2. that JE carries, for the line, a reverse of the old (account,class,dr/cr) and a post on the new (account,class) of the same amount;
//   3. a rewritten expense line (document_updated = true, source expense) carries the target account;
//   4. an UNDONE batch has every reclass JE reversed (reversed_by_je_id set) and undo_journal_entry_id recorded.
// Static: the service never UPDATEs or DELETEs accounting.journal_entry_postings (WORM).
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
const LABEL = "verify-reclassify-batches-are-whole";
const SERVICE = path.join(process.cwd(), "apps/backend/src/accounting/reclassify/reclassify.service.ts");

function staticFailures(src) {
  const out = [];
  if (/UPDATE\s+accounting\.journal_entry_postings/i.test(src)) out.push("service UPDATEs journal_entry_postings (WORM: postings are never edited)");
  if (/DELETE\s+FROM\s+accounting\.journal_entry_postings/i.test(src)) out.push("service DELETEs journal_entry_postings");
  if (!src.includes('journal_entry_type_code: "RECLASSIFICATION"')) out.push("reclass JE is not typed RECLASSIFICATION");
  // ROUND 390.1 (CC-1, #25149): a reversal line is TERMINAL. A reclass JE's out-leg is itself a reversal of the original
  // line, so the canonical undo is restoreReversedJournalEntryInClientTx (the original comes back as a fresh line, the
  // in-leg is reversed; header-linked, idempotent). Reversing the reclass JE again (reverseJournalEntryNoFlip) would write
  // a reversal of a reversal — refused by the posting-line writer — so the old path is now itself a failure.
  if (!/\brestoreReversedJournalEntryInClientTx\s*\(/.test(src)) out.push("undo does not use the canonical restore of a reversing entry (restoreReversedJournalEntryInClientTx)");
  if (/\breverseJournalEntryNoFlip\s*\(/.test(src)) out.push("undo reverses the reclass JE again (reverseJournalEntryNoFlip) — a reversal of a reversal, refused since ROUND 390.1");
  if (!src.includes("SAVEPOINT reclass_doc")) out.push("per-document savepoint missing (one bad document must not roll back the batch)");
  return out;
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(SERVICE, "utf8");
  if (staticFailures(src).length) { console.error(`${LABEL}: selftest FAIL on the real source`, staticFailures(src)); process.exit(1); }
  const plant = src.replace('journal_entry_type_code: "RECLASSIFICATION"', 'journal_entry_type_code: "GENERAL"') + "\nUPDATE accounting.journal_entry_postings SET x = 1";
  if (staticFailures(plant).length < 2) { console.error(`${LABEL}: selftest FAIL — planted regressions escaped`); process.exit(1); }
  // ROUND 390.1 undo path, both directions: the old reverse-the-reclass-JE call fails, a missing restore fails.
  const oldUndo = src.replace(/\brestoreReversedJournalEntryInClientTx\s*\(/g, "reverseJournalEntryNoFlip(");
  if (staticFailures(oldUndo).length < 2) { console.error(`${LABEL}: selftest FAIL — the pre-390.1 undo (reverse a reversing JE) escaped`); process.exit(1); }
  console.log(`${LABEL}: selftest PASS (static, 2 planted regressions + the pre-390.1 undo caught)`);
  process.exit(0);
}

const sf = staticFailures(fs.readFileSync(SERVICE, "utf8"));
if (sf.length) { console.error(`${LABEL}: FAIL —\n  ${sf.join("\n  ")}`); process.exit(1); }

if (!process.env.DATABASE_URL) {
  console.log(`${LABEL}: SKIP — no DATABASE_URL (live-data invariant by design). static PASS.`);
  process.exit(0);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  // NEONDB-OWNER-OK: no SET ROLE; bypass_rls alone under the gate credential
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const exists = await client.query(`SELECT to_regclass('accounting.reclassify_batch_lines') IS NOT NULL AS ok`);
  if (!exists.rows[0]?.ok) { await client.query("ROLLBACK"); console.log(`${LABEL}: PASS — tables not migrated yet on this database (0 batches to check).`); process.exit(0); }
  const bad = await client.query(`
    WITH applied AS (
      SELECT l.*, b.status AS batch_status FROM accounting.reclassify_batch_lines l JOIN accounting.reclassify_batches b ON b.id = l.batch_id WHERE l.result = 'applied'
    )
    SELECT a.id::text AS line_id, a.batch_id::text,
      CASE
        WHEN je.id IS NULL THEN 'reclass JE missing'
        WHEN a.batch_status = 'applied' AND je.status <> 'posted' THEN 'reclass JE not posted while batch applied'
        WHEN a.batch_status = 'undone' AND (je.reversed_by_je_id IS NULL OR a.undo_journal_entry_id IS NULL) THEN 'batch undone but reclass JE not reversed / undo JE not recorded'
        WHEN NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = je.id AND p.account_id = a.from_account_id AND p.amount_cents = a.amount_cents
                           AND p.debit_or_credit = CASE a.debit_or_credit WHEN 'debit' THEN 'credit' ELSE 'debit' END AND coalesce(p.class_id::text,'') = coalesce(a.from_class_id::text,''))
          THEN 'reverse-of-old line missing on the reclass JE'
        WHEN NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = je.id AND p.account_id = a.to_account_id AND p.amount_cents = a.amount_cents
                           AND p.debit_or_credit = a.debit_or_credit AND coalesce(p.class_id::text,'') = coalesce(a.to_class_id::text,''))
          THEN 'post-on-new line missing on the reclass JE'
        WHEN a.batch_status = 'applied' AND a.document_updated AND a.source_transaction_type = 'expense' AND a.source_transaction_line_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM accounting.expense_lines el WHERE el.id::text = a.source_transaction_line_id AND el.expense_account_uuid = a.to_account_id)
          THEN 'expense line marked rewritten but does not carry the target account'
        ELSE NULL END AS problem
    FROM applied a
    LEFT JOIN accounting.journal_entries je ON je.id = a.reclass_journal_entry_id
  `);
  const problems = bad.rows.filter((r) => r.problem);
  const total = bad.rows.length;
  await client.query("ROLLBACK");
  if (problems.length) {
    console.error(`${LABEL}: LIVE FAIL — ${problems.length} of ${total} applied reclassify line(s) are not whole:`);
    for (const p of problems.slice(0, 20)) console.error(`  batch ${p.batch_id} line ${p.line_id}: ${p.problem}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${total} applied reclassify line(s), every one carried by a RECLASSIFICATION JE with its reverse/post pair; undone batches fully reversed.`);
} finally {
  client.release();
  await pool.end();
}
