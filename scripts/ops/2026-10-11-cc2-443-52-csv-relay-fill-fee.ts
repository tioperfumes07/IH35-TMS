/**
 * ACCT-F2026100686 (443.52 C audit, verify-relay-fill-documents-sum-to-relay-total): 32 USMCA Relay fills
 * imported from the owner's Relay CSV (ingest_source='csv_import') were posted by the Settlement Creator with
 * NO fee leg. Two defects stacked:
 *   1. csvRowToApiShape mapped the CSV `total` (amount + fee) onto total_amount_paid, which the Relay API
 *      defines as the amount EXCLUDING the fee — stored paid was 2.00 high on every row.
 *   2. The Creator read the fee from line rows only; a CSV fill carries its fee in fees[] only.
 * Result: each JE posts Dr 5000 <amount> / Cr 1295 <amount>; Relay's wallet drew amount + 2.00.
 * 1295 Relay Fuel Wallet is under-credited 32 x 2.00 = 64.00.
 *
 * FIX (per fill, all through the engine — no hand SQL on postings):
 *   a. voidDocument('expense') on the fill's current expense document (it owns no postings of its own; the
 *      ledger side is the fuel_event posting, reversed in b).
 *   b. postVoidReversal(entityType 'fuel_event', entityId = the fill) — reverses the old fee-less JE.
 *   c. Re-upsert the Relay row from the owner CSV through upsertRelayFuelTransaction (the fixed mapping),
 *      correcting total_amount_paid_cents.
 *   d. postFuelExpenseOnClient exactly as the Creator posts a Relay fill (cost lines = product amounts,
 *      fee = relayFillFeeCents, Cr 1295 = paid + fee) under correction_revision 1 (a new idempotency key;
 *      the reversed batch keeps its own).
 *   e. adoptRelayFillExpenseDocument on the new JE, carrying the old document's settlement_no.
 * One live JE per fill afterwards; 1295 credit per fill = Relay's paid + fee. Trial balance moves only by
 * the 64.00 fee recognition (Dr 5005 / Cr 1295). No posted settlement, fuel transaction or driver deduction
 * is touched.
 *
 * Scope (prod, 2026-10-11 12:00Z): the daily API pull re-upserted 2 of the 32 (txn_98q9aUDkZVySTP, txn_82euxQHjeGFBgK)
 * as ingest_source 'daily_pull' with the API's correct paid; their JEs are still fee-less. Scope is therefore every
 * csv_import / daily_pull fill with a Relay fee whose one live JE has no 5005 leg — still exactly 32.
 *
 * Modes: (default) dry run, rolled back · --fork-commit (refused on production) · --apply (OWNER_AUTH_ID).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "scripts/ops/2026-10-11-cc2-443-52-csv-relay-fill-fee.ts";
const APPLY = process.argv.includes("--apply");
const FORK_COMMIT = process.argv.includes("--fork-commit");
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const EXPECTED_FILLS = 32;
const EXPECTED_FEE_CENTS = 32 * 200;
const CSV_PATH = process.env.RELAY_CSV_PATH ?? path.join(os.homedir(), "IH35-LEAD-CHANNEL/Relay-All-Transactions-2026-10-10.csv");

if (APPLY && FORK_COMMIT) throw new Error("--apply and --fork-commit are exclusive");
if (APPLY) {
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID is required for --apply; refusing a production financial write.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], { stdio: "inherit", cwd: ROOT });
  } catch {
    console.error(`${authId} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const LIVE_JE = `je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`;

async function main() {
  const { parseCsv, csvRowToApiShape, fileDefAveragePricePerGallon } = await import("../../apps/backend/src/integrations/relay-payments/relay-fuel-csv-import.routes.js");
  const { parseRelayFuelTransactionRow } = await import("../../apps/backend/src/integrations/relay-payments/relay-client.js");
  const { upsertRelayFuelTransaction } = await import("../../apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.js");
  const { relayFillFeeCents } = await import("../../apps/backend/src/integrations/relay-payments/relay-sender-fee-cents.js");
  const { relayLineKind } = await import("../../apps/backend/src/fuel/relay-product-kind.js");
  const { postFuelExpenseOnClient } = await import("../../apps/backend/src/accounting/fuel-posting/poster.service.js");
  const { postVoidReversal } = await import("../../apps/backend/src/accounting/void.service.js");
  const { voidDocument } = await import("../../apps/backend/src/accounting/void-document.service.js");
  const { adoptRelayFillExpenseDocument } = await import("../../apps/backend/src/fuel/fuel-expense-document.service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");

  // The owner's CSV, by Relay transaction id.
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const header = rows[0]!.map((h) => h.trim());
  const idx = new Map(header.map((h, i) => [h, i]));
  const getter = (r: string[]) => (name: string) => (idx.has(name) ? r[idx.get(name)!] : undefined);
  const defAverage = fileDefAveragePricePerGallon(rows.slice(1).map(getter));
  const csvById = new Map<string, string[]>();
  for (const r of rows.slice(1)) {
    const id = String(getter(r)("id") ?? "").trim();
    if (id) csvById.set(id, r);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await (APPLY ? assertIsIntendedProduction : assertNotProduction)(client, { label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);
    const businessDate = (await client.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Chicago')::date::text AS d`)).rows[0]!.d;

    // Scope: every csv_import fill whose ONE live fuel_event JE carries no fee leg while Relay reported a fee.
    const scope = await client.query<{ fill_id: string; transaction_id: string; ingest_source: string; je_id: string; entry_date: string; credit_1295: string; expense_id: string | null; settlement_no: string | null; source_fuel_transaction_id: string | null }>(
      `WITH f AS (
         SELECT r.id, r.transaction_id FROM integrations.relay_fuel_transactions r
          WHERE r.operating_company_id = $1::uuid AND r.ingest_source IN ('csv_import', 'daily_pull')
            AND jsonb_typeof(r.fees) = 'array' AND jsonb_array_length(r.fees) > 0),
       j AS (
         SELECT DISTINCT f.id AS fill_id, f.transaction_id, p.journal_entry_uuid AS je_id, je.entry_date
           FROM f
           JOIN accounting.journal_entry_postings p ON p.operating_company_id = $1::uuid
            AND p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = f.id::text
           JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND ${LIVE_JE})
       SELECT j.fill_id::text, j.transaction_id, (SELECT ingest_source FROM integrations.relay_fuel_transactions WHERE id = j.fill_id) AS ingest_source, j.je_id::text, j.entry_date::text,
              (SELECT sum(p.amount_cents) FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
                WHERE p.journal_entry_uuid = j.je_id AND p.debit_or_credit = 'credit' AND a.account_number = '1295')::text AS credit_1295,
              e.id::text AS expense_id, e.settlement_no, e.source_fuel_transaction_id::text
         FROM j
         LEFT JOIN accounting.expenses e ON e.operating_company_id = $1::uuid AND e.journal_entry_id = j.je_id AND e.voided_at IS NULL
        WHERE NOT EXISTS (
          SELECT 1 FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
           WHERE p.journal_entry_uuid = j.je_id AND a.account_number = '5005')
        ORDER BY j.entry_date, j.transaction_id`,
      [USMCA_ID]
    );
    const fills = scope.rows;
    if (fills.length !== EXPECTED_FILLS) throw new Error(`scope: expected ${EXPECTED_FILLS} fee-less Relay fills, found ${fills.length}`);
    if (new Set(fills.map((f) => f.fill_id)).size !== fills.length) throw new Error("scope: a fill has more than one live JE -- STOP");
    for (const f of fills) {
      if (!f.expense_id) throw new Error(`scope: fill ${f.transaction_id} has no live expense document -- STOP`);
      if (f.ingest_source === "csv_import" && !csvById.has(f.transaction_id)) throw new Error(`scope: fill ${f.transaction_id} is not in ${CSV_PATH}`);
    }
    const before1295 = fills.reduce((s, f) => s + Number(f.credit_1295), 0);
    console.log(`SCOPE OK: ${fills.length} fills, 1295 credit on their live JEs = ${before1295} cents`);

    const tbSql = `SELECT coalesce(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS net,
                          coalesce(sum(CASE WHEN a.account_number='1295' THEN CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END END),0)::text AS a1295,
                          coalesce(sum(CASE WHEN a.account_number='5005' THEN CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END END),0)::text AS a5005
                     FROM accounting.journal_entry_postings p
                     JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
                     JOIN catalogs.accounts a ON a.id = p.account_id
                    WHERE je.operating_company_id = $1::uuid AND je.status = 'posted'`;
    const tbBefore = (await client.query<{ net: string; a1295: string; a5005: string }>(tbSql, [USMCA_ID])).rows[0]!;
    const settlementsSql = `SELECT count(*)::text AS n, coalesce(sum(coalesce(ft.total_cost,0)),0)::text AS cost
                              FROM fuel.fuel_transactions ft WHERE ft.relay_fuel_transaction_id = ANY($1::uuid[])`;
    const ftBefore = (await client.query<{ n: string; cost: string }>(settlementsSql, [fills.map((f) => f.fill_id)])).rows[0]!;

    const results: Array<Record<string, unknown>> = [];
    for (const f of fills) {
      const reason = `ACCT-F2026100686: Relay fill ${f.transaction_id} posted without its Relay fee; reposted with the fee through the engine`;
      // a. the document (it owns no ledger rows; voidDocument stamps it whole).
      await voidDocument(client as never, { operatingCompanyId: USMCA_ID, type: "expense", id: f.expense_id!, reason, actor: { userId: OWNER_USER_ID, role: "Owner" }, currentBusinessDate: businessDate });
      // b. the ledger.
      const rev = await postVoidReversal(client as never, { operatingCompanyId: USMCA_ID, entityType: "fuel_event", entityId: f.fill_id, originalDate: f.entry_date, memo: reason, currentDate: businessDate }, { userId: OWNER_USER_ID });
      // c. the Relay row, through the ingest upsert with the fixed mapping. A row the daily API pull has since
      //    re-upserted (ingest_source 'daily_pull') already carries Relay's own paid-excluding-fee; it is left as is.
      if (f.ingest_source === "csv_import") {
        const raw = csvRowToApiShape(getter(csvById.get(f.transaction_id)!), { defAveragePricePerGallon: defAverage });
        const tx = raw ? parseRelayFuelTransactionRow(raw) : null;
        if (!tx) throw new Error(`fill ${f.transaction_id}: CSV row did not parse`);
        const up = await upsertRelayFuelTransaction(client as never, USMCA_ID, tx, "csv_import");
        if (up.relay_fuel_transaction_id !== f.fill_id) throw new Error(`fill ${f.transaction_id}: upsert landed on ${up.relay_fuel_transaction_id}, not ${f.fill_id}`);
      }
      // d. the post, exactly as the Creator posts a Relay fill.
      const relay = (await client.query<{ fees: unknown[] | null; paid: string }>(
        `SELECT fees, total_amount_paid_cents::text AS paid FROM integrations.relay_fuel_transactions WHERE id = $1::uuid`, [f.fill_id])).rows[0]!;
      const lines = await client.query<{ fuel_type: string | null; fuel_product_code: string | null; fuel_type_description: string | null; total_discounted_price_cents: string | null; fee_amount_cents: string | null; fee_type: string | null }>(
        `SELECT fuel_type, fuel_product_code, fuel_type_description, total_discounted_price_cents, fee_amount_cents, fee_type
           FROM integrations.relay_fuel_transaction_lines WHERE relay_fuel_transaction_id = $1::uuid AND voided_at IS NULL ORDER BY line_index`, [f.fill_id]);
      const costLines = lines.rows.filter((l) => Number(l.total_discounted_price_cents ?? 0) > 0).map((l) => {
        const k = relayLineKind(l);
        return { fuel_kind: (k === "other" ? "misc" : k) as never, amount_cents: Math.round(Number(l.total_discounted_price_cents ?? 0)) };
      });
      const feeCents = relayFillFeeCents({ transaction_id: f.transaction_id, fees: relay.fees ?? null, line_fee_amount_cents: lines.rows.map((l) => Number(l.fee_amount_cents ?? 0)) });
      const costCents = costLines.reduce((s, l) => s + l.amount_cents, 0);
      if (costCents !== Number(relay.paid)) throw new Error(`fill ${f.transaction_id}: product lines ${costCents} != Relay paid ${relay.paid} -- refusing rather than plugging`);
      if (feeCents !== 200) throw new Error(`fill ${f.transaction_id}: expected a 200-cent Relay fee, got ${feeCents}`);
      const txn = (await client.query<{ unit_id: string | null; driver_id: string | null; transaction_at: string; fuel_type: string | null }>(
        `SELECT unit_id::text, driver_id::text, transaction_at::text, fuel_type FROM fuel.fuel_transactions
          WHERE relay_fuel_transaction_id = $1::uuid AND archived_at IS NULL
          ORDER BY (id::text = $2) DESC, total_cost DESC NULLS LAST, id LIMIT 1`, [f.fill_id, f.source_fuel_transaction_id ?? ""])).rows[0];
      const primaryKind = txn?.fuel_type === "def" ? "def" : txn?.fuel_type === "reefer_diesel" ? "reefer" : "diesel";
      const posted = await postFuelExpenseOnClient(client as never, {
        operating_company_id: USMCA_ID,
        actor_user_id: OWNER_USER_ID,
        fuel_event_id: f.fill_id,
        fuel_kind: primaryKind as never,
        posted_at: txn?.transaction_at ?? `${f.entry_date}T12:00:00.000Z`,
        amount_cents: costCents + feeCents,
        posting_path: "company_direct",
        company_direct_credit: "relay_fuel_wallet",
        cost_lines: costLines.length > 0 ? costLines : undefined,
        fee_amount_cents: feeCents,
        unit_id: txn?.unit_id ?? null,
        driver_id: txn?.driver_id ?? null,
        correction_revision: 1,
      } as never);
      if (!posted.journal_entry_id || posted.journal_entry_id === f.je_id) throw new Error(`fill ${f.transaction_id}: repost returned no new journal entry`);
      // e. the document adopts the new JE and keeps the settlement it was posted for.
      const doc = await adoptRelayFillExpenseDocument(client as never, { operating_company_id: USMCA_ID, relay_fill_id: f.fill_id, journal_entry_id: posted.journal_entry_id, requesting_user_uuid: OWNER_USER_ID, settlement_no: f.settlement_no });
      if (doc.outcome === "refused") throw new Error(`fill ${f.transaction_id}: document refused: ${doc.reason}`);
      await appendCrudAudit(client as never, OWNER_USER_ID, "accounting.relay_fill.fee_correction_reposted",
        { resource_type: "integrations.relay_fuel_transactions", resource_id: f.fill_id, operating_company_id: USMCA_ID, transaction_id: f.transaction_id,
          old_journal_entry_id: f.je_id, reversal_journal_entry_id: rev.reversal_journal_entry_id ?? null, new_journal_entry_id: posted.journal_entry_id,
          old_expense_id: f.expense_id, new_expense_id: doc.expense_id, fee_cents: feeCents, finding: "ACCT-F2026100686" }, "info", "443.52");
      results.push({ txn: f.transaction_id, old_je: f.je_id, new_je: posted.journal_entry_id, new_doc: doc.expense_id, paid: relay.paid, fee: feeCents });
    }

    // Post-checks: one live JE per fill, 1295 = paid + fee, the document ties to its JE.
    const after = await client.query<{ transaction_id: string; live_jes: string; credit_1295: string; fee_5005: string; paid: string; doc_total: string | null; docs: string }>(
      `SELECT r.transaction_id,
              (SELECT count(DISTINCT p.journal_entry_uuid) FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
                WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = r.id::text AND ${LIVE_JE})::text AS live_jes,
              (SELECT coalesce(sum(p.amount_cents),0) FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid JOIN catalogs.accounts a ON a.id = p.account_id
                WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = r.id::text AND ${LIVE_JE} AND a.account_number = '1295' AND p.debit_or_credit = 'credit')::text AS credit_1295,
              (SELECT coalesce(sum(p.amount_cents),0) FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid JOIN catalogs.accounts a ON a.id = p.account_id
                WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = r.id::text AND ${LIVE_JE} AND a.account_number = '5005' AND p.debit_or_credit = 'debit')::text AS fee_5005,
              r.total_amount_paid_cents::text AS paid,
              (SELECT e.total_amount_cents::text FROM accounting.expenses e JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
                WHERE e.voided_at IS NULL AND ${LIVE_JE} AND e.journal_entry_id IN (SELECT p.journal_entry_uuid FROM accounting.journal_entry_postings p WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = r.id::text) LIMIT 1) AS doc_total,
              (SELECT count(*) FROM accounting.expenses e WHERE e.voided_at IS NULL AND e.journal_entry_id IN (SELECT p.journal_entry_uuid FROM accounting.journal_entry_postings p WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = r.id::text))::text AS docs
         FROM integrations.relay_fuel_transactions r WHERE r.id = ANY($1::uuid[])`,
      [fills.map((f) => f.fill_id)]
    );
    let corrected = 0;
    for (const a of after.rows) {
      const want = Number(a.paid) + 200;
      const ok = a.live_jes === "1" && Number(a.credit_1295) === want && a.fee_5005 === "200" && Number(a.doc_total) === want && a.docs === "1";
      if (!ok) throw new Error(`post-check failed: ${JSON.stringify(a)}`);
      corrected++;
    }
    const after1295 = after.rows.reduce((s, a) => s + Number(a.credit_1295), 0);
    const tbAfter = (await client.query<{ net: string; a1295: string; a5005: string }>(tbSql, [USMCA_ID])).rows[0]!;
    const ftAfter = (await client.query<{ n: string; cost: string }>(settlementsSql, [fills.map((f) => f.fill_id)])).rows[0]!;
    console.log(JSON.stringify(results, null, 1));
    console.log(`CORRECTED ${corrected} of ${EXPECTED_FILLS}`);
    console.log(`1295 credit on these fills: before ${before1295} after ${after1295} (delta ${after1295 - before1295})`);
    console.log(`TRIAL BALANCE net: before ${tbBefore.net} after ${tbAfter.net} · 1295 net ${tbBefore.a1295} -> ${tbAfter.a1295} · 5005 net ${tbBefore.a5005} -> ${tbAfter.a5005}`);
    console.log(`fuel.fuel_transactions for these fills (settlement side): before ${JSON.stringify(ftBefore)} after ${JSON.stringify(ftAfter)}`);
    if (tbAfter.net !== "0") throw new Error(`trial balance does not net to zero: ${tbAfter.net}`);
    if (after1295 - before1295 !== EXPECTED_FEE_CENTS) throw new Error(`1295 moved ${after1295 - before1295}, expected ${EXPECTED_FEE_CENTS}`);
    if (Number(tbBefore.a1295) - Number(tbAfter.a1295) !== EXPECTED_FEE_CENTS) throw new Error("1295 account moved by more than the fee recognition");
    if (Number(tbAfter.a5005) - Number(tbBefore.a5005) !== EXPECTED_FEE_CENTS) throw new Error("5005 account moved by more than the fee recognition");
    if (JSON.stringify(ftBefore) !== JSON.stringify(ftAfter)) throw new Error("fuel transactions changed -- settlement side must not move");

    if (APPLY || FORK_COMMIT) {
      await client.query("COMMIT");
      console.log(APPLY ? "COMMITTED (production)" : "COMMITTED (fork rehearsal)");
    } else {
      await client.query("ROLLBACK");
      console.log("DRY RUN -- rolled back");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
