// FIN-21 — Prepaid-amortization + fixed-asset-depreciation GL posting engine
// (TIER-1 FINANCIAL; BUILD-AND-HOLD, flag OFF).
//
// REUSES the established accounting spine end-to-end (NO new GL math, NO ad-hoc poster):
//   - Prepaid amortization: per accounting.prepaid_amortization_rows where posted=false AND
//     period_date <= run_date, post ONE balanced JE per period:
//        Dr  prepaid_assets.expense_account_id   = row.amount_cents
//        Cr  prepaid_assets.asset_account_id     = row.amount_cents
//     (the last period already carries the rounding remainder — the row math is authoritative).
//   - Fixed-asset depreciation: materialize accounting.depreciation_schedule_rows from the SHARED
//     fixed-assets.math.ts schedule, then post each unposted period <= run_date:
//        Dr  fixed_assets.depr_expense_account_id  = row.depreciation_amount_cents
//        Cr  fixed_assets.accum_depr_account_id    = row.depreciation_amount_cents
//     (respects method / convention / prior_accumulated_depr_cents via the shared compute).
//
// Accounts come from the asset/prepaid ROWS' OWN account columns (asset_account_id / expense_account_id
// / depr_expense_account_id / accum_depr_account_id) — NOT from account-role bindings — so FIN-21 needs
// no role-CHECK migration (no collision with FIN-22's role migration).
//
// IDEMPOTENT per (asset, period): the row.posted flag + the deterministic idempotency_key on
// journal_entry_postings (uq_jep_company_idempotency_line) make a period-run safely re-runnable with
// NO double-post. Void/reversal reuses the shared void path (postVoidReversal), never DELETE.
//
// FLAG GATE: AMORTIZATION_GL_POSTING_ENABLED (default OFF) -> NO-OP, zero JEs / financial rows.

import { withCurrentUser } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { emitAccountingSpineEvent, writeTransactionSourceLink } from "../accounting-spine-emit.js";
import { postVoidReversal } from "../void.service.js";
import { computeDepreciationSchedule } from "../fixed-assets.math.js";
import {
  AMORTIZATION_GL_POSTING_FLAG_KEY,
  AmortizationPostingError,
  assertBalanced,
  buildDepreciationIdempotencyKey,
  buildPrepaidAmortizationIdempotencyKey,
  type BalancedLine,
} from "./amortization-posting.math.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type Actor = { userId: string };

type PostedPeriod = { period_number: number; journal_entry_id: string; amount_cents: number };

export type AmortizationPostingResult =
  | { result: "skipped_flag_off"; asset_id: string; posted_periods: PostedPeriod[] }
  | { result: "nothing_to_post"; asset_id: string; posted_periods: PostedPeriod[]; note?: string | null }
  | {
      result: "posted";
      asset_id: string;
      posted_periods: PostedPeriod[];
      period_count: number;
      total_posted_cents: number;
    };

