// FIN-22 — Lease ASC 842 LESSOR GL posting engine (TIER-1 FINANCIAL; BUILD-AND-HOLD, flag OFF).
//
// OWNER-LOCKED (Jorge): DEFAULT election = OPERATING (Option A).
//   OPERATING (default): Trucking (TRK) KEEPS the unit on its books and depreciates it (FIN-21, NOT here).
//     * periodic RENTAL INCOME:  Dr AR  /  Cr rental_income          (one balanced JE per schedule period)
//     * end-of-term SALE (via accounting.fixed_asset_disposals):
//         Dr Accumulated Depreciation,  Dr Cash/proceeds,  Cr Asset cost,  Dr/Cr Gain-Loss on disposal.
//     ►► NO derecognition of the asset at COMMENCEMENT (the asset stays a TRK fixed_assets row). ◄◄
//   SALES-TYPE (per-deal, CPA election — NOT default):
//     * at COMMENCEMENT (one JE): derecognize the asset (Dr Accum, Cr Asset cost) + Dr Lease Receivable
//       + selling profit/loss (Cr rental_income / Dr gain_loss_on_disposal).
//     * each period: Dr Cash payment / Cr Lease Receivable principal / Cr interest_income interest.
//
// Re-title guard (owner-locked): a Trucking-seller lease requires the leased unit titled to IH 35 Trucking
//   FIRST (mdata.units.owner_company_id = TRK). BLOCK posting (RETITLE_REQUIRED) until re-titled.
//
// Reuses the established posting spine: assertBalanced + the JE header/line inserts (inline, mirroring the
// merged FIN-18 settlement poster — NOT postSourceTransaction, whose source-type union is closed) +
// transaction_source_links per line + ensureOpenPeriod (reused from posting-engine.service). Account roles
// resolve via resolveRoleAccountOptional (per-opco accounting.chart_of_accounts_roles); a missing role
// THROWS — never hardcoded. Idempotent per (lease_contract|asset, period) via uq_jep_company_idempotency_line.
//
// FLAG GATE: LEASE_GL_POSTING_ENABLED (default OFF) -> NO-OP, zero JEs / financial rows.

import { withCurrentUser } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { resolveRoleAccountOptional } from "../coa-roles/resolver.service.js";
import { ensureOpenPeriod } from "../posting-engine.service.js";
import { emitAccountingSpineEvent, writeTransactionSourceLink } from "../accounting-spine-emit.js";
import {
  LEASE_GL_POSTING_FLAG_KEY,
  LeasePostingError,
  assertBalanced,
  buildLeaseIdempotencyKey,
  salesTypeReceivableCents,
  type SchedulePeriod,
} from "./lease.math.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};
type Actor = { userId: string };

type SpineLink = { type: string; id: string; role: string };
type PostingLine = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
  links: SpineLink[];
};

export type LeasePostResult =
  | { result: "skipped_flag_off"; journal_entry_id: null; lease_contract_id: string }
  | { result: "already_posted"; journal_entry_id: string; lease_contract_id: string }
  | {
      result: "posted";
      journal_entry_id: string;
      lease_contract_id: string;
      idempotency_key: string;
      debit_total_cents: number;
      credit_total_cents: number;
    };

type LeaseRow = {
  id: string;
  election: "operating" | "sales_type";
  status: string;
  display_id: string | null;
  commencement_date: string;
  end_date: string;
  payment_amount_cents: string;
  number_of_periods: number;
};

type LeaseAssetRow = {
  fixed_asset_id: string;
  unit_uuid: string | null;
  owner_company_id: string | null;
  cost_cents: string;
  accumulated_depr_cents: string;
  asset_account_id: string | null;
  accum_depr_account_id: string | null;
};

const POSTABLE_STATUSES = new Set(["draft", "active"]);

async function flagOn(client: DbClient, operatingCompanyId: string, userId: string): Promise<boolean> {
  return isEnabled(client as never, LEASE_GL_POSTING_FLAG_KEY, {
    operating_company_id: operatingCompanyId,
    user_uuid: userId,
  });
}

