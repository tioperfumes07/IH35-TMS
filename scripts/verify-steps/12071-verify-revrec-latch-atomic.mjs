#!/usr/bin/env node
// REVREC-ATOMIC-IDEMPOTENCY (CC-2, 2026-10-01). The load revenue latch (revrec-delivery-posting/poster.service.ts) used
// to commit the revenue JE in one transaction and its load_revenue_recognition_postings row in a SECOND one. When the
// second failed, the JE survived with no latch row and the next fire posted the same event again: prod 2026-10-01 had
// two posted, unreversed Event 1 JEs for load 13626 ($3,400) and for load 13571 ($4,900, since 2026-09-24).
//
// static: the latch-row INSERT lives inside createJournalEntry's afterInsertBeforeCommit, uses RETURNING, and a lost
//         race throws RevrecLatchAlreadyPostedError (rolling the duplicate JE back); no second-transaction insert.
// live (read-only): 0 posted, unreversed "Revrec Event" JEs without a latch row.
import pg from "pg";
import { readFileSync } from "node:fs";

const LABEL = "verify-revrec-latch-atomic";
const ROOT = new URL("../../", import.meta.url);
const src = readFileSync(new URL("apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts", ROOT), "utf8");

function selftest() {
  const problems = [];
  const hookAt = src.indexOf("afterInsertBeforeCommit: async (client, header) =>");
  const insertAt = src.indexOf("INSERT INTO accounting.load_revenue_recognition_postings");
  const hookEnd = src.indexOf("} catch (err) {", hookAt);
  if (hookAt < 0 || insertAt < 0) problems.push("latch insert or JE hook not found");
  else if (!(insertAt > hookAt && insertAt < hookEnd)) problems.push("latch-row INSERT must run inside afterInsertBeforeCommit (same transaction as the JE)");
  if ((src.match(/INSERT INTO accounting\.load_revenue_recognition_postings/g) ?? []).length !== 1) problems.push("exactly one latch-row INSERT");
  if (!/WHERE is_active DO NOTHING\s*\n\s*RETURNING id/.test(src)) problems.push("latch-row INSERT must RETURNING id to detect a lost race");
  if (!/if \(!latch\.rows\[0\]\) throw new RevrecLatchAlreadyPostedError\(\);/.test(src)) problems.push("a lost race must throw inside the JE transaction");
  if (!/if \(err instanceof RevrecLatchAlreadyPostedError\) return \{ posted: false, reason: "already_posted" \};/.test(src)) problems.push("the poster must answer already_posted after the rollback");
  // The latch-owned A/R is the invoice's posting: the send gate exempts exactly that code and nothing else.
  const send = readFileSync(new URL("apps/backend/src/accounting/invoice-send.service.ts", ROOT), "utf8");
  if (!/invoiceGl\.code === "INVOICE_REVREC_LATCH_OWNS_LOAD"/.test(send) || !/post_failed" && !latchOwnsAr\) \{\n    throw new Error\(`invoice_send_refused_gl_post_failed:/.test(send)) {
    problems.push("invoice send must exempt only INVOICE_REVREC_LATCH_OWNS_LOAD (Event 2 posts that A/R) from the post_failed refusal");
  }
  if (!/await fireRevrecLatchOnInvoiceIssued\(/.test(send)) problems.push("invoice send must fire the revrec latch (Event 2 = the A/R)");
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (7/7)`);
}

selftest();
if (process.argv.includes("--selftest")) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`${LABEL}: SKIP live — no DATABASE_URL (static PASS above)`);
  process.exit(0);
}
const client = new pg.Client({ connectionString: url, statement_timeout: 30000 });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = await client.query(
    `SELECT je.id::text, left(je.memo, 70) AS memo, je.created_at
       FROM accounting.journal_entries je
      WHERE je.memo LIKE 'Revrec Event %' AND je.status = 'posted' AND je.reverses_je_id IS NULL AND je.reversed_by_je_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM accounting.load_revenue_recognition_postings r WHERE r.journal_entry_id = je.id)
      ORDER BY je.created_at`
  );
  const total = (await client.query(`SELECT count(*)::int n FROM accounting.journal_entries WHERE memo LIKE 'Revrec Event %'`)).rows[0].n;
  await client.query("ROLLBACK");
  if (r.rows.length) {
    console.error(`${LABEL}: LIVE FAIL — ${r.rows.length} posted revenue JE(s) with no latch row (double recognition): ${r.rows.map((x) => `${x.id} ${x.memo}`).join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — 0 orphan revenue JEs among ${total} Revrec JEs`);
} finally {
  await client.end();
}