export type AmortizationReversalResult = {
  result: "reversed" | "nothing_to_reverse";
  asset_id: string;
  reversed_periods: Array<{ period_number: number; journal_entry_id: string; reversal_journal_entry_id: string | null }>;
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Closed-period guard — reuses the shared accounting.closed_period_cutoff DB function (no new math). */
async function assertOpenPeriod(client: DbClient, operatingCompanyId: string, postingDate: string): Promise<void> {
  const res = await client.query<{ cutoff: string | null }>(
    `SELECT accounting.closed_period_cutoff($1::uuid)::text AS cutoff`,
    [operatingCompanyId]
  );
  const closedThrough = res.rows[0]?.cutoff ?? null;
  if (closedThrough && postingDate <= closedThrough) {
    throw new AmortizationPostingError(
      "PERIOD_LOCKED",
      `Posting date ${postingDate} is in a closed period (closed_through=${closedThrough})`,
      { closed_through: closedThrough, posting_date: postingDate }
    );
  }
}

/** Find an already-posted JE for a deterministic idempotency key (drift-heal + already-posted detection). */
async function findExistingPostedJe(client: DbClient, operatingCompanyId: string, idempotencyKey: string): Promise<string | null> {
  const res = await client.query<{ journal_entry_uuid: string }>(
    `
      SELECT journal_entry_uuid::text
      FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid AND idempotency_key = $2
      ORDER BY line_sequence ASC
      LIMIT 1
    `,
    [operatingCompanyId, idempotencyKey]
  );
  return res.rows[0]?.journal_entry_uuid ?? null;
}

async function insertJournalEntryHeader(
  client: DbClient,
  operatingCompanyId: string,
  entryDate: string,
  memo: string,
  actorUserId: string
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.journal_entries
        (operating_company_id, entry_date, memo, status, source, created_by_user_id, qbo_sync_pending, created_at, updated_at)
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true, now(), now())
      RETURNING id::text
    `,
    [operatingCompanyId, entryDate, memo, actorUserId]
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error("amortization_journal_entry_insert_failed");
  return id;
}

type LineToPost = BalancedLine & { account_id: string; description: string };

/**
 * Insert the two balanced posting lines for one period + their source links. Idempotent via the
 * deterministic per-(asset,period) idempotency_key (ON CONFLICT DO NOTHING). Returns the inserted
 * posting ids (empty when a conflict no-op'd — i.e. already posted).
 */
async function insertBalancedPostingLines(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    journalEntryId: string;
    idempotencyKey: string;
    sourceTransactionType: string;
    sourceTransactionId: string;
    lines: LineToPost[];
    links: Array<{ linked_object_type: string; linked_object_id: string; relationship_role: string }>;
  }
): Promise<string[]> {
  const postingIds: string[] = [];
  let lineSequence = 1;
  for (const line of args.lines) {
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.journal_entry_postings
          (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit,
           amount_cents, description, source_transaction_type, source_transaction_id, idempotency_key,
           created_at, updated_at)
        VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10, now(), now())
        ON CONFLICT (operating_company_id, idempotency_key, line_sequence)
          WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING id::text
      `,
      [
        args.operatingCompanyId,
        args.journalEntryId,
        lineSequence,
        line.account_id,
        line.debit_or_credit,
        line.amount_cents,
        line.description,
        args.sourceTransactionType,
        args.sourceTransactionId,
        args.idempotencyKey,
      ]
    );
    const postingId = res.rows[0]?.id;
    if (postingId) {
      postingIds.push(postingId);
      for (const link of args.links) {
        await writeTransactionSourceLink(client as never, {
          operating_company_id: args.operatingCompanyId,
          journal_entry_posting_id: postingId,
          linked_object_type: link.linked_object_type,
          linked_object_id: link.linked_object_id,
          relationship_role: link.relationship_role,
        });
      }
    }
    lineSequence += 1;
  }
  return postingIds;
}

// ===========================================================================================
// PREPAID AMORTIZATION
// ===========================================================================================

type PrepaidAssetRow = {
  id: string;
  description: string;
  status: string;
  asset_account_id: string | null;
  expense_account_id: string | null;
};

type PrepaidAmortRow = { id: string; period_number: number; period_date: string; amount_cents: string };

/**
 * Post all due (period_date <= run_date), unposted prepaid amortization periods for one asset.
 * Flag-gated (OFF => no-op). Re-runnable with no double-post.
 */
