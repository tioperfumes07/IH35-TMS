// ARCHIVED 2026-10-01 (CC-2): EXECUTED under AUTH-193 at 2026-10-01T16:09:51Z (audit b7b25e3d, CONSUMED). Moved out of
// scripts/ops/ unchanged (precedent #23409): its purge DELETEs, scoped by explicit row lists, trip the static
// unscoped-delete guard by design. Never re-run; kept as the evidence of what ran.
/**
 * AUTH-193 — ROUND 315 item 1, OWNER DECISION (testing phase): factoring clean slate for USMCA.
 * Owner, verbatim via the Lead: "Undo each purchase, void and permanently delete, have Faro clean again — zero
 * purchases — all invoices still listed." Posted journal entries of those purchases are deleted too ("why would I want
 * seeded data in the journal entries, ledgers"). Measured live 2026-10-01: 95 advances, $325,162.98, 08-10..09-25.
 *
 * Uses the sanctioned WORM purge bypass (app.purge_auth_id, migrations 202614450000..202614490000): detail rows are
 * deletable under an AUTH; documents (factoring_advances, journal_entries) only once VOIDED — so each is void-stamped
 * first, in the same transaction. Order (every FK read live, RESTRICT/NO ACTION respected):
 *   1. invoices: factoring_advance_id -> NULL, factoring_status -> 'not_factored' (invoices STAY listed; never deleted)
 *   2. bank lines: matched_factoring_advance_id -> NULL (bank lines are KEPT — banking is never purged)
 *   3. transaction_source_links of the postings -> postings -> reserve movements / interest accruals / posting keys
 *   4. journal entries (both halves of every reversal pair in one statement): void-stamp, delete
 *   5. advances: void-stamp, delete
 * JE set = every JE tied to a live advance + every USMCA JE with a factoring-sourced posting (132 orphans from earlier
 * incarnations of the same purchases) + the transitive reversal closure = 625 JEs / 2,009 postings. The 182 beyond the
 * first 443 net to zero on every account. The row list is committed at
 * docs/audit/2026-10-01-auth193-factoring-clean-slate-rows.json; --apply refuses unless the live list hashes to it.
 * GL effect (rehearsed): 2150/1230/6400/6300/6830 -> 0; 1100 unchanged; 1090 161,622.34 -> -151,736.34 and 1000 -21,611.00,
 * because the real Faro cash in the bank (bank lines kept) loses its factoring source until the app regenerates it.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cc2-auth193-factoring-clean-slate.ts [--rehearse | --apply]
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const REHEARSE = !APPLY && process.argv.includes("--rehearse");
const AUTH_ID = "AUTH-193";
const ACTOR = "00000000-0000-4000-8000-000000000001";
const EXPECTED = { advances: 95, advanceCents: 32516298, jes: 625, postings: 2009 };
const ROW_LIST_SHA256 = "5754cb5d38ee21d7fc6dc69ec73ea70912aa1eacc1c132248fb0b6d213698f3e";
const ACCOUNTS = ["1000", "6830", "1100", "1210", "1220", "1230", "1235", "2150", "6400", "6300", "1090"];
const REASON = "ROUND 315 owner decision (testing phase): factoring clean slate — seeded purchases removed; AUTH-193";

const A = `SELECT id FROM accounting.factoring_advances WHERE operating_company_id = '${USMCA}'`;
const J0 = `SELECT journal_entry_id je FROM accounting.factoring_lifecycle_posting_keys WHERE factoring_advance_id IN (${A})
  UNION SELECT journal_entry_id FROM accounting.factoring_reserve_movements WHERE factoring_advance_id IN (${A})
  UNION SELECT journal_entry_id FROM accounting.factoring_default_interest_accruals WHERE factoring_advance_id IN (${A})
  UNION SELECT p.journal_entry_uuid FROM accounting.journal_entry_postings p WHERE p.source_transaction_id::text IN (SELECT id::text FROM (${A}) x)
  UNION SELECT p.journal_entry_uuid FROM accounting.transaction_source_links t JOIN accounting.journal_entry_postings p ON p.id::text = t.journal_entry_posting_id::text
         WHERE t.linked_object_id::text IN (SELECT id::text FROM (${A}) x)
  UNION SELECT p.journal_entry_uuid FROM accounting.journal_entry_postings p JOIN accounting.journal_entries e ON e.id = p.journal_entry_uuid
         WHERE e.operating_company_id = '${USMCA}'
           AND p.source_transaction_type IN ('factoring_advance', 'factoring_advance_deposit', 'factoring_default_interest')`;
// ^ The last arm: 132 "Factoring funding FAC-2026-000NN" JEs (532 postings, measured 2026-10-01) whose advance row was
//   deleted by an earlier re-incarnation of the same purchase (pre-ROUND-175 ids) — orphan factoring GL, same purchases.
const J = `SELECT je FROM (${J0}) j0 WHERE je IS NOT NULL
  UNION SELECT r.id FROM accounting.journal_entries r WHERE r.reverses_je_id IN (SELECT je FROM (${J0}) a)
     OR r.id IN (SELECT reversed_by_je_id FROM accounting.journal_entries WHERE id IN (SELECT je FROM (${J0}) b))`;

type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

async function balances(c: Q) {
  const r = await c.query<{ account_number: string; account_name: string; net_cents: string }>(
    `SELECT a.account_number, a.account_name,
            COALESCE(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint::text AS net_cents
       FROM catalogs.accounts a
       LEFT JOIN accounting.journal_entry_postings p ON p.account_id = a.id
       LEFT JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = $1::uuid AND je.status = 'posted'
      WHERE a.operating_company_id = $1::uuid AND a.account_number = ANY($2::text[]) AND (p.id IS NULL OR je.id IS NOT NULL)
      GROUP BY 1, 2 ORDER BY 1`,
    [USMCA, ACCOUNTS]
  );
  return r.rows.map((x) => `${x.account_number} ${x.account_name}: ${(Number(x.net_cents) / 100).toFixed(2)} (debit +)`);
}

async function census(c: Q) {
  const adv = (await c.query<{ id: string; display_id: string; advance_amount_cents: string; faro_invoice_number: string | null; faro_purchase_date: string | null }>(
    `SELECT id::text, display_id, advance_amount_cents::text, faro_invoice_number, faro_purchase_date::text FROM accounting.factoring_advances WHERE operating_company_id = $1::uuid ORDER BY display_id`, [USMCA]
  )).rows;
  // Transitive reversal closure: a reversal of a factoring JE (header reverses_je_id / reversed_by_je_id, line
  // reversal_of_line_id / reversed_by_line_id, or a posting sourced journal_entry:<id>) is part of the same chain.
  // Measured 2026-10-01: 3 such entries (2 ROUND-175 reinstate reversals + the AUTH-169 reversal of FAC-2026-00140's JE).
  let jes = (await c.query<{ je: string }>(`SELECT je::text FROM (${J}) z`)).rows.map((r) => r.je);
  for (;;) {
    const more = (await c.query<{ je: string }>(
      `WITH s AS (SELECT unnest($1::uuid[]) id),
            sp AS (SELECT p.id FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid IN (SELECT id FROM s))
       SELECT DISTINCT x::text je FROM (
         SELECT id x FROM accounting.journal_entries WHERE reverses_je_id IN (SELECT id FROM s)
         UNION SELECT reversed_by_je_id FROM accounting.journal_entries WHERE id IN (SELECT id FROM s)
         UNION SELECT journal_entry_uuid FROM accounting.journal_entry_postings
                WHERE reversal_of_line_id IN (SELECT id FROM sp) OR reversed_by_line_id IN (SELECT id FROM sp)
         UNION SELECT journal_entry_uuid FROM accounting.journal_entry_postings
                WHERE source_transaction_type = 'journal_entry' AND source_transaction_id::text IN (SELECT id::text FROM s)
       ) z WHERE x IS NOT NULL AND x NOT IN (SELECT id FROM s)`,
      [jes]
    )).rows.map((r) => r.je);
    if (!more.length) break;
    jes = jes.concat(more);
  }
  jes.sort();
  const postings = Number((await c.query<{ n: number }>(`SELECT count(*)::int n FROM accounting.journal_entry_postings WHERE journal_entry_uuid = ANY($1::uuid[])`, [jes])).rows[0]!.n);
  const perAdvanceJes = (await c.query<{ advance_id: string; jes: string[] }>(
    `SELECT a.id::text AS advance_id, array_agg(DISTINCT x.je::text) AS jes FROM (${A}) a
       JOIN LATERAL (
         SELECT journal_entry_id je FROM accounting.factoring_lifecycle_posting_keys WHERE factoring_advance_id = a.id
         UNION SELECT journal_entry_id FROM accounting.factoring_reserve_movements WHERE factoring_advance_id = a.id
         UNION SELECT journal_entry_id FROM accounting.factoring_default_interest_accruals WHERE factoring_advance_id = a.id
         UNION SELECT p.journal_entry_uuid FROM accounting.journal_entry_postings p WHERE p.source_transaction_id::text = a.id::text
       ) x ON x.je IS NOT NULL GROUP BY a.id`
  )).rows;
  return { adv, jes, postings, perAdvanceJes };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }
  const client = new pg.Client({ connectionString: url, statement_timeout: 120000 });
  await client.connect();
  const pid = (await client.query<{ p: number }>("SELECT pg_backend_pid() p")).rows[0]!.p;
  // Watchdog: never leave a session holding locks on production (lesson 2026-10-01).
  const watchdog = setTimeout(async () => {
    const k = new pg.Client({ connectionString: url });
    await k.connect();
    await k.query("SELECT pg_terminate_backend($1)", [pid]);
    await k.end();
    console.error(`WATCHDOG: terminated own session ${pid}`);
    process.exit(2);
  }, 600000);
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    if (APPLY) await assertIsIntendedProduction(client);
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const before = await census(client);
    const advCents = before.adv.reduce((a, r) => a + Number(r.advance_amount_cents), 0);
    const listing = before.adv.map((r) => ({ ...r, journal_entry_ids: before.perAdvanceJes.find((p) => p.advance_id === r.id)?.jes ?? [] }));
    const listingText = JSON.stringify({ advances: listing, all_journal_entry_ids: before.jes }, null, 1);
    const digest = crypto.createHash("sha256").update(listingText).digest("hex");
    const out = path.join(os.tmpdir(), `auth193-factoring-clean-slate-rows-${digest.slice(0, 12)}.json`);
    fs.writeFileSync(out, listingText);
    console.log(`census: ${before.adv.length} advances, $${(advCents / 100).toFixed(2)}, ${before.jes.length} journal entries, ${before.postings} postings`);
    console.log(`row list: ${out}  sha256=${digest}`);
    console.log("GL before:\n  " + (await balances(client)).join("\n  "));
    const probs: string[] = [];
    if (before.adv.length !== EXPECTED.advances) probs.push(`advances ${before.adv.length} != ${EXPECTED.advances}`);
    if (advCents !== EXPECTED.advanceCents) probs.push(`advance cents ${advCents} != ${EXPECTED.advanceCents}`);
    if (before.jes.length !== EXPECTED.jes) probs.push(`journal entries ${before.jes.length} != ${EXPECTED.jes}`);
    if (before.postings !== EXPECTED.postings) probs.push(`postings ${before.postings} != ${EXPECTED.postings}`);
    // The AUTH names this exact row list (docs/audit/2026-10-01-auth193-factoring-clean-slate-rows.json).
    if (APPLY && digest !== ROW_LIST_SHA256) probs.push(`row list sha256 ${digest} != authorized ${ROW_LIST_SHA256}`);
    const foreign = Number((await client.query<{ n: number }>(`SELECT count(*)::int n FROM accounting.journal_entries WHERE id = ANY($2::uuid[]) AND operating_company_id <> $1::uuid`, [USMCA, before.jes])).rows[0]!.n);
    if (foreign) probs.push(`${foreign} journal entries belong to another company`);
    if (probs.length) {
      await client.query("ROLLBACK");
      console.error(`REFUSED: ${probs.join("; ")} — the population moved; re-measure before writing`);
      process.exit(1);
    }
    if (!APPLY && !REHEARSE) {
      await client.query("ROLLBACK");
      console.log("DRY RUN: nothing written. --rehearse runs it and rolls back; --apply under AUTH-193.");
      return;
    }

    await client.query(`SELECT set_config('app.purge_auth_id', $1, true)`, [AUTH_ID]);
    const jeIds = before.jes;
    const step = async (label: string, sql: string, params: unknown[] = []) => {
      const r = await client.query(sql, params);
      console.log(`  ${label}: ${r.rowCount ?? 0}`);
      return r.rowCount ?? 0;
    };
    await step("invoices unlinked (stay listed)", `UPDATE accounting.invoices SET factoring_advance_id = NULL, factoring_status = 'not_factored', updated_at = now()
      WHERE factoring_advance_id IN (${A})`);
    await step("bank lines unmatched (kept)", `UPDATE banking.bank_transactions SET matched_factoring_advance_id = NULL WHERE matched_factoring_advance_id IN (${A})`);
    await step("transaction_source_links deleted", `DELETE FROM accounting.transaction_source_links
      WHERE journal_entry_posting_id::text IN (SELECT id::text FROM accounting.journal_entry_postings WHERE journal_entry_uuid = ANY($1::uuid[]))
         OR linked_object_id::text IN (SELECT id::text FROM (${A}) x)`, [jeIds]);
    await step("postings deleted", `DELETE FROM accounting.journal_entry_postings WHERE journal_entry_uuid = ANY($1::uuid[])`, [jeIds]);
    await step("reserve movements deleted", `DELETE FROM accounting.factoring_reserve_movements WHERE factoring_advance_id IN (${A})`);
    await step("interest accruals deleted", `DELETE FROM accounting.factoring_default_interest_accruals WHERE factoring_advance_id IN (${A})`);
    await step("posting keys deleted", `DELETE FROM accounting.factoring_lifecycle_posting_keys WHERE factoring_advance_id IN (${A})`);
    await step("journal entries void-stamped", `UPDATE accounting.journal_entries SET voided_at = COALESCE(voided_at, now()), voided_by_user_id = COALESCE(voided_by_user_id, $2::uuid), void_reason = COALESCE(void_reason, $3) WHERE id = ANY($1::uuid[])`, [jeIds, ACTOR, REASON]);
    await step("journal entries deleted", `DELETE FROM accounting.journal_entries WHERE id = ANY($1::uuid[])`, [jeIds]);
    await step("advances void-stamped", `UPDATE accounting.factoring_advances SET status = 'voided', voided_at = now(), voided_by_user_id = $2::uuid, void_reason = $3
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL`, [USMCA, ACTOR, REASON]);
    await step("advances deleted", `DELETE FROM accounting.factoring_advances WHERE operating_company_id = $1::uuid`, [USMCA]);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    const left = (await client.query<{ adv: number; jes: number; inv_linked: number }>(
      `SELECT (SELECT count(*)::int FROM accounting.factoring_advances WHERE operating_company_id = $1::uuid) adv,
              (SELECT count(*)::int FROM accounting.journal_entries WHERE id = ANY($2::uuid[])) jes,
              (SELECT count(*)::int FROM accounting.invoices WHERE operating_company_id = $1::uuid AND factoring_advance_id IS NOT NULL) inv_linked`,
      [USMCA, jeIds]
    )).rows[0]!;
    console.log(`after: advances ${left.adv}, journal entries left ${left.jes}, invoices still linked ${left.inv_linked}`);
    console.log("GL after:\n  " + (await balances(client)).join("\n  "));
    if (REHEARSE) {
      await client.query("ROLLBACK");
      console.log("REHEARSAL complete, rolled back — nothing written.");
      return;
    }
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "accounting.factoring_clean_slate", "warning",
      JSON.stringify({ auth: AUTH_ID, operating_company_id: USMCA, advances: before.adv.length, advance_cents: advCents, journal_entries: jeIds.length, postings: before.postings, row_list_sha256: digest }),
      `CC-2-${AUTH_ID}`,
    ]);
    await client.query("COMMIT");
    console.log(`APPLIED under ${AUTH_ID}: ${before.adv.length} advances and ${jeIds.length} journal entries removed; 1 audit row.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    clearTimeout(watchdog);
    await client.end();
  }
}

await main();
