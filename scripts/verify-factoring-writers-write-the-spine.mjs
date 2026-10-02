#!/usr/bin/env node
// ROUND 332.1 §4c (10-02-2026-ALL-CODERS-ROUND-332.1-THE-STANDARD-AND-THE-LINKAGE-LAW.md): "EVERY money writer writes its
// spine link in the SAME TRANSACTION as its journal entry. No follow-up pass." — for CC-2's factoring writers.
// Static: every apps/backend/src/factoring/*.service.ts that creates a journal entry (createJournalEntryOnClient /
// postFactoringAdvanceEventInClientTx) calls a spine writer at least as many times.
// Live (DATABASE_URL): every leg of a posted entry written by these engines — Faro reserve entries, interest runs, Due-to-Faro
// reclasses, short-pay write-downs, purchase funding — has a spine row to its document. Positive control: the spine table is
// readable. A live check that cannot run FAILS. --selftest plants a writer without its spine call.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-factoring-writers-write-the-spine";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = "apps/backend/src/factoring";
const WRITES = /\b(createJournalEntryOnClient|postFactoringAdvanceEventInClientTx)\(/g;
const SPINE = /\b(writeFactoringSpineLinks|writeDocumentSpineLinks|writeTransactionSourceLink)\(/g;

export function check(files) {
  const fails = [];
  for (const [f, src] of files) {
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/^import .*$/gm, "");
    const writes = (code.match(WRITES) ?? []).length;
    const spine = (code.match(SPINE) ?? []).length;
    if (writes > spine) fails.push(`${f}: ${writes} journal-entry write(s) but ${spine} spine write(s) — every entry links its document on the spine in the same transaction`);
  }
  return fails;
}

const read = () =>
  fs.readdirSync(path.join(ROOT, DIR)).filter((n) => n.endsWith(".service.ts")).map((n) => [`${DIR}/${n}`, fs.readFileSync(path.join(ROOT, DIR, n), "utf8")]);

if (process.argv.includes("--selftest")) {
  const g = read();
  if (check(g).length) { console.error(`${LABEL} --selftest FAIL: tree not clean: ${check(g).join("; ")}`); process.exit(1); }
  const planted = [["apps/backend/src/factoring/x.service.ts", "await createJournalEntryOnClient(client, {});\n"]];
  if (check([...g, ...planted]).length !== 1) { console.error(`${LABEL} --selftest FAIL: a writer without its spine call was not caught`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS 1/1`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = (await c.query(`
    WITH je AS (
      SELECT journal_entry_id AS id, 'faro_reserve_entry' AS t FROM accounting.faro_reserve_entries WHERE journal_entry_id IS NOT NULL AND entry_kind <> 'escrow_held'
      UNION SELECT short_pay_resolution_journal_entry_id, 'faro_reserve_entry' FROM accounting.faro_reserve_entries WHERE short_pay_resolution_journal_entry_id IS NOT NULL
      UNION SELECT journal_entry_id, 'invoice' FROM accounting.factoring_interest_accrual_runs WHERE journal_entry_id IS NOT NULL
      UNION SELECT journal_entry_id, 'faro_cash_reserve_reclass' FROM accounting.faro_cash_reserve_reclasses WHERE journal_entry_id IS NOT NULL
      UNION SELECT reversal_journal_entry_id, 'faro_cash_reserve_reclass' FROM accounting.faro_cash_reserve_reclasses WHERE reversal_journal_entry_id IS NOT NULL
      UNION SELECT journal_entry_id, 'factoring_purchase' FROM accounting.factoring_purchases WHERE status = 'posted' AND journal_entry_id IS NOT NULL
    )
    SELECT (SELECT count(*) FROM je)::int AS entries,
           (SELECT count(*) FROM je JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
             WHERE NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links t
                                WHERE t.journal_entry_posting_id = p.id AND t.linked_object_type = je.t))::int AS legs_without_spine,
           (SELECT count(*) FROM accounting.transaction_source_links)::int AS spine_rows`)).rows[0];
  await c.query("ROLLBACK");
  if (r.spine_rows === 0) { console.error(`${LABEL}: FAIL — positive control: the spine is empty or unreadable`); process.exit(1); }
  if (r.legs_without_spine > 0) { console.error(`${LABEL}: LIVE FAIL — ${r.legs_without_spine} leg(s) of CC-2 factoring entries have no spine row to their document`); process.exit(1); }
  console.log(`${LABEL}: PASS — static: every factoring writer writes the spine; live: ${r.entries} CC-2 factoring entr(ies), 0 legs without a spine row; positive control ${r.spine_rows} spine rows`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