export async function postPrepaidAmortization(
  input: { operatingCompanyId: string; assetId: string; runDate?: string },
  actor: Actor
): Promise<AmortizationPostingResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const flagOn = await isEnabled(client as never, AMORTIZATION_GL_POSTING_FLAG_KEY, {
      operating_company_id: input.operatingCompanyId,
      user_uuid: actor.userId,
    });
    if (!flagOn) return { result: "skipped_flag_off", asset_id: input.assetId, posted_periods: [] };

    const runDate = input.runDate ?? todayIso();

    const assetRes = await client.query<PrepaidAssetRow>(
      `
        SELECT id::text, description, status, asset_account_id::text, expense_account_id::text
        FROM accounting.prepaid_assets
        WHERE operating_company_id = $1::uuid AND id = $2::uuid AND is_active = true
        LIMIT 1
        FOR UPDATE
      `,
      [input.operatingCompanyId, input.assetId]
    );
    const asset = assetRes.rows[0];
    if (!asset) throw new AmortizationPostingError("ASSET_NOT_FOUND", `Prepaid asset ${input.assetId} not found`);
    if (asset.status === "voided") {
      throw new AmortizationPostingError("ASSET_NOT_POSTABLE", `Prepaid asset ${input.assetId} is voided`);
    }
    if (!asset.expense_account_id || !asset.asset_account_id) {
      throw new AmortizationPostingError(
        "ACCOUNT_MISSING",
        `Prepaid asset ${input.assetId} is missing expense_account_id and/or asset_account_id`,
        { asset_account_id: asset.asset_account_id, expense_account_id: asset.expense_account_id }
      );
    }

    const dueRows = await client.query<PrepaidAmortRow>(
      `
        SELECT id::text, period_number, period_date::text, amount_cents::text
        FROM accounting.prepaid_amortization_rows
        WHERE operating_company_id = $1::uuid AND asset_id = $2::uuid AND is_active = true
          AND posted = false AND period_date <= $3::date
        ORDER BY period_number ASC
        FOR UPDATE
      `,
      [input.operatingCompanyId, input.assetId, runDate]
    );

    const postedPeriods: PostedPeriod[] = [];
    for (const row of dueRows.rows) {
      const amountCents = Number(row.amount_cents);
      const idempotencyKey = buildPrepaidAmortizationIdempotencyKey(input.operatingCompanyId, input.assetId, row.period_number);

      // Drift-heal: a JE already exists for this key (row.posted got out of sync) -> link the row, skip re-post.
      let journalEntryId = await findExistingPostedJe(client, input.operatingCompanyId, idempotencyKey);
      if (!journalEntryId) {
        await assertOpenPeriod(client, input.operatingCompanyId, row.period_date);
        const lines: LineToPost[] = [
          { account_id: asset.expense_account_id, debit_or_credit: "debit", amount_cents: amountCents, description: `Prepaid amortization ${asset.description} period ${row.period_number}` },
          { account_id: asset.asset_account_id, debit_or_credit: "credit", amount_cents: amountCents, description: `Prepaid asset ${asset.description} amortized period ${row.period_number}` },
        ];
        assertBalanced(lines);
        journalEntryId = await insertJournalEntryHeader(
          client,
          input.operatingCompanyId,
          row.period_date,
          `Prepaid amortization ${asset.description} period ${row.period_number}`,
          actor.userId
        );
        await insertBalancedPostingLines(client, {
          operatingCompanyId: input.operatingCompanyId,
          journalEntryId,
          idempotencyKey,
          sourceTransactionType: "prepaid_amortization",
          sourceTransactionId: input.assetId,
          lines,
          links: [
            { linked_object_type: "prepaid_asset", linked_object_id: input.assetId, relationship_role: "prepaid_amortization" },
            { linked_object_type: "prepaid_amortization_row", linked_object_id: row.id, relationship_role: "amortization_period" },
          ],
        });
      }

      await client.query(
        `
          UPDATE accounting.prepaid_amortization_rows
          SET posted = true, posted_journal_entry_id = $3::uuid, posted_at = now(), updated_at = now(), updated_by_user_id = $4::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        `,
        [row.id, input.operatingCompanyId, journalEntryId, actor.userId]
      );

      postedPeriods.push({ period_number: row.period_number, journal_entry_id: journalEntryId, amount_cents: amountCents });
    }

    if (postedPeriods.length === 0) {
      return { result: "nothing_to_post", asset_id: input.assetId, posted_periods: [] };
    }

    // Flip header posting_status; mark fully_amortized once no active unposted rows remain.
    const remainingRes = await client.query<{ pending: string }>(
      `SELECT COUNT(*)::text AS pending FROM accounting.prepaid_amortization_rows
        WHERE operating_company_id = $1::uuid AND asset_id = $2::uuid AND is_active = true AND posted = false`,
      [input.operatingCompanyId, input.assetId]
    );
    const fullyAmortized = Number(remainingRes.rows[0]?.pending ?? 0) === 0;
    await client.query(
      `
        UPDATE accounting.prepaid_assets
        SET posting_status = 'posted',
            status = CASE WHEN $3::boolean AND status = 'active' THEN 'fully_amortized' ELSE status END,
            updated_at = now(), updated_by_user_id = $4::uuid
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
      `,
      [input.assetId, input.operatingCompanyId, fullyAmortized, actor.userId]
    );

    const totalPosted = postedPeriods.reduce((s, p) => s + p.amount_cents, 0);
    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.prepaid_amortization.posted",
      {
        resource_type: "accounting.prepaid_assets",
        resource_id: input.assetId,
        operating_company_id: input.operatingCompanyId,
        period_count: postedPeriods.length,
        total_posted_cents: totalPosted,
        run_date: runDate,
        journal_entry_ids: postedPeriods.map((p) => p.journal_entry_id),
      },
      "info",
      "FIN-21-AMORTIZATION-GL"
    );

    return {
      result: "posted",
      asset_id: input.assetId,
      posted_periods: postedPeriods,
      period_count: postedPeriods.length,
      total_posted_cents: totalPosted,
    };
  });
}

