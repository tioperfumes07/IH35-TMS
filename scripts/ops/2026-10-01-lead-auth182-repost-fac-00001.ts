#!/usr/bin/env -S npx tsx
/**
 * AUTH-182 (Lead, 2026-10-01) -- restore FAC-2026-00001's ledger after a coder's "A-10 round-trip
 * proof (rehearsal branch only)" ran against PRODUCTION on 2026-09-30T11:15:17Z (system actor) and
 * reversed its live funding JE 3a231533 (1090 $2,415.00 / 1230 $30.90 / 6400 $44.10 / 6300 $10.00 /
 * 2150 $2,500.00) and its day-51 default-interest JE 2b4087a9 ($1.69), then never re-posted.
 * Header stayed status='advanced', voided_at NULL -> verify-no-document-without-a-ledger red for every
 * migration PR (the only such header in USMCA, measured live).
 *
 * WRITES: (1) postFactoringAdvanceEventInClientTx -- the sanctioned funding poster -- with the exact
 * figures of the reversed JE (reserve 3090, fee 4410, ach/wire 1000, cash_rsv 0, total 250000), so the
 * new JE is byte-for-byte the reversed one (A-10's own proof pattern). (2) The day-51 accrual row for
 * 2026-09-30 (whose JE was reversed) is deleted under app.purge_auth_id and re-posted through
 * postFactoringDefaultInterestAccrualEventInClientTx so the interest chain (engine runs daily) is
 * continuous. Refuses if the header is not exactly as measured or if any live tagged posting exists.
 *
 * Run: OWNER_AUTH_ID=AUTH-182 DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-lead-auth182-repost-fac-00001.ts --apply
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-182";
const SYSTEM_ACTOR = "00000000-0000-4000-8000-000000000001";
const FAC_ID = "f2feaa5e-a306-4fe2-88d3-dadf64d766be"; // FAC-2026-00001, Faro inv 3, 2026-08-10, $2,500.00
const DAY51 = "2026-09-30";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    if (process.env.OWNER_AUTH_ID !== AUTH_ID) throw new Error(`OWNER_AUTH_ID must be ${AUTH_ID}`);
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
  }
  const { postFactoringAdvanceEventInClientTx, postFactoringDefaultInterestAccrualEventInClientTx } = await import(
    path.join(ROOT, "apps/backend/src/accounting/factoring-posting/poster.service.ts")
  );
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await (APPLY ? assertIsIntendedProduction : assertNotProduction)(client, { label: "scripts/ops/2026-10-01-lead-auth182-repost-fac-00001.ts" });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner"); // NEONDB-OWNER-OK: AUTH-gated ops repair, not a gate read
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query("SELECT set_config('app.purge_auth_id', $1, true)", [AUTH_ID]);
    const pre = (await client.query(
      `SELECT display_id, status, voided_at::text, invoice_total_cents::text, reserve_amount_cents::text, factor_fee_cents::text,
              wire_fee_cents::text, cash_rsv_cents::text, advance_amount_cents::text, faro_invoice_number, faro_purchase_date::date::text AS fpd
         FROM accounting.factoring_advances WHERE id=$1::uuid AND operating_company_id=$2::uuid`, [FAC_ID, USMCA])).rows[0];
    if (!pre || pre.display_id !== "FAC-2026-00001" || pre.status !== "advanced" || pre.voided_at || pre.invoice_total_cents !== "250000" ||
        pre.reserve_amount_cents !== "3090" || pre.factor_fee_cents !== "4410" || pre.wire_fee_cents !== "1000" || pre.advance_amount_cents !== "241500" ||
        pre.faro_invoice_number !== "3" || pre.fpd !== "2026-08-10") {
      throw new Error(`preflight mismatch ${JSON.stringify(pre)} -- refusing`);
    }
    const live = (await client.query(
      `SELECT count(*)::text AS n FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid
        WHERE jep.source_transaction_type='factoring_advance' AND jep.source_transaction_id=$1 AND je.status='posted' AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`, [FAC_ID])).rows[0];
    if (live.n !== "0") throw new Error(`${live.n} live tagged posting(s) already -- not the measured state, refusing`);

    const repost = await postFactoringAdvanceEventInClientTx(client, {
      operating_company_id: USMCA, factoring_advance_id: FAC_ID, actor_user_id: SYSTEM_ACTOR,
      funding_figures: { invoice_total_cents: 250000, reserve_cents: 3090, fee_cents: 4410, ach_cents: 1000, cash_rsv_cents: 0 },
      faro_invoice_number: "3", faro_purchase_date: "2026-08-10",
    });
    if (!repost.posted || !repost.journal_entry_id) throw new Error(`funding repost failed: ${JSON.stringify(repost)}`);
    const lines = (await client.query(
      `SELECT a.account_number, p.debit_or_credit, p.amount_cents::text FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id
        WHERE p.journal_entry_uuid=$1::uuid ORDER BY p.line_sequence`, [repost.journal_entry_id])).rows;
    const expect = ["1090:debit:241500","1230:debit:3090","6400:debit:4410","6300:debit:1000","2150:credit:250000"];
    const got = lines.map((l) => `${l.account_number}:${l.debit_or_credit}:${l.amount_cents}`);
    if (expect.some((e) => !got.includes(e)) || got.length !== expect.length) throw new Error(`repost postings differ from the reversed JE: got ${got.join(" | ")} -- refusing`);

    const delAcc = await client.query(
      `DELETE FROM accounting.factoring_default_interest_accruals WHERE operating_company_id=$3::uuid AND factoring_advance_id=$1::uuid AND accrual_date=$2::date RETURNING id`, [FAC_ID, DAY51, USMCA]);
    const interest = await postFactoringDefaultInterestAccrualEventInClientTx(client, {
      operating_company_id: USMCA, factoring_advance_id: FAC_ID, actor_user_id: SYSTEM_ACTOR, accrual_date_iso: DAY51,
    });
    await client.query(
      `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
       VALUES (gen_random_uuid(), now(), 'accounting.factoring_advance.ledger_restored', 'warning', $1::jsonb, NULL, $2)`,
      [JSON.stringify({ auth: AUTH_ID, factoring_advance_id: FAC_ID, display_id: "FAC-2026-00001", funding_je: repost.journal_entry_id, postings: got,
        day51_accrual_deleted: delAcc.rowCount, day51_interest: interest,
        reason: "A-10 rehearsal round-trip ran on production 2026-09-30T11:15:17Z and reversed the live funding + day-51 interest without re-posting" }), `${AUTH_ID}-lead-repost`]);
    if (APPLY) await client.query("COMMIT"); else await client.query("ROLLBACK");
    console.log(JSON.stringify({ result: APPLY ? "COMMITTED" : "DRY RUN -- rolled back", funding_je: repost.journal_entry_id, postings: got, day51_accrual_deleted: delAcc.rowCount, day51_interest: interest }, null, 2));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