async function loadLease(client: DbClient, operatingCompanyId: string, leaseContractId: string): Promise<LeaseRow> {
  const res = await client.query<LeaseRow>(
    `SELECT id::text, election, status, display_id, commencement_date::text, end_date::text,
            payment_amount_cents::text, number_of_periods
       FROM accounting.lease_contract
      WHERE operating_company_id = $1::uuid AND id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [operatingCompanyId, leaseContractId]
  );
  const row = res.rows[0];
  if (!row) throw new LeasePostingError("LEASE_NOT_FOUND", `Lease contract ${leaseContractId} not found`);
  if (!POSTABLE_STATUSES.has(row.status)) {
    throw new LeasePostingError("LEASE_NOT_POSTABLE", `Lease ${row.display_id ?? row.id} is not postable (status=${row.status})`);
  }
  return row;
}

/**
 * Load the lease's asset lines joined to accounting.fixed_assets + mdata.units. Resolves the unit
 * (lease_asset_line.unit_uuid || fixed_assets.unit_uuid), its title owner, the asset cost, accumulated
 * depreciation (prior + posted schedule rows), and the asset's GL accounts. Used by the re-title guard,
 * the disposal/derecognition math, and the spine subject.
 */
async function loadLeaseAssets(client: DbClient, operatingCompanyId: string, leaseContractId: string): Promise<LeaseAssetRow[]> {
  const res = await client.query<LeaseAssetRow>(
    `SELECT
        fa.id::text                                   AS fixed_asset_id,
        COALESCE(lal.unit_uuid, fa.unit_uuid)::text   AS unit_uuid,
        u.owner_company_id::text                       AS owner_company_id,
        fa.purchase_price_cents::text                  AS cost_cents,
        (fa.prior_accumulated_depr_cents + COALESCE((
            SELECT SUM(d.depreciation_amount_cents)
              FROM accounting.depreciation_schedule_rows d
             WHERE d.asset_id = fa.id AND d.posted = true AND d.is_active = true
        ), 0))::text                                   AS accumulated_depr_cents,
        fa.asset_account_id::text                      AS asset_account_id,
        fa.accum_depr_account_id::text                 AS accum_depr_account_id
       FROM accounting.lease_asset_line lal
       JOIN accounting.fixed_assets fa ON fa.id = lal.fixed_asset_id
       LEFT JOIN mdata.units u ON u.id = COALESCE(lal.unit_uuid, fa.unit_uuid)
      WHERE lal.operating_company_id = $1::uuid
        AND lal.lease_contract_id = $2::uuid
        AND lal.is_active = true
      ORDER BY lal.created_at ASC, fa.id ASC`,
    [operatingCompanyId, leaseContractId]
  );
  return res.rows;
}

/**
 * Re-title guard (owner-locked): every leased unit MUST be titled to IH 35 Trucking (TRK) before a
 * Trucking-seller lease can post. Resolves TRK BY CODE (never hardcode). BLOCK (RETITLE_REQUIRED) if any
 * asset's unit is not owned by TRK. Returns the first resolved unit uuid (the spine subject).
 */
async function assertRetitledToTrk(
  client: DbClient,
  assets: LeaseAssetRow[]
): Promise<{ subjectUnitId: string | null }> {
  if (assets.length === 0) throw new LeasePostingError("NO_LEASE_ASSETS", "Lease has no active asset lines");
  const trkRes = await client.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'TRK' LIMIT 1`);
  const trkId = trkRes.rows[0]?.id ?? null;
  if (!trkId) throw new LeasePostingError("RETITLE_REQUIRED", "Trucking (TRK) operating company is not configured");
  for (const a of assets) {
    if (!a.owner_company_id || a.owner_company_id.toLowerCase() !== trkId.toLowerCase()) {
      throw new LeasePostingError(
        "RETITLE_REQUIRED",
        `Unit for fixed asset ${a.fixed_asset_id} is not titled to IH 35 Trucking — re-title (owner_company_id=TRK) before signing/posting`,
        { fixed_asset_id: a.fixed_asset_id, unit_uuid: a.unit_uuid, owner_company_id: a.owner_company_id, trk_id: trkId }
      );
    }
  }
  return { subjectUnitId: assets.find((a) => a.unit_uuid)?.unit_uuid ?? null };
}

async function findExistingPostedJe(client: DbClient, operatingCompanyId: string, idempotencyKey: string): Promise<string | null> {
  const res = await client.query<{ journal_entry_uuid: string }>(
    `SELECT journal_entry_uuid::text FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid AND idempotency_key = $2
      ORDER BY line_sequence ASC LIMIT 1`,
    [operatingCompanyId, idempotencyKey]
  );
  return res.rows[0]?.journal_entry_uuid ?? null;
}

async function resolveRole(client: DbClient, operatingCompanyId: string, role: Parameters<typeof resolveRoleAccountOptional>[2]): Promise<string> {
  const id = await resolveRoleAccountOptional(client, operatingCompanyId, role);
  if (!id) {
    throw new LeasePostingError("ACCOUNT_ROLE_MAPPING_MISSING", `No active chart_of_accounts role mapping for '${role}'`, { role });
  }
  return id;
}