// ===========================================================================================
// FIXED-ASSET DEPRECIATION
// ===========================================================================================

type FixedAssetRow = {
  id: string;
  name: string;
  status: string;
  unit_uuid: string | null;
  purchase_price_cents: string;
  salvage_value_cents: string;
  in_service_date: string;
  method: string;
  useful_life_months: number;
  convention: string;
  prior_accumulated_depr_cents: string;
  depr_expense_account_id: string | null;
  accum_depr_account_id: string | null;
};

type DeprScheduleRow = { id: string; period_number: number; period_date: string; depreciation_amount_cents: string };

/**
 * Materialize the depreciation schedule (idempotent) then post all due, unposted, non-zero periods
 * for one fixed asset. Flag-gated (OFF => no-op). Re-runnable with no double-post.
 */
export async function postDepreciation(
  input: { operatingCompanyId: string; assetId: string; runDate?: string },
  actor: Actor
): Promise<AmortizationPostingResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const flagOn = await isEnabled(client as never, AMORTIZATION_GL_POSTING_FLAG_KEY, {
      operating_company_id: input.operatingCompanyId,
      user_uuid: actor.userId,
    });
    if (!flagOn) return { result: "skipped_flag_off", asset_id: input.assetId, posted_periods: [] };

    const runDate = input.runDate ?? todayIso();

    const assetRes = await client.query<FixedAssetRow>(
      `
        SELECT id::text, name, status, unit_uuid::text,
               purchase_price_cents::text, salvage_value_cents::text, in_service_date::text,
               method, useful_life_months, convention, prior_accumulated_depr_cents::text,
               depr_expense_account_id::text, accum_depr_account_id::text
        FROM accounting.fixed_assets
        WHERE operating_company_id = $1::uuid AND id = $2::uuid AND is_active = true
        LIMIT 1
        FOR UPDATE
      `,
      [input.operatingCompanyId, input.assetId]
    );
    const asset = assetRes.rows[0];
    if (!asset) throw new AmortizationPostingError("ASSET_NOT_FOUND", `Fixed asset ${input.assetId} not found`);
    if (asset.status === "voided" || asset.status === "disposed") {
      throw new AmortizationPostingError("ASSET_NOT_POSTABLE", `Fixed asset ${input.assetId} is ${asset.status}`);
    }
    if (!asset.depr_expense_account_id || !asset.accum_depr_account_id) {
      throw new AmortizationPostingError(
        "ACCOUNT_MISSING",
        `Fixed asset ${input.assetId} is missing depr_expense_account_id and/or accum_depr_account_id`,
        { depr_expense_account_id: asset.depr_expense_account_id, accum_depr_account_id: asset.accum_depr_account_id }
      );
    }
    // The shared schedule is display-only: it allocates the FULL depreciable base over `life` regardless
    // of prior_accumulated_depr_cents, so posting a mid-life takeover asset would double-count the prior
    // accumulated depreciation (accumulated would end at prior + base, book value would go negative).
    // Fail loud — never mis-post — until proper remaining-life continuation is designed (no new GL math).
    if (Number(asset.prior_accumulated_depr_cents) > 0) {
      throw new AmortizationPostingError(
        "PRIOR_ACCUM_UNSUPPORTED",
        `Fixed asset ${input.assetId} has prior_accumulated_depr_cents > 0; the shared depreciation schedule re-depreciates the full base and would double-count prior depreciation. Posting is refused (enter the asset with prior_accumulated_depr_cents = 0, or await mid-life continuation support).`,
        { prior_accumulated_depr_cents: Number(asset.prior_accumulated_depr_cents) }
      );
    }

    // Reuse the SHARED schedule compute (straight-line / declining-balance + half_month/mid_month).
    const compute = computeDepreciationSchedule({
      purchase_price_cents: Number(asset.purchase_price_cents),
      salvage_value_cents: Number(asset.salvage_value_cents),
      in_service_date: asset.in_service_date,
      method: asset.method,
      useful_life_months: asset.useful_life_months,
      convention: asset.convention,
      prior_accumulated_depr_cents: Number(asset.prior_accumulated_depr_cents),
    });
    if (compute.rows.length === 0) {
      return { result: "nothing_to_post", asset_id: input.assetId, posted_periods: [], note: compute.note };
    }

    // Materialize the schedule rows idempotently (never overwrite a posted row).
    for (const r of compute.rows) {
      await client.query(
        `
          INSERT INTO accounting.depreciation_schedule_rows
            (operating_company_id, asset_id, period_number, period_date, depreciation_amount_cents,
             accumulated_to_date_cents, book_value_end_cents, method_snapshot, created_by_user_id, updated_by_user_id)
          VALUES ($1::uuid, $2::uuid, $3, $4::date, $5, $6, $7, $8, $9::uuid, $9::uuid)
          ON CONFLICT (asset_id, period_number) WHERE is_active = true DO NOTHING
        `,
        [
          input.operatingCompanyId,
          input.assetId,
          r.period_number,
          r.period_date,
          r.depreciation_amount_cents,
          r.accumulated_to_date_cents,
          r.book_value_end_cents,
          r.method_snapshot,
          actor.userId,
        ]
      );
    }

    const dueRows = await client.query<DeprScheduleRow>(
      `
        SELECT id::text, period_number, period_date::text, depreciation_amount_cents::text
        FROM accounting.depreciation_schedule_rows
        WHERE operating_company_id = $1::uuid AND asset_id = $2::uuid AND is_active = true
          AND posted = false AND depreciation_amount_cents > 0 AND period_date <= $3::date
        ORDER BY period_number ASC
        FOR UPDATE
      `,
      [input.operatingCompanyId, input.assetId, runDate]
    );

    const postedPeriods: PostedPeriod[] = [];
    for (const row of dueRows.rows) {
      const amountCents = Number(row.depreciation_amount_cents);
      const idempotencyKey = buildDepreciationIdempotencyKey(input.operatingCompanyId, input.assetId, row.period_number);

      let journalEntryId = await findExistingPostedJe(client, input.operatingCompanyId, idempotencyKey);
      if (!journalEntryId) {
        await assertOpenPeriod(client, input.operatingCompanyId, row.period_date);
        const lines: LineToPost[] = [
          { account_id: asset.depr_expense_account_id, debit_or_credit: "debit", amount_cents: amountCents, description: `Depreciation expense ${asset.name} period ${row.period_number}` },
          { account_id: asset.accum_depr_account_id, debit_or_credit: "credit", amount_cents: amountCents, description: `Accumulated depreciation ${asset.name} period ${row.period_number}` },
        ];
        assertBalanced(lines);
        journalEntryId = await insertJournalEntryHeader(
          client,
          input.operatingCompanyId,
          row.period_date,
          `Depreciation ${asset.name} period ${row.period_number}`,
          actor.userId
        );
        await insertBalancedPostingLines(client, {
          operatingCompanyId: input.operatingCompanyId,
          journalEntryId,
          idempotencyKey,
          sourceTransactionType: "fixed_asset_depreciation",
          sourceTransactionId: input.assetId,
          lines,
          links: [
            { linked_object_type: "fixed_asset", linked_object_id: input.assetId, relationship_role: "fixed_asset_depreciation" },
            { linked_object_type: "depreciation_schedule_row", linked_object_id: row.id, relationship_role: "depreciation_period" },
          ],
        });
      }

      await client.query(
        `
          UPDATE accounting.depreciation_schedule_rows
          SET posted = true, posted_journal_entry_id = $3::uuid, posted_at = now(), updated_at = now(), updated_by_user_id = $4::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        `,
        [row.id, input.operatingCompanyId, journalEntryId, actor.userId]
      );

      postedPeriods.push({ period_number: row.period_number, journal_entry_id: journalEntryId, amount_cents: amountCents });
    }

    if (postedPeriods.length === 0) {
      return { result: "nothing_to_post", asset_id: input.assetId, posted_periods: [] };
    }

    // Mark fully_depreciated once no active unposted, non-zero period remains.
    const remainingRes = await client.query<{ pending: string }>(
      `SELECT COUNT(*)::text AS pending FROM accounting.depreciation_schedule_rows
        WHERE operating_company_id = $1::uuid AND asset_id = $2::uuid AND is_active = true
          AND posted = false AND depreciation_amount_cents > 0`,
      [input.operatingCompanyId, input.assetId]
    );
    if (Number(remainingRes.rows[0]?.pending ?? 0) === 0) {
      await client.query(
        `UPDATE accounting.fixed_assets
            SET status = CASE WHEN status = 'active' THEN 'fully_depreciated' ELSE status END,
                updated_at = now(), updated_by_user_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [input.assetId, input.operatingCompanyId, actor.userId]
      );
    }

    const totalPosted = postedPeriods.reduce((s, p) => s + p.amount_cents, 0);
    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.fixed_asset_depreciation.posted",
      {
        resource_type: "accounting.fixed_assets",
        resource_id: input.assetId,
        operating_company_id: input.operatingCompanyId,
        period_count: postedPeriods.length,
        total_posted_cents: totalPosted,
        run_date: runDate,
        journal_entry_ids: postedPeriods.map((p) => p.journal_entry_id),
      },
      "info",
      "FIN-21-AMORTIZATION-GL"
    );

    // Spine event — emit only when the asset is unit-linked (subject_type='unit' is allowlisted by
    // events.event_log's valid_subject_type CHECK). Prepaid + non-unit assets have no allowlisted
    // subject, so they rely on the immutable audit.audit_events row above (the void.service precedent
    // for accounting subjects). Reuses the spine emitter (union member appended additively).
    if (asset.unit_uuid) {
      await emitAccountingSpineEvent(client as never, {
        operating_company_id: input.operatingCompanyId,
        actor_user_id: actor.userId,
        event_type: "amortization.posted",
        entity_type: "unit",
        entity_id: asset.unit_uuid,
        source_table: "accounting.fixed_assets",
        payload: { asset_id: input.assetId, period_count: postedPeriods.length, total_posted_cents: totalPosted, kind: "depreciation" },
      });
    }

    return {
      result: "posted",
      asset_id: input.assetId,
      posted_periods: postedPeriods,
      period_count: postedPeriods.length,
      total_posted_cents: totalPosted,
    };
  });
}

// ===========================================================================================
// REVERSAL (reuses the shared void path — equal-and-opposite reversing JE, never DELETE)
// ===========================================================================================

type ReversalKind = "prepaid" | "depreciation";

const REVERSAL_CONFIG: Record<ReversalKind, { table: string; eventClass: string }> = {
  prepaid: { table: "accounting.prepaid_amortization_rows", eventClass: "accounting.prepaid_amortization.reversed" },
  depreciation: { table: "accounting.depreciation_schedule_rows", eventClass: "accounting.fixed_asset_depreciation.reversed" },
};

async function reverseSchedule(
  kind: ReversalKind,
  input: { operatingCompanyId: string; assetId: string; reason: string; periodNumber?: number },
  actor: Actor
): Promise<AmortizationReversalResult> {
  const cfg = REVERSAL_CONFIG[kind];
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const conds = ["operating_company_id = $1::uuid", "asset_id = $2::uuid", "is_active = true", "posted = true", "posted_journal_entry_id IS NOT NULL"];
    const params: unknown[] = [input.operatingCompanyId, input.assetId];
    if (input.periodNumber != null) {
      conds.push(`period_number = $3`);
      params.push(input.periodNumber);
    }
    const rows = await client.query<{ id: string; period_number: number; posted_journal_entry_id: string }>(
      `SELECT id::text, period_number, posted_journal_entry_id::text
         FROM ${cfg.table}
        WHERE ${conds.join(" AND ")}
        ORDER BY period_number ASC
        FOR UPDATE`,
      params
    );

    const reversed: AmortizationReversalResult["reversed_periods"] = [];
    for (const row of rows.rows) {
      const jeId = row.posted_journal_entry_id;
      const header = await client.query<{ entry_date: string; status: string }>(
        `SELECT entry_date::text, status FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
        [jeId, input.operatingCompanyId]
      );
      const je = header.rows[0];
      if (!je || je.status === "voided") continue; // already reversed — skip (no double-reverse)

      const reversal = await postVoidReversal(
        client as never,
        {
          operatingCompanyId: input.operatingCompanyId,
          entityType: "journal_entry",
          entityId: jeId,
          originalDate: je.entry_date,
          memo: `Void reversal of ${kind} posting (asset ${input.assetId} period ${row.period_number}): ${input.reason}`,
        },
        { userId: actor.userId }
      );

      await client.query(
        `UPDATE accounting.journal_entries
            SET status = 'voided', voided_at = now(), voided_by_user_id = $3::uuid, void_reason = $4, qbo_sync_pending = true, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [jeId, input.operatingCompanyId, actor.userId, input.reason]
      );

      await client.query(
        `UPDATE ${cfg.table}
            SET posted = false, posted_journal_entry_id = NULL, posted_at = NULL, updated_at = now(), updated_by_user_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [row.id, input.operatingCompanyId, actor.userId]
      );

      reversed.push({ period_number: row.period_number, journal_entry_id: jeId, reversal_journal_entry_id: reversal.reversal_journal_entry_id });
    }

    if (reversed.length === 0) {
      return { result: "nothing_to_reverse", asset_id: input.assetId, reversed_periods: [] };
    }

    await appendCrudAudit(
      client as never,
      actor.userId,
      cfg.eventClass,
      {
        resource_type: kind === "prepaid" ? "accounting.prepaid_assets" : "accounting.fixed_assets",
        resource_id: input.assetId,
        operating_company_id: input.operatingCompanyId,
        void_reason: input.reason,
        reversed_period_count: reversed.length,
        reversed_periods: reversed,
      },
      "warning",
      "FIN-21-AMORTIZATION-GL"
    );

    return { result: "reversed", asset_id: input.assetId, reversed_periods: reversed };
  });
}

export function reversePrepaidAmortization(
  input: { operatingCompanyId: string; assetId: string; reason: string; periodNumber?: number },
  actor: Actor
): Promise<AmortizationReversalResult> {
  return reverseSchedule("prepaid", input, actor);
}

export function reverseDepreciation(
  input: { operatingCompanyId: string; assetId: string; reason: string; periodNumber?: number },
  actor: Actor
): Promise<AmortizationReversalResult> {
  return reverseSchedule("depreciation", input, actor);
}
