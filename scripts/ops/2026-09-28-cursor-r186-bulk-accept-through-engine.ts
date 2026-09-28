#!/usr/bin/env tsx
/**
 * ROUND 186 — bulk-accept every high-confidence unmatched USMCA bank line THROUGH the real
 * accept handler. Never INSERT into banking.reconciliation_matches by hand.
 *
 * Confidence bar (ALL must hold) — else Resolve:
 *   1. Amount exact within tolerance (and ZERO variance — no auto variance JE)
 *   2. Date gap <= 5 days
 *   3. Payee/text similarity >= 0.5
 *   4. Unambiguous both directions
 *   5. Zero variance
 *
 * Faro path: submission_batch_ref FARO-YYYY-MM-DD batches whose net SUM equals the same-day
 * ORIG:FARO wire exactly → acceptExactMultiDocumentMatch. Named exceptions go to Resolve:
 *   08/13 short $1,800.00 · 08/14 short $5,441.00 · 09/21 (surface every reserve movement, never net)
 *
 * Debit path: findCandidates → auto_match && exact_amount && unambiguous both ways →
 * acceptMatchWithResolveDifference.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cursor-r186-bulk-accept-through-engine.ts
 *   OWNER_AUTH_ID=AUTH-110 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cursor-r186-bulk-accept-through-engine.ts --apply
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  acceptExactMultiDocumentMatch,
  acceptMatchWithResolveDifference,
  findCandidates,
  type LedgerEntryKind,
  type MatchCandidate,
} from "../../apps/backend/src/accounting/bank-recon/match.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const ZERO_VARIANCE_ACCOUNT_ID = "00000000-0000-4000-8000-000000000000";
const APPLY = process.argv.includes("--apply");
const FARO_ONLY = process.argv.includes("--faro-only") || process.env.FARO_ONLY === "1";
const OUT_DIR = path.join(ROOT, "artifacts", "r186-bulk-accept");

const NAMED_FARO_RESOLVE = new Set(["2026-08-13", "2026-08-14", "2026-09-21"]);

type ResolveRow = {
  reason: string;
  bank_transaction_id?: string;
  transaction_date?: string;
  amount_cents?: number;
  detail?: Record<string, unknown>;
};

type AcceptRow = {
  path: "faro_batch" | "findCandidates_1to1";
  bank_transaction_id: string;
  transaction_date: string;
  amount_cents: number;
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_ids: string[];
  submission_batch_ref?: string;
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

async function loadFaroBatches(client: pg.PoolClient) {
  const batches = await client.query<{
    submission_batch_ref: string;
    n: number;
    batch_net_cents: string;
    purchase_date: string;
  }>(
    `SELECT submission_batch_ref,
            COUNT(*)::int AS n,
            SUM(
              COALESCE(invoice_total_cents, 0)
              - COALESCE(reserve_amount_cents, 0)
              - COALESCE(factor_fee_cents, 0)
              - COALESCE(wire_fee_cents, 0)
              - COALESCE(cash_rsv_cents, 0)
            )::bigint AS batch_net_cents,
            SUBSTRING(submission_batch_ref FROM 6)::date::text AS purchase_date
       FROM accounting.factoring_advances
      WHERE operating_company_id = $1::uuid
        AND voided_at IS NULL
        AND submission_batch_ref LIKE 'FARO-%'
      GROUP BY submission_batch_ref
      ORDER BY purchase_date`,
    [USMCA]
  );

  const wires = await client.query<{
    id: string;
    transaction_date: string;
    amount_cents: string;
    review_state: string | null;
  }>(
    `SELECT id::text, transaction_date::text, amount_cents::text, review_state
       FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
        AND voided_at IS NULL
        AND is_credit = true
        AND description ILIKE '%ORIG:FARO%'
      ORDER BY transaction_date, amount_cents`,
    [USMCA]
  );

  const advances = await client.query<{
    id: string;
    submission_batch_ref: string;
  }>(
    `SELECT id::text, submission_batch_ref
       FROM accounting.factoring_advances
      WHERE operating_company_id = $1::uuid
        AND voided_at IS NULL
        AND submission_batch_ref LIKE 'FARO-%'`,
    [USMCA]
  );

  const advancesByBatch = new Map<string, string[]>();
  for (const a of advances.rows) {
    const list = advancesByBatch.get(a.submission_batch_ref) ?? [];
    list.push(a.id);
    advancesByBatch.set(a.submission_batch_ref, list);
  }

  return { batches: batches.rows, wires: wires.rows, advancesByBatch };
}

async function loadReserveMovementsForDay(client: pg.PoolClient, day: string) {
  const res = await client.query<{
    id: string;
    movement_type: string;
    amount_cents: string;
    factoring_advance_id: string;
    display_id: string | null;
  }>(
    `SELECT m.id::text,
            m.movement_type,
            m.amount_cents::text,
            m.factoring_advance_id::text,
            fa.display_id
       FROM accounting.factoring_reserve_movements m
       LEFT JOIN accounting.factoring_advances fa ON fa.id = m.factoring_advance_id
      WHERE m.operating_company_id = $1::uuid
        AND m.movement_date = $2::date
      ORDER BY ABS(m.amount_cents) DESC, m.id`,
    [USMCA, day]
  );
  return res.rows;
}

function clearsBar(c: MatchCandidate): boolean {
  return Boolean(c.auto_match && c.exact_amount && c.amount_gap_cents === 0);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (APPLY) requireAuth();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  const accepted: AcceptRow[] = [];
  const resolve: ResolveRow[] = [];
  let faroExact = 0;
  let faroResolve = 0;
  let debitAccepted = 0;
  let debitResolve = 0;

  try {
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [USMCA]);

    // ─── FARO BATCHES ────────────────────────────────────────────────────────
    const { batches, wires, advancesByBatch } = await loadFaroBatches(client);
    const wiresByDate = new Map<string, typeof wires>();
    for (const w of wires) {
      const d = w.transaction_date.slice(0, 10);
      const list = wiresByDate.get(d) ?? [];
      list.push(w);
      wiresByDate.set(d, list);
    }

    console.log(`Faro batches: ${batches.length}. Faro wires: ${wires.length}.`);

    for (const batch of batches) {
      const day = batch.purchase_date.slice(0, 10);
      const batchNet = Number(batch.batch_net_cents);
      const dayWires = wiresByDate.get(day) ?? [];
      const advanceIds = advancesByBatch.get(batch.submission_batch_ref) ?? [];

      if (NAMED_FARO_RESOLVE.has(day)) {
        const detail: Record<string, unknown> = {
          submission_batch_ref: batch.submission_batch_ref,
          batch_net_cents: batchNet,
          wires: dayWires.map((w) => ({
            id: w.id,
            amount_cents: Number(w.amount_cents),
            variance_cents: batchNet - Number(w.amount_cents),
          })),
        };
        if (day === "2026-09-21") {
          detail.reserve_movements = await loadReserveMovementsForDay(client, day);
          detail.reserve_note =
            "ROUND 186: surface ALL reserve movements this day — never net them into one Resolve row.";
        }
        resolve.push({
          reason: `faro_named_exception_${day}`,
          transaction_date: day,
          amount_cents: batchNet,
          bank_transaction_id: dayWires[0]?.id,
          detail,
        });
        faroResolve += 1;
        console.log(`RESOLVE Faro ${batch.submission_batch_ref} (named exception)`);
        continue;
      }

      const exactWires = dayWires.filter(
        (w) => Number(w.amount_cents) === batchNet && w.review_state !== "matched"
      );

      if (exactWires.length !== 1) {
        resolve.push({
          reason:
            exactWires.length === 0
              ? "faro_batch_wire_not_exact_or_ambiguous_zero"
              : "faro_batch_wire_ambiguous_multiple",
          transaction_date: day,
          amount_cents: batchNet,
          detail: {
            submission_batch_ref: batch.submission_batch_ref,
            batch_net_cents: batchNet,
            exact_wire_count: exactWires.length,
            day_wires: dayWires.map((w) => ({
              id: w.id,
              amount_cents: Number(w.amount_cents),
              review_state: w.review_state,
            })),
          },
        });
        faroResolve += 1;
        console.log(
          `RESOLVE Faro ${batch.submission_batch_ref} net=${batchNet} exactWires=${exactWires.length}`
        );
        continue;
      }

      const wire = exactWires[0]!;
      const row: AcceptRow = {
        path: "faro_batch",
        bank_transaction_id: wire.id,
        transaction_date: day,
        amount_cents: batchNet,
        ledger_entry_kind: "factoring_advance",
        ledger_entry_ids: advanceIds,
        submission_batch_ref: batch.submission_batch_ref,
      };

      if (!APPLY) {
        accepted.push(row);
        faroExact += 1;
        console.log(
          `DRY Faro ACCEPT ${batch.submission_batch_ref} → bank ${wire.id} (${advanceIds.length} advances)`
        );
        continue;
      }

      if (advanceIds.length === 1) {
        await acceptMatchWithResolveDifference({
          operating_company_id: USMCA,
          bank_transaction_id: wire.id,
          actor_user_uuid: OWNER_USER_ID,
          ledger_entry_kind: "factoring_advance",
          ledger_entry_id: advanceIds[0]!,
          difference_account_id: ZERO_VARIANCE_ACCOUNT_ID,
        });
      } else {
        await acceptExactMultiDocumentMatch({
          operating_company_id: USMCA,
          bank_transaction_id: wire.id,
          actor_user_uuid: OWNER_USER_ID,
          entries: advanceIds.map((id) => ({
            ledger_entry_kind: "factoring_advance" as const,
            ledger_entry_id: id,
          })),
        });
      }
      accepted.push(row);
      faroExact += 1;
      console.log(
        `APPLIED Faro ACCEPT ${batch.submission_batch_ref} → bank ${wire.id} (${advanceIds.length} advances)`
      );
    }

    // ─── findCandidates 1:1 (debits / settlement-born) ───────────────────────
    if (FARO_ONLY) {
      console.log("Skipping debit findCandidates path (--faro-only).");
    } else {
    const unmatched = await client.query<{
      id: string;
      transaction_date: string;
      amount_cents: string;
      is_credit: boolean;
    }>(
      `SELECT id::text, transaction_date::text, amount_cents::text, is_credit
         FROM banking.bank_transactions
        WHERE operating_company_id = $1::uuid
          AND voided_at IS NULL
          AND COALESCE(review_state, '') <> 'matched'
          AND description NOT ILIKE '%ORIG:FARO%'
          AND is_credit = false
        ORDER BY transaction_date, id
        LIMIT 500`,
      [USMCA]
    );

    console.log(`Unmatched non-Faro debit bank lines scanned: ${unmatched.rows.length}`);

    type CandHit = {
      bank_id: string;
      transaction_date: string;
      amount_cents: number;
      candidate: MatchCandidate;
    };
    const hits: CandHit[] = [];

    let scanned = 0;
    for (const txn of unmatched.rows) {
      scanned += 1;
      if (scanned % 25 === 0) console.log(`  findCandidates progress ${scanned}/${unmatched.rows.length}`);
      const result = await findCandidates({
        operating_company_id: USMCA,
        bank_transaction_id: txn.id,
        actor_user_uuid: OWNER_USER_ID,
      });
      const clearing = result.candidates.filter(clearsBar);
      if (clearing.length === 0) {
        if (result.candidates.length > 0) {
          resolve.push({
            reason: "candidates_fail_confidence_bar",
            bank_transaction_id: txn.id,
            transaction_date: txn.transaction_date.slice(0, 10),
            amount_cents: Math.abs(Number(txn.amount_cents)),
            detail: {
              top: result.candidates.slice(0, 3).map((c) => ({
                kind: c.ledger_entry_kind,
                id: c.ledger_entry_id,
                amount_gap_cents: c.amount_gap_cents,
                date_gap_days: c.date_gap_days,
                memo_similarity: c.memo_similarity,
                auto_match: c.auto_match,
                exact_amount: c.exact_amount,
              })),
            },
          });
          debitResolve += 1;
        }
        continue;
      }
      if (clearing.length > 1) {
        resolve.push({
          reason: "ambiguous_multiple_candidates_clear_bar",
          bank_transaction_id: txn.id,
          transaction_date: txn.transaction_date.slice(0, 10),
          amount_cents: Math.abs(Number(txn.amount_cents)),
          detail: { clearing: clearing.map((c) => ({ kind: c.ledger_entry_kind, id: c.ledger_entry_id })) },
        });
        debitResolve += 1;
        continue;
      }
      hits.push({
        bank_id: txn.id,
        transaction_date: txn.transaction_date.slice(0, 10),
        amount_cents: Math.abs(Number(txn.amount_cents)),
        candidate: clearing[0]!,
      });
    }

    // Unambiguous both directions: ledger entry is top clearing candidate for exactly one bank line.
    const byLedger = new Map<string, CandHit[]>();
    for (const h of hits) {
      const key = `${h.candidate.ledger_entry_kind}:${h.candidate.ledger_entry_id}`;
      const list = byLedger.get(key) ?? [];
      list.push(h);
      byLedger.set(key, list);
    }

    for (const h of hits) {
      const key = `${h.candidate.ledger_entry_kind}:${h.candidate.ledger_entry_id}`;
      const rivals = byLedger.get(key) ?? [];
      if (rivals.length !== 1) {
        resolve.push({
          reason: "ambiguous_ledger_claimed_by_multiple_banks",
          bank_transaction_id: h.bank_id,
          transaction_date: h.transaction_date,
          amount_cents: h.amount_cents,
          detail: {
            ledger_entry_kind: h.candidate.ledger_entry_kind,
            ledger_entry_id: h.candidate.ledger_entry_id,
            rival_bank_ids: rivals.map((r) => r.bank_id),
          },
        });
        debitResolve += 1;
        continue;
      }

      const row: AcceptRow = {
        path: "findCandidates_1to1",
        bank_transaction_id: h.bank_id,
        transaction_date: h.transaction_date,
        amount_cents: h.amount_cents,
        ledger_entry_kind: h.candidate.ledger_entry_kind,
        ledger_entry_ids: [h.candidate.ledger_entry_id],
      };

      if (!APPLY) {
        accepted.push(row);
        debitAccepted += 1;
        console.log(
          `DRY 1:1 ACCEPT bank ${h.bank_id} → ${h.candidate.ledger_entry_kind}:${h.candidate.ledger_entry_id}`
        );
        continue;
      }

      await acceptMatchWithResolveDifference({
        operating_company_id: USMCA,
        bank_transaction_id: h.bank_id,
        actor_user_uuid: OWNER_USER_ID,
        ledger_entry_kind: h.candidate.ledger_entry_kind,
        ledger_entry_id: h.candidate.ledger_entry_id,
        difference_account_id: ZERO_VARIANCE_ACCOUNT_ID,
      });
      accepted.push(row);
      debitAccepted += 1;
      console.log(
        `APPLIED 1:1 ACCEPT bank ${h.bank_id} → ${h.candidate.ledger_entry_kind}:${h.candidate.ledger_entry_id}`
      );
    }
    } // end !FARO_ONLY

    const summary = {
      mode: APPLY ? "APPLY" : "DRY_RUN",
      faro_only: FARO_ONLY,
      faro_exact_accepted: faroExact,
      faro_resolve: faroResolve,
      debit_accepted: debitAccepted,
      debit_resolve: debitResolve,
      accepted_total: accepted.length,
      resolve_total: resolve.length,
      named_faro_resolve: ["2026-08-13", "2026-08-14", "2026-09-21"],
    };

    fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "accepted.json"), JSON.stringify(accepted, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "resolve.json"), JSON.stringify(resolve, null, 2));

    console.log("\n=== ROUND 186 SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Wrote ${OUT_DIR}/summary.json (+ accepted.json, resolve.json)`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