/** Cash/receivable account for sale proceeds + lease payments (undeposited funds -> cash clearing -> AR). */
async function resolveCashLike(client: DbClient, operatingCompanyId: string): Promise<string> {
  const id =
    (await resolveRoleAccountOptional(client, operatingCompanyId, "undeposited_funds")) ??
    (await resolveRoleAccountOptional(client, operatingCompanyId, "cash_clearing")) ??
    (await resolveRoleAccountOptional(client, operatingCompanyId, "ar_control"));
  if (!id) throw new LeasePostingError("ACCOUNT_ROLE_MAPPING_MISSING", "No cash-like account (undeposited_funds/cash_clearing/ar_control) is mapped");
  return id;
}

/**
 * Insert ONE balanced journal entry (header + lines) through the spine, inline (mirrors FIN-18). Writes a
 * transaction_source_links row per line (lease_contract source + any extra per-line links). Idempotent via
 * uq_jep_company_idempotency_line. The journal_entry balanced trigger is the DB backstop; assertBalanced
 * is the app gate. Returns the JE id + totals.
 */
async function postLeaseJournalEntry(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    leaseContractId: string;
    entryDate: string;
    memo: string;
    idempotencyKey: string;
    sourceType: "lease_rental" | "lease_disposal";
    lines: PostingLine[];
    actorUserId: string;
  }
): Promise<{ journalEntryId: string; debitTotal: number; creditTotal: number }> {
  assertBalanced(input.lines);
  await ensureOpenPeriod(client as never, input.operatingCompanyId, input.entryDate);

  const headerRes = await client.query<{ id: string }>(
    `INSERT INTO accounting.journal_entries
       (operating_company_id, entry_date, memo, status, source, created_by_user_id, qbo_sync_pending, created_at, updated_at)
     VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true, now(), now())
     RETURNING id::text`,
    [input.operatingCompanyId, input.entryDate, input.memo, input.actorUserId]
  );
  const journalEntryId = headerRes.rows[0]?.id;
  if (!journalEntryId) throw new Error("lease_journal_entry_insert_failed");

  let lineSequence = 1;
  for (const line of input.lines) {
    const insRes = await client.query<{ id: string }>(
      `INSERT INTO accounting.journal_entry_postings
         (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit,
          amount_cents, description, source_transaction_type, source_transaction_id, idempotency_key,
          created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10, now(), now())
       ON CONFLICT (operating_company_id, idempotency_key, line_sequence)
         WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING id::text`,
      [
        input.operatingCompanyId,
        journalEntryId,
        lineSequence,
        line.account_id,
        line.debit_or_credit,
        line.amount_cents,
        line.description,
        input.sourceType,
        input.leaseContractId,
        input.idempotencyKey,
      ]
    );
    const postingId = insRes.rows[0]?.id;
    if (postingId) {
      // Source link: lease_contract -> this posting line (always), plus any line-specific links.
      await writeTransactionSourceLink(client as never, {
        operating_company_id: input.operatingCompanyId,
        journal_entry_posting_id: postingId,
        linked_object_type: "lease_contract",
        linked_object_id: input.leaseContractId,
        relationship_role: "lease_source",
      });
      for (const link of line.links) {
        await writeTransactionSourceLink(client as never, {
          operating_company_id: input.operatingCompanyId,
          journal_entry_posting_id: postingId,
          linked_object_type: link.type,
          linked_object_id: link.id,
          relationship_role: link.role,
        });
      }
    }
    lineSequence += 1;
  }

  const debitTotal = input.lines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + l.amount_cents, 0);
  const creditTotal = input.lines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + l.amount_cents, 0);
  return { journalEntryId, debitTotal, creditTotal };
}

