#!/usr/bin/env tsx
/**
 * ROUND 186 — EVERY COUNTERPARTY bulk-accept THROUGH acceptMatchWithResolveDifference.
 * Never raw INSERT into banking.reconciliation_matches.
 *
 * Confidence bar (ALL must hold) — else Resolve:
 *   1. Amount EXACT (zero variance)
 *   2. Ledger date inside MATCH_WINDOW_STEPS.step2 relative to bank date (−7 / +2)
 *   3. Payee/text similarity >= 0.5
 *   4. Unambiguous both directions
 *   5. Zero variance
 *
 * Counterparties:
 *   - Expense ↔ BoA / Dreamline / Relay (kind=expense)
 *   - Dreamline diesel ↔ fuel.fuel_transactions (kind=fuel_transaction)
 *   - Relay wallet ↔ integrations.relay_fuel_transactions (kind=relay_fuel) — never parse bank desc
 *   - Faro named Resolve: 08/13, 08/14, 09/21 (surface every reserve movement on 09/21)
 *   - Bills: ZERO 1:1 — paid in aggregate → Resolve (do not auto-accept bill 1:1)
 *
 * Settlement (AUTH-111) and Faro exact (AUTH-110) already applied — skipped when matched.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cursor-r186-counterparties-through-engine.ts
 *   OWNER_AUTH_ID=AUTH-112 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cursor-r186-counterparties-through-engine.ts --apply
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  acceptMatchWithResolveDifference,
  MATCH_WINDOW_STEPS,
  payeeSimilarity,
  type LedgerEntryKind,
} from "../../apps/backend/src/accounting/bank-recon/match.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const ZERO_VARIANCE_ACCOUNT_ID = "00000000-0000-4000-8000-000000000000";
const APPLY = process.argv.includes("--apply");
const OUT_DIR = path.join(ROOT, "artifacts", "r186-bulk-accept");

const BOA = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const DREAMLINE = "f1839d0c-04ea-425b-b942-d0de1c4447a9";
const RELAY_WALLET = "809fcfbb-738e-471c-8fc1-a38f0f9b814a";
const ACCOUNT_IDS = [BOA, DREAMLINE, RELAY_WALLET];

const NAMED_FARO_RESOLVE = [
  { day: "2026-08-13", short_cents: 180000, label: "Reserve / short $1,800.00" },
  { day: "2026-08-14", short_cents: 544100, label: "Reserve / short $5,441.00" },
  { day: "2026-09-21", short_cents: 613541, label: "three reserve movements — surface ALL, never net" },
] as const;

const WIN_BEFORE = MATCH_WINDOW_STEPS.step2.before;
const WIN_AFTER = MATCH_WINDOW_STEPS.step2.after;
const MIN_PAYEE_SIM = 0.5;

type ResolveRow = {
  reason: string;
  named_part?: string;
  bank_transaction_id?: string;
  transaction_date?: string;
  amount_cents?: number;
  account?: string;
  detail?: Record<string, unknown>;
};

type AcceptRow = {
  path: "expense" | "fuel_transaction" | "relay_fuel";
  bank_transaction_id: string;
  transaction_date: string;
  amount_cents: number;
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
  payee_similarity: number;
  account: string;
};

function requireAuth() {
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("ROUND 133 P0: OWNER_AUTH_ID required for --apply.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], {
      stdio: "inherit",
    });
  } catch {
    console.error(`ROUND 133 P0: ${authId} rejected — see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

async function ensureSchema(client: pg.PoolClient) {
  await client.query(`
    ALTER TABLE banking.bank_transactions
      ADD COLUMN IF NOT EXISTS matched_fuel_transaction_id uuid;
    ALTER TABLE banking.bank_transactions
      ADD COLUMN IF NOT EXISTS matched_relay_fuel_transaction_id uuid;
  `);
  await client.query(`
    ALTER TABLE banking.reconciliation_matches
      DROP CONSTRAINT IF EXISTS reconciliation_matches_ledger_entry_kind_check;
    ALTER TABLE banking.reconciliation_matches
      ADD CONSTRAINT reconciliation_matches_ledger_entry_kind_check
      CHECK (ledger_entry_kind = ANY (ARRAY[
        'payment'::text, 'bill_payment'::text, 'transfer'::text, 'je'::text, 'expense'::text,
        'load'::text, 'bill'::text, 'settlement'::text, 'driver_bill'::text,
        'factoring_advance'::text, 'invoice'::text, 'fuel_transaction'::text, 'relay_fuel'::text
      ]));
  `);
}

function accountName(id: string) {
  if (id === BOA) return "USMCA FREIGHT";
  if (id === DREAMLINE) return "Dreamline Diesel Card";
  if (id === RELAY_WALLET) return "Relay Fuel Wallet";
  return id;
}

type Pair = {
  bank_id: string;
  bank_date: string;
  bank_amt: number;
  bank_text: string;
  bank_account_id: string;
  ledger_id: string;
  ledger_date: string;
  ledger_payee: string;
  sim: number;
};

function filterUnambiguous(pairs: Pair[]): { accept: Pair[]; ambiguous: Pair[] } {
  const byLedger = new Map<string, Pair[]>();
  const byBank = new Map<string, Pair[]>();
  for (const p of pairs) {
    const lk = byLedger.get(p.ledger_id) ?? [];
    lk.push(p);
    byLedger.set(p.ledger_id, lk);
    const bk = byBank.get(p.bank_id) ?? [];
    bk.push(p);
    byBank.set(p.bank_id, bk);
  }
  const accept: Pair[] = [];
  const ambiguous: Pair[] = [];
  const seenB = new Set<string>();
  const seenL = new Set<string>();
  for (const p of pairs) {
    if (seenB.has(p.bank_id) || seenL.has(p.ledger_id)) continue;
    const lr = byLedger.get(p.ledger_id) ?? [];
    const br = byBank.get(p.bank_id) ?? [];
    if (lr.length === 1 && br.length === 1) {
      accept.push(p);
      seenB.add(p.bank_id);
      seenL.add(p.ledger_id);
    } else {
      ambiguous.push(p);
      seenB.add(p.bank_id);
      seenL.add(p.ledger_id);
    }
  }
  return { accept, ambiguous };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (APPLY) requireAuth();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  const accepted: AcceptRow[] = [];
  const resolve: ResolveRow[] = [];
  let expenseN = 0;
  let fuelN = 0;
  let relayN = 0;

  try {
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [USMCA]);
    if (APPLY) await ensureSchema(client);
    else {
      // Dry-run still needs columns readable; ensure additive on dry too (IF NOT EXISTS).
      await ensureSchema(client);
    }

    const debits = await client.query<{
      id: string;
      transaction_date: string;
      amount_cents: string;
      bank_account_id: string;
      txt: string;
    }>(
      `SELECT bt.id::text, bt.transaction_date::text, ABS(bt.amount_cents)::text AS amount_cents,
              bt.bank_account_id::text,
              COALESCE(bt.merchant_name,'') || ' ' || COALESCE(bt.description,'') AS txt
         FROM banking.bank_transactions bt
        WHERE bt.operating_company_id = $1::uuid
          AND bt.voided_at IS NULL
          AND bt.is_credit = false
          AND COALESCE(bt.review_state,'') <> 'matched'
          AND bt.bank_account_id = ANY($2::uuid[])
        ORDER BY bt.transaction_date, bt.id`,
      [USMCA, ACCOUNT_IDS]
    );
    console.log(`Unmatched debits across 3 counterparties: ${debits.rows.length}`);

    // ─── EXPENSES ────────────────────────────────────────────────────────────
    const expenses = await client.query<{
      id: string;
      d: string;
      amt: string;
      payee: string;
    }>(
      `SELECT e.id::text, e.transaction_date::date::text AS d,
              ABS(e.total_amount_cents)::text AS amt,
              COALESCE(v.vendor_name, e.memo, '') AS payee
         FROM accounting.expenses e
         LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NULL
          AND COALESCE(e.is_sample_data, false) IS NOT TRUE
          AND e.posting_status = 'posted'
          AND COALESCE(e.total_amount_cents, 0) > 0
          AND NOT EXISTS (
                SELECT 1 FROM banking.bank_transactions bt
                 WHERE bt.matched_expense_id = e.id AND bt.voided_at IS NULL
              )`,
      [USMCA]
    );

    const expPairs: Pair[] = [];
    for (const e of expenses.rows) {
      const amt = Number(e.amt);
      const ed = e.d.slice(0, 10);
      for (const b of debits.rows) {
        if (Number(b.amount_cents) !== amt) continue;
        const bd = b.transaction_date.slice(0, 10);
        const from = new Date(`${bd}T00:00:00Z`);
        from.setUTCDate(from.getUTCDate() - WIN_BEFORE);
        const to = new Date(`${bd}T00:00:00Z`);
        to.setUTCDate(to.getUTCDate() + WIN_AFTER);
        const edMs = Date.parse(`${ed}T00:00:00Z`);
        if (edMs < from.getTime() || edMs > to.getTime()) continue;
        const sim = payeeSimilarity(b.txt, e.payee);
        if (sim < MIN_PAYEE_SIM) continue;
        expPairs.push({
          bank_id: b.id,
          bank_date: bd,
          bank_amt: amt,
          bank_text: b.txt,
          bank_account_id: b.bank_account_id,
          ledger_id: e.id,
          ledger_date: ed,
          ledger_payee: e.payee,
          sim,
        });
      }
    }
    const expFiltered = filterUnambiguous(expPairs);
    for (const p of expFiltered.ambiguous) {
      resolve.push({
        reason: "expense_ambiguous",
        bank_transaction_id: p.bank_id,
        transaction_date: p.bank_date,
        amount_cents: p.bank_amt,
        account: accountName(p.bank_account_id),
        detail: { expense_id: p.ledger_id, sim: p.sim },
      });
    }
    for (const p of expFiltered.accept) {
      const row: AcceptRow = {
        path: "expense",
        bank_transaction_id: p.bank_id,
        transaction_date: p.bank_date,
        amount_cents: p.bank_amt,
        ledger_entry_kind: "expense",
        ledger_entry_id: p.ledger_id,
        payee_similarity: p.sim,
        account: accountName(p.bank_account_id),
      };
      if (APPLY) {
        await acceptMatchWithResolveDifference({
          operating_company_id: USMCA,
          bank_transaction_id: p.bank_id,
          actor_user_uuid: OWNER_USER_ID,
          ledger_entry_kind: "expense",
          ledger_entry_id: p.ledger_id,
          difference_account_id: ZERO_VARIANCE_ACCOUNT_ID,
        });
      }
      accepted.push(row);
      expenseN += 1;
      console.log(
        `${APPLY ? "APPLIED" : "DRY"} expense ${p.ledger_id} → ${p.bank_id} (${accountName(p.bank_account_id)}) sim=${p.sim}`
      );
    }

    // Refresh unmatched after expense accepts
    const debits2 = APPLY
      ? (
          await client.query<{
            id: string;
            transaction_date: string;
            amount_cents: string;
            bank_account_id: string;
            txt: string;
          }>(
            `SELECT bt.id::text, bt.transaction_date::text, ABS(bt.amount_cents)::text AS amount_cents,
                    bt.bank_account_id::text,
                    COALESCE(bt.merchant_name,'') || ' ' || COALESCE(bt.description,'') AS txt
               FROM banking.bank_transactions bt
              WHERE bt.operating_company_id = $1::uuid
                AND bt.voided_at IS NULL AND bt.is_credit = false
                AND COALESCE(bt.review_state,'') <> 'matched'
                AND bt.bank_account_id = ANY($2::uuid[])`,
            [USMCA, ACCOUNT_IDS]
          )
        ).rows
      : debits.rows.filter((d) => !expFiltered.accept.some((a) => a.bank_id === d.id));

    // ─── DREAMLINE FUEL ──────────────────────────────────────────────────────
    const fuels = await client.query<{
      id: string;
      d: string;
      amt: string;
      payee: string;
    }>(
      `SELECT f.id::text,
              (f.purchased_at AT TIME ZONE 'America/Chicago')::date::text AS d,
              ROUND(COALESCE(f.total_cost, 0) * 100)::bigint::text AS amt,
              COALESCE(v.vendor_name, f.location_city, 'LOVES') AS payee
         FROM fuel.fuel_transactions f
         LEFT JOIN mdata.vendors v ON v.id = f.vendor_id
        WHERE f.operating_company_id = $1::uuid
          AND f.voided_at IS NULL AND f.archived_at IS NULL
          AND COALESCE(f.total_cost, 0) > 0
          AND NOT EXISTS (
                SELECT 1 FROM banking.bank_transactions bt
                 WHERE bt.matched_fuel_transaction_id = f.id AND bt.voided_at IS NULL
              )`,
      [USMCA]
    );

    const dreamDebits = debits2.filter((d) => d.bank_account_id === DREAMLINE);
    const fuelPairs: Pair[] = [];
    for (const f of fuels.rows) {
      const amt = Number(f.amt);
      const fd = f.d.slice(0, 10);
      for (const b of dreamDebits) {
        if (Number(b.amount_cents) !== amt) continue;
        const bd = b.transaction_date.slice(0, 10);
        const from = new Date(`${bd}T00:00:00Z`);
        from.setUTCDate(from.getUTCDate() - WIN_BEFORE);
        const to = new Date(`${bd}T00:00:00Z`);
        to.setUTCDate(to.getUTCDate() + WIN_AFTER);
        const fdMs = Date.parse(`${fd}T00:00:00Z`);
        if (fdMs < from.getTime() || fdMs > to.getTime()) continue;
        const sim = Math.max(payeeSimilarity(b.txt, f.payee), payeeSimilarity(b.txt, "LOVES"));
        if (sim < MIN_PAYEE_SIM) continue;
        fuelPairs.push({
          bank_id: b.id,
          bank_date: bd,
          bank_amt: amt,
          bank_text: b.txt,
          bank_account_id: b.bank_account_id,
          ledger_id: f.id,
          ledger_date: fd,
          ledger_payee: f.payee,
          sim,
        });
      }
    }
    const fuelFiltered = filterUnambiguous(fuelPairs);
    for (const p of fuelFiltered.ambiguous) {
      resolve.push({
        reason: "dreamline_fuel_ambiguous",
        bank_transaction_id: p.bank_id,
        transaction_date: p.bank_date,
        amount_cents: p.bank_amt,
        account: "Dreamline Diesel Card",
        detail: { fuel_transaction_id: p.ledger_id, sim: p.sim },
      });
    }
    for (const p of fuelFiltered.accept) {
      const row: AcceptRow = {
        path: "fuel_transaction",
        bank_transaction_id: p.bank_id,
        transaction_date: p.bank_date,
        amount_cents: p.bank_amt,
        ledger_entry_kind: "fuel_transaction",
        ledger_entry_id: p.ledger_id,
        payee_similarity: p.sim,
        account: "Dreamline Diesel Card",
      };
      if (APPLY) {
        await acceptMatchWithResolveDifference({
          operating_company_id: USMCA,
          bank_transaction_id: p.bank_id,
          actor_user_uuid: OWNER_USER_ID,
          ledger_entry_kind: "fuel_transaction",
          ledger_entry_id: p.ledger_id,
          difference_account_id: ZERO_VARIANCE_ACCOUNT_ID,
        });
      }
      accepted.push(row);
      fuelN += 1;
      console.log(`${APPLY ? "APPLIED" : "DRY"} fuel ${p.ledger_id} → ${p.bank_id} sim=${p.sim}`);
    }

    const claimedBanks = new Set([
      ...expFiltered.accept.map((p) => p.bank_id),
      ...fuelFiltered.accept.map((p) => p.bank_id),
    ]);
    const debits3 = debits2.filter((d) => !claimedBanks.has(d.id));

    // ─── RELAY FUEL WALLET ───────────────────────────────────────────────────
    const relays = await client.query<{
      id: string;
      d: string;
      amt: string;
      payee: string;
      txn: string | null;
    }>(
      `SELECT r.id::text,
              (r.relay_created_at AT TIME ZONE 'America/Chicago')::date::text AS d,
              ABS(r.total_amount_paid_cents)::bigint::text AS amt,
              COALESCE(r.merchant_name, '') AS payee,
              r.transaction_id
         FROM integrations.relay_fuel_transactions r
        WHERE r.operating_company_id = $1::uuid
          AND r.voided_at IS NULL
          AND COALESCE(r.is_active, true)
          AND COALESCE(r.total_amount_paid_cents, 0) > 0
          AND NOT EXISTS (
                SELECT 1 FROM banking.bank_transactions bt
                 WHERE bt.matched_relay_fuel_transaction_id = r.id AND bt.voided_at IS NULL
              )`,
      [USMCA]
    );

    const walletDebits = debits3.filter((d) => d.bank_account_id === RELAY_WALLET);
    const relayPairs: Pair[] = [];
    for (const r of relays.rows) {
      const amt = Number(r.amt);
      const rd = r.d.slice(0, 10);
      for (const b of walletDebits) {
        if (Number(b.amount_cents) !== amt) continue;
        const bd = b.transaction_date.slice(0, 10);
        const from = new Date(`${bd}T00:00:00Z`);
        from.setUTCDate(from.getUTCDate() - WIN_BEFORE);
        const to = new Date(`${bd}T00:00:00Z`);
        to.setUTCDate(to.getUTCDate() + WIN_AFTER);
        const rdMs = Date.parse(`${rd}T00:00:00Z`);
        if (rdMs < from.getTime() || rdMs > to.getTime()) continue;
        // Amount+window exact is the primary bar; merchant token boosts sim. Never parse desc to build a doc.
        const sim = Math.max(
          payeeSimilarity(b.txt, r.payee),
          payeeSimilarity(b.txt, "Love's"),
          payeeSimilarity(b.txt, "Loves"),
          b.txt.toLowerCase().includes("relay") ? 0.6 : 0
        );
        if (sim < MIN_PAYEE_SIM) continue;
        relayPairs.push({
          bank_id: b.id,
          bank_date: bd,
          bank_amt: amt,
          bank_text: b.txt,
          bank_account_id: b.bank_account_id,
          ledger_id: r.id,
          ledger_date: rd,
          ledger_payee: r.payee,
          sim,
        });
      }
    }
    const relayFiltered = filterUnambiguous(relayPairs);
    for (const p of relayFiltered.ambiguous) {
      resolve.push({
        reason: "relay_fuel_ambiguous",
        bank_transaction_id: p.bank_id,
        transaction_date: p.bank_date,
        amount_cents: p.bank_amt,
        account: "Relay Fuel Wallet",
        detail: { relay_fuel_id: p.ledger_id, sim: p.sim },
      });
    }
    for (const p of relayFiltered.accept) {
      const row: AcceptRow = {
        path: "relay_fuel",
        bank_transaction_id: p.bank_id,
        transaction_date: p.bank_date,
        amount_cents: p.bank_amt,
        ledger_entry_kind: "relay_fuel",
        ledger_entry_id: p.ledger_id,
        payee_similarity: p.sim,
        account: "Relay Fuel Wallet",
      };
      if (APPLY) {
        await acceptMatchWithResolveDifference({
          operating_company_id: USMCA,
          bank_transaction_id: p.bank_id,
          actor_user_uuid: OWNER_USER_ID,
          ledger_entry_kind: "relay_fuel",
          ledger_entry_id: p.ledger_id,
          difference_account_id: ZERO_VARIANCE_ACCOUNT_ID,
        });
      }
      accepted.push(row);
      relayN += 1;
      console.log(`${APPLY ? "APPLIED" : "DRY"} relay_fuel ${p.ledger_id} → ${p.bank_id} sim=${p.sim}`);
    }

    // ─── FARO NAMED RESOLVE ──────────────────────────────────────────────────
    for (const n of NAMED_FARO_RESOLVE) {
      const reserves =
        n.day === "2026-09-21"
          ? (
              await client.query(
                `SELECT m.id::text, m.movement_type, m.amount_cents::text, fa.display_id
                   FROM accounting.factoring_reserve_movements m
                   LEFT JOIN accounting.factoring_advances fa ON fa.id = m.factoring_advance_id
                  WHERE m.operating_company_id = $1::uuid AND m.movement_date = $2::date
                  ORDER BY ABS(m.amount_cents) DESC`,
                [USMCA, n.day]
              )
            ).rows
          : [];
      resolve.push({
        reason: `faro_named_exception_${n.day}`,
        named_part: n.label,
        transaction_date: n.day,
        amount_cents: n.short_cents,
        detail: {
          note: n.day === "2026-09-21" ? "Surface ALL reserve movements — never net." : n.label,
          reserve_movements: reserves,
        },
      });
    }

    // ─── BILLS — aggregate only ──────────────────────────────────────────────
    const billStats = await client.query<{ n: string; cents: string }>(
      `SELECT COUNT(*)::text AS n, COALESCE(SUM(amount_cents),0)::text AS cents
         FROM accounting.bills
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL
          AND revoked_at IS NULL AND COALESCE(is_sample_data,false) IS NOT TRUE`,
      [USMCA]
    );
    resolve.push({
      reason: "bills_aggregate_not_1to1",
      named_part: "Aggregate bill payment (not 1:1)",
      detail: {
        usmca_bills: Number(billStats.rows[0]?.n ?? 0),
        bills_cents: Number(billStats.rows[0]?.cents ?? 0),
        note: "93-class USMCA bills pay in AGGREGATE. Accepting a bank line against bills APPLIES them as bill payments — not auto 1:1 match.",
      },
    });

    // ─── Remaining unmatched → Resolve remainder ─────────────────────────────
    const still = await client.query<{
      id: string;
      transaction_date: string;
      amount_cents: string;
      bank_account_id: string;
      txt: string;
      is_credit: boolean;
    }>(
      `SELECT bt.id::text, bt.transaction_date::text, ABS(bt.amount_cents)::text AS amount_cents,
              bt.bank_account_id::text,
              left(COALESCE(bt.merchant_name,'') || ' ' || COALESCE(bt.description,''), 120) AS txt,
              bt.is_credit
         FROM banking.bank_transactions bt
        WHERE bt.operating_company_id = $1::uuid
          AND bt.voided_at IS NULL
          AND COALESCE(bt.review_state,'') <> 'matched'
          AND bt.bank_account_id = ANY($2::uuid[])
        ORDER BY bt.transaction_date, bt.id`,
      [USMCA, ACCOUNT_IDS]
    );

    const acceptedBankIds = new Set(accepted.map((a) => a.bank_transaction_id));
    let remainder = 0;
    for (const r of still.rows) {
      if (acceptedBankIds.has(r.id) && !APPLY) continue;
      if (APPLY && acceptedBankIds.has(r.id)) continue;
      // Skip if already listed as ambiguous above
      if (resolve.some((x) => x.bank_transaction_id === r.id)) continue;
      resolve.push({
        reason: "remainder_unmatched",
        bank_transaction_id: r.id,
        transaction_date: r.transaction_date.slice(0, 10),
        amount_cents: Number(r.amount_cents),
        account: accountName(r.bank_account_id),
        detail: { text: r.txt, is_credit: r.is_credit },
      });
      remainder += 1;
    }

    const summary = {
      mode: APPLY ? "APPLY" : "DRY_RUN",
      window: MATCH_WINDOW_STEPS.step2,
      min_payee_similarity: MIN_PAYEE_SIM,
      expense_accepted: expenseN,
      dreamline_fuel_accepted: fuelN,
      relay_fuel_accepted: relayN,
      accepted_total: accepted.length,
      resolve_total: resolve.length,
      resolve_remainder: remainder,
      named_faro_resolve: NAMED_FARO_RESOLVE.map((n) => n.day),
      bills_note: "aggregate_not_1to1",
    };

    fs.writeFileSync(path.join(OUT_DIR, "counterparties-summary.json"), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "counterparties-accepted.json"), JSON.stringify(accepted, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "counterparties-resolve.json"), JSON.stringify(resolve, null, 2));

    console.log("\n=== ROUND 186 COUNTERPARTIES SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