async function emitLeasePosted(
  client: DbClient,
  input: { operatingCompanyId: string; actorUserId: string; subjectUnitId: string | null; leaseContractId: string; journalEntryId: string; kind: string; auditPayload: Record<string, unknown> }
) {
  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "accounting.lease.posted",
    {
      resource_type: "accounting.lease_contract",
      resource_id: input.leaseContractId,
      operating_company_id: input.operatingCompanyId,
      journal_entry_id: input.journalEntryId,
      posting_kind: input.kind,
      ...input.auditPayload,
    },
    "info",
    "FIN-22-LEASE-GL"
  );
  // Spine event — subject_type='unit' is within the events.event_log allowlist (the lease is about a unit).
  if (input.subjectUnitId) {
    await emitAccountingSpineEvent(client as never, {
      operating_company_id: input.operatingCompanyId,
      actor_user_id: input.actorUserId,
      event_type: "lease.posted",
      entity_type: "unit",
      entity_id: input.subjectUnitId,
      source_table: "accounting.lease_contract",
      payload: { lease_contract_id: input.leaseContractId, journal_entry_id: input.journalEntryId, posting_kind: input.kind },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// OPERATING — periodic RENTAL INCOME. Dr AR / Cr rental_income. NO asset derecognition.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function postOperatingRentalPeriod(
  input: { operatingCompanyId: string; leaseContractId: string; periodNumber: number },
  actor: Actor
): Promise<LeasePostResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    if (!(await flagOn(client, input.operatingCompanyId, actor.userId))) {
      return { result: "skipped_flag_off", journal_entry_id: null, lease_contract_id: input.leaseContractId };
    }

    const idempotencyKey = buildLeaseIdempotencyKey(input.operatingCompanyId, input.leaseContractId, "rental", input.periodNumber);
    const existing = await findExistingPostedJe(client, input.operatingCompanyId, idempotencyKey);
    if (existing) return { result: "already_posted", journal_entry_id: existing, lease_contract_id: input.leaseContractId };

    const lease = await loadLease(client, input.operatingCompanyId, input.leaseContractId);
    if (lease.election !== "operating") {
      throw new LeasePostingError("LEASE_NOT_OPERATING", `Lease ${lease.display_id ?? lease.id} is sales-type, not operating`);
    }
    const assets = await loadLeaseAssets(client, input.operatingCompanyId, input.leaseContractId);
    const { subjectUnitId } = await assertRetitledToTrk(client, assets);

    const periodRes = await client.query<{ id: string; period_date: string; rental_income_cents: string; posted: boolean }>(
      `SELECT id::text, period_date::text, rental_income_cents::text, posted
         FROM accounting.lease_schedule_period
        WHERE operating_company_id = $1::uuid AND lease_contract_id = $2::uuid AND period_number = $3 AND is_active = true
        LIMIT 1 FOR UPDATE`,
      [input.operatingCompanyId, input.leaseContractId, input.periodNumber]
    );
    const period = periodRes.rows[0];
    if (!period) throw new LeasePostingError("SCHEDULE_PERIOD_NOT_FOUND", `Operating period ${input.periodNumber} not found`);

    const amount = Number(period.rental_income_cents);
    const arAccount = await resolveCashLike(client, input.operatingCompanyId);
    const rentalIncomeAccount = await resolveRole(client, input.operatingCompanyId, "rental_income");

    const label = `Lease ${lease.display_id ?? lease.id} rental period ${input.periodNumber}`;
    const lines: PostingLine[] = [
      { account_id: arAccount, debit_or_credit: "debit", amount_cents: amount, description: `${label} AR`, links: [{ type: "lease_schedule_period", id: period.id, role: "lease_period" }] },
      { account_id: rentalIncomeAccount, debit_or_credit: "credit", amount_cents: amount, description: `${label} rental income`, links: [{ type: "lease_schedule_period", id: period.id, role: "lease_period" }] },
    ];

    const posted = await postLeaseJournalEntry(client, {
      operatingCompanyId: input.operatingCompanyId,
      leaseContractId: input.leaseContractId,
      entryDate: period.period_date,
      memo: `${label} posting`,
      idempotencyKey,
      sourceType: "lease_rental",
      lines,
      actorUserId: actor.userId,
    });

    await client.query(
      `UPDATE accounting.lease_schedule_period
          SET posted = true, posted_journal_entry_id = $3::uuid, posted_at = now(), updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [period.id, input.operatingCompanyId, posted.journalEntryId]
    );

    await emitLeasePosted(client, {
      operatingCompanyId: input.operatingCompanyId,
      actorUserId: actor.userId,
      subjectUnitId,
      leaseContractId: input.leaseContractId,
      journalEntryId: posted.journalEntryId,
      kind: "operating_rental",
      auditPayload: { period_number: input.periodNumber, rental_income_cents: amount },
    });

    return {
      result: "posted",
      journal_entry_id: posted.journalEntryId,
      lease_contract_id: input.leaseContractId,
      idempotency_key: idempotencyKey,
      debit_total_cents: posted.debitTotal,
      credit_total_cents: posted.creditTotal,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// OPERATING — end-of-term SALE (one asset; reuses accounting.fixed_asset_disposals).
//   Dr Accum Depr, Dr Cash/proceeds, Cr Asset cost, Dr/Cr Gain-Loss on disposal.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function postOperatingEndOfTermSale(
  input: { operatingCompanyId: string; leaseContractId: string; disposalDate: string; proceedsCents: number },
  actor: Actor
): Promise<LeasePostResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    if (!(await flagOn(client, input.operatingCompanyId, actor.userId))) {
      return { result: "skipped_flag_off", journal_entry_id: null, lease_contract_id: input.leaseContractId };
    }

    // Idempotency BEFORE loadLease: a posted sale flips the lease to 'ended' (no longer postable), so the
    // re-run must short-circuit here rather than trip the postable gate.
    const idempotencyKey = buildLeaseIdempotencyKey(input.operatingCompanyId, input.leaseContractId, "disposal", null);
    const existing = await findExistingPostedJe(client, input.operatingCompanyId, idempotencyKey);
    if (existing) return { result: "already_posted", journal_entry_id: existing, lease_contract_id: input.leaseContractId };

    const lease = await loadLease(client, input.operatingCompanyId, input.leaseContractId);
    if (lease.election !== "operating") {
      throw new LeasePostingError("LEASE_NOT_OPERATING", `Lease ${lease.display_id ?? lease.id} is sales-type, not operating`);
    }
    const assets = await loadLeaseAssets(client, input.operatingCompanyId, input.leaseContractId);
    const { subjectUnitId } = await assertRetitledToTrk(client, assets);
    if (assets.length !== 1) {
      throw new LeasePostingError("NO_LEASE_ASSETS", `End-of-term sale supports a single leased asset (found ${assets.length})`);
    }
    const asset = assets[0]!;

    // Idempotent at the disposal grain too (uq_fixed_asset_disposal_active per asset WHERE is_active).
    const dupDisposal = await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.fixed_asset_disposals
        WHERE operating_company_id = $1::uuid AND asset_id = $2::uuid AND is_active = true LIMIT 1`,
      [input.operatingCompanyId, asset.fixed_asset_id]
    );
    if (dupDisposal.rows[0]) {
      const je = await findExistingPostedJe(client, input.operatingCompanyId, idempotencyKey);
      if (je) return { result: "already_posted", journal_entry_id: je, lease_contract_id: input.leaseContractId };
      throw new LeasePostingError("DISPOSAL_ALREADY_EXISTS", `Asset ${asset.fixed_asset_id} already has an active disposal`);
    }

    if (!asset.asset_account_id || !asset.accum_depr_account_id) {
      throw new LeasePostingError("ASSET_ACCOUNT_MISSING", `Asset ${asset.fixed_asset_id} is missing asset_account_id / accum_depr_account_id`);
    }
    const cost = Number(asset.cost_cents);
    const accumDepr = Math.min(Number(asset.accumulated_depr_cents), cost);
    const bookValue = cost - accumDepr;
    const proceeds = Math.max(0, Math.round(input.proceedsCents));
    const gainLoss = proceeds - bookValue; // >0 gain, <0 loss
    const proceedsAccount = proceeds > 0 ? await resolveCashLike(client, input.operatingCompanyId) : null;
    const gainLossAccount = gainLoss !== 0 ? await resolveRole(client, input.operatingCompanyId, "gain_loss_on_disposal") : null;

    const label = `Lease ${lease.display_id ?? lease.id} end-of-term sale (asset ${asset.fixed_asset_id})`;
    const lines: PostingLine[] = [];
    if (accumDepr > 0) {
      lines.push({ account_id: asset.accum_depr_account_id, debit_or_credit: "debit", amount_cents: accumDepr, description: `${label} accum depr`, links: [{ type: "fixed_asset", id: asset.fixed_asset_id, role: "lease_disposal_asset" }] });
    }
    if (proceeds > 0 && proceedsAccount) {
      lines.push({ account_id: proceedsAccount, debit_or_credit: "debit", amount_cents: proceeds, description: `${label} proceeds`, links: [] });
    }
    lines.push({ account_id: asset.asset_account_id, debit_or_credit: "credit", amount_cents: cost, description: `${label} asset cost`, links: [{ type: "fixed_asset", id: asset.fixed_asset_id, role: "lease_disposal_asset" }] });
    if (gainLoss > 0 && gainLossAccount) {
      lines.push({ account_id: gainLossAccount, debit_or_credit: "credit", amount_cents: gainLoss, description: `${label} gain on disposal`, links: [] });
    } else if (gainLoss < 0 && gainLossAccount) {
      lines.push({ account_id: gainLossAccount, debit_or_credit: "debit", amount_cents: -gainLoss, description: `${label} loss on disposal`, links: [] });
    }

    const posted = await postLeaseJournalEntry(client, {
      operatingCompanyId: input.operatingCompanyId,
      leaseContractId: input.leaseContractId,
      entryDate: input.disposalDate,
      memo: `${label} posting`,
      idempotencyKey,
      sourceType: "lease_disposal",
      lines,
      actorUserId: actor.userId,
    });

    // Record the disposal (reuse accounting.fixed_asset_disposals) + link it, then mark the asset disposed.
    const disposalRes = await client.query<{ id: string }>(
      `INSERT INTO accounting.fixed_asset_disposals
         (operating_company_id, asset_id, disposal_date, disposal_type, proceeds_cents,
          book_value_at_disposal_cents, gain_loss_cents, gain_loss_account_id, disposal_je_id,
          posting_status, posted_at, lease_contract_id, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::date, 'sale', $4, $5, $6, $7, $8::uuid, 'posted', now(), $9::uuid, $10::uuid)
       RETURNING id::text`,
      [
        input.operatingCompanyId,
        asset.fixed_asset_id,
        input.disposalDate,
        proceeds,
        bookValue,
        gainLoss,
        gainLossAccount,
        posted.journalEntryId,
        input.leaseContractId,
        actor.userId,
      ]
    );
    const disposalId = disposalRes.rows[0]?.id;
    await client.query(
      `UPDATE accounting.fixed_assets SET status = 'disposed', updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [asset.fixed_asset_id, input.operatingCompanyId]
    );
    await client.query(
      `UPDATE accounting.lease_contract SET status = 'ended', updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [input.leaseContractId, input.operatingCompanyId]
    );

    await emitLeasePosted(client, {
      operatingCompanyId: input.operatingCompanyId,
      actorUserId: actor.userId,
      subjectUnitId,
      leaseContractId: input.leaseContractId,
      journalEntryId: posted.journalEntryId,
      kind: "operating_end_of_term_sale",
      auditPayload: { fixed_asset_id: asset.fixed_asset_id, disposal_id: disposalId, proceeds_cents: proceeds, book_value_cents: bookValue, gain_loss_cents: gainLoss },
    });

    return {
      result: "posted",
      journal_entry_id: posted.journalEntryId,
      lease_contract_id: input.leaseContractId,
      idempotency_key: idempotencyKey,
      debit_total_cents: posted.debitTotal,
      credit_total_cents: posted.creditTotal,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// SALES-TYPE — COMMENCEMENT (one JE): derecognize asset(s) + recognize lease receivable + selling P/L.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function postSalesTypeCommencement(
  input: { operatingCompanyId: string; leaseContractId: string },
  actor: Actor
): Promise<LeasePostResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    if (!(await flagOn(client, input.operatingCompanyId, actor.userId))) {
      return { result: "skipped_flag_off", journal_entry_id: null, lease_contract_id: input.leaseContractId };
    }

    const idempotencyKey = buildLeaseIdempotencyKey(input.operatingCompanyId, input.leaseContractId, "commencement", null);
    const existing = await findExistingPostedJe(client, input.operatingCompanyId, idempotencyKey);
    if (existing) return { result: "already_posted", journal_entry_id: existing, lease_contract_id: input.leaseContractId };

    const lease = await loadLease(client, input.operatingCompanyId, input.leaseContractId);
    if (lease.election !== "sales_type") {
      throw new LeasePostingError("LEASE_NOT_SALES_TYPE", `Lease ${lease.display_id ?? lease.id} is operating, not sales-type`);
    }
    const assets = await loadLeaseAssets(client, input.operatingCompanyId, input.leaseContractId);
    const { subjectUnitId } = await assertRetitledToTrk(client, assets);

    const schedule = await loadSchedule(client, input.operatingCompanyId, input.leaseContractId);
    const receivable = salesTypeReceivableCents(schedule);

    const leaseReceivableAccount = await resolveRole(client, input.operatingCompanyId, "lease_receivable");
    const rentalIncomeAccount = await resolveRole(client, input.operatingCompanyId, "rental_income"); // selling profit (lease revenue)

    let totalCost = 0;
    let totalAccum = 0;
    const lines: PostingLine[] = [];
    lines.push({ account_id: leaseReceivableAccount, debit_or_credit: "debit", amount_cents: receivable, description: `Lease ${lease.display_id ?? lease.id} receivable`, links: [] });
    for (const a of assets) {
      if (!a.asset_account_id || !a.accum_depr_account_id) {
        throw new LeasePostingError("ASSET_ACCOUNT_MISSING", `Asset ${a.fixed_asset_id} is missing asset_account_id / accum_depr_account_id`);
      }
      const cost = Number(a.cost_cents);
      const accum = Math.min(Number(a.accumulated_depr_cents), cost);
      totalCost += cost;
      totalAccum += accum;
      if (accum > 0) {
        lines.push({ account_id: a.accum_depr_account_id, debit_or_credit: "debit", amount_cents: accum, description: `Derecognize accum depr (asset ${a.fixed_asset_id})`, links: [{ type: "fixed_asset", id: a.fixed_asset_id, role: "lease_derecognition_asset" }] });
      }
      lines.push({ account_id: a.asset_account_id, debit_or_credit: "credit", amount_cents: cost, description: `Derecognize asset cost (asset ${a.fixed_asset_id})`, links: [{ type: "fixed_asset", id: a.fixed_asset_id, role: "lease_derecognition_asset" }] });
    }
    const bookValue = totalCost - totalAccum;
    const sellingProfit = receivable - bookValue; // >0 profit, <0 loss
    if (sellingProfit > 0) {
      lines.push({ account_id: rentalIncomeAccount, debit_or_credit: "credit", amount_cents: sellingProfit, description: `Lease ${lease.display_id ?? lease.id} selling profit`, links: [] });
    } else if (sellingProfit < 0) {
      const gainLossAccount = await resolveRole(client, input.operatingCompanyId, "gain_loss_on_disposal");
      lines.push({ account_id: gainLossAccount, debit_or_credit: "debit", amount_cents: -sellingProfit, description: `Lease ${lease.display_id ?? lease.id} selling loss`, links: [] });
    }

    const posted = await postLeaseJournalEntry(client, {
      operatingCompanyId: input.operatingCompanyId,
      leaseContractId: input.leaseContractId,
      entryDate: lease.commencement_date,
      memo: `Lease ${lease.display_id ?? lease.id} sales-type commencement posting`,
      idempotencyKey,
      sourceType: "lease_disposal",
      lines,
      actorUserId: actor.userId,
    });

    // Derecognize the asset(s) from the lessor's books + activate the lease.
    for (const a of assets) {
      await client.query(
        `UPDATE accounting.fixed_assets SET status = 'disposed', updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [a.fixed_asset_id, input.operatingCompanyId]
      );
    }
    await client.query(
      `UPDATE accounting.lease_contract SET status = 'active', commencement_je_id = $3::uuid, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [input.leaseContractId, input.operatingCompanyId, posted.journalEntryId]
    );

    await emitLeasePosted(client, {
      operatingCompanyId: input.operatingCompanyId,
      actorUserId: actor.userId,
      subjectUnitId,
      leaseContractId: input.leaseContractId,
      journalEntryId: posted.journalEntryId,
      kind: "sales_type_commencement",
      auditPayload: { receivable_cents: receivable, book_value_cents: bookValue, selling_profit_cents: sellingProfit },
    });

    return {
      result: "posted",
      journal_entry_id: posted.journalEntryId,
      lease_contract_id: input.leaseContractId,
      idempotency_key: idempotencyKey,
      debit_total_cents: posted.debitTotal,
      credit_total_cents: posted.creditTotal,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// SALES-TYPE — per-period interest/principal: Dr Cash / Cr Lease Receivable principal / Cr interest_income.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function postSalesTypeInterestPeriod(
  input: { operatingCompanyId: string; leaseContractId: string; periodNumber: number },
  actor: Actor
): Promise<LeasePostResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    if (!(await flagOn(client, input.operatingCompanyId, actor.userId))) {
      return { result: "skipped_flag_off", journal_entry_id: null, lease_contract_id: input.leaseContractId };
    }

    const idempotencyKey = buildLeaseIdempotencyKey(input.operatingCompanyId, input.leaseContractId, "interest", input.periodNumber);
    const existing = await findExistingPostedJe(client, input.operatingCompanyId, idempotencyKey);
    if (existing) return { result: "already_posted", journal_entry_id: existing, lease_contract_id: input.leaseContractId };

    const lease = await loadLease(client, input.operatingCompanyId, input.leaseContractId);
    if (lease.election !== "sales_type") {
      throw new LeasePostingError("LEASE_NOT_SALES_TYPE", `Lease ${lease.display_id ?? lease.id} is operating, not sales-type`);
    }
    const assets = await loadLeaseAssets(client, input.operatingCompanyId, input.leaseContractId);
    const { subjectUnitId } = await assertRetitledToTrk(client, assets);

    const periodRes = await client.query<{ id: string; period_date: string; payment_cents: string; interest_cents: string; principal_cents: string }>(
      `SELECT id::text, period_date::text, payment_cents::text, interest_cents::text, principal_cents::text
         FROM accounting.lease_schedule_period
        WHERE operating_company_id = $1::uuid AND lease_contract_id = $2::uuid AND period_number = $3 AND is_active = true
        LIMIT 1 FOR UPDATE`,
      [input.operatingCompanyId, input.leaseContractId, input.periodNumber]
    );
    const period = periodRes.rows[0];
    if (!period) throw new LeasePostingError("SCHEDULE_PERIOD_NOT_FOUND", `Sales-type period ${input.periodNumber} not found`);

    const payment = Number(period.payment_cents);
    const interest = Number(period.interest_cents);
    const principal = Number(period.principal_cents);
    const cashAccount = await resolveCashLike(client, input.operatingCompanyId);
    const leaseReceivableAccount = await resolveRole(client, input.operatingCompanyId, "lease_receivable");
    const interestIncomeAccount = interest > 0 ? await resolveRole(client, input.operatingCompanyId, "interest_income") : null;

    const label = `Lease ${lease.display_id ?? lease.id} sales-type period ${input.periodNumber}`;
    const lines: PostingLine[] = [
      { account_id: cashAccount, debit_or_credit: "debit", amount_cents: payment, description: `${label} payment`, links: [{ type: "lease_schedule_period", id: period.id, role: "lease_period" }] },
    ];
    if (principal > 0) {
      lines.push({ account_id: leaseReceivableAccount, debit_or_credit: "credit", amount_cents: principal, description: `${label} principal`, links: [{ type: "lease_schedule_period", id: period.id, role: "lease_period" }] });
    }
    if (interest > 0 && interestIncomeAccount) {
      lines.push({ account_id: interestIncomeAccount, debit_or_credit: "credit", amount_cents: interest, description: `${label} interest income`, links: [{ type: "lease_schedule_period", id: period.id, role: "lease_period" }] });
    }

    const posted = await postLeaseJournalEntry(client, {
      operatingCompanyId: input.operatingCompanyId,
      leaseContractId: input.leaseContractId,
      entryDate: period.period_date,
      memo: `${label} posting`,
      idempotencyKey,
      sourceType: "lease_rental",
      lines,
      actorUserId: actor.userId,
    });

    await client.query(
      `UPDATE accounting.lease_schedule_period
          SET posted = true, posted_journal_entry_id = $3::uuid, posted_at = now(), updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [period.id, input.operatingCompanyId, posted.journalEntryId]
    );

    await emitLeasePosted(client, {
      operatingCompanyId: input.operatingCompanyId,
      actorUserId: actor.userId,
      subjectUnitId,
      leaseContractId: input.leaseContractId,
      journalEntryId: posted.journalEntryId,
      kind: "sales_type_interest",
      auditPayload: { period_number: input.periodNumber, payment_cents: payment, interest_cents: interest, principal_cents: principal },
    });

    return {
      result: "posted",
      journal_entry_id: posted.journalEntryId,
      lease_contract_id: input.leaseContractId,
      idempotency_key: idempotencyKey,
      debit_total_cents: posted.debitTotal,
      credit_total_cents: posted.creditTotal,
    };
  });
}

async function loadSchedule(client: DbClient, operatingCompanyId: string, leaseContractId: string): Promise<SchedulePeriod[]> {
  const res = await client.query<{ period_number: number; period_date: string; payment_cents: string; rental_income_cents: string; interest_cents: string; principal_cents: string; receivable_balance_cents: string }>(
    `SELECT period_number, period_date::text, payment_cents::text, rental_income_cents::text,
            interest_cents::text, principal_cents::text, receivable_balance_cents::text
       FROM accounting.lease_schedule_period
      WHERE operating_company_id = $1::uuid AND lease_contract_id = $2::uuid AND is_active = true
      ORDER BY period_number ASC`,
    [operatingCompanyId, leaseContractId]
  );
  return res.rows.map((r) => ({
    period_number: r.period_number,
    period_date: r.period_date,
    payment_cents: Number(r.payment_cents),
    rental_income_cents: Number(r.rental_income_cents),
    interest_cents: Number(r.interest_cents),
    principal_cents: Number(r.principal_cents),
    receivable_balance_cents: Number(r.receivable_balance_cents),
  }));
}
