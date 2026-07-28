// FLT-05 — owned fixed-asset disposal, BUILD-AND-HOLD.
// Reuses the established createJournalEntryOnClient spine; no new GL math:
// Dr accumulated depreciation, Dr cash-like proceeds, Cr asset cost, Dr/Cr gain-loss.
// AMORTIZATION_GL_POSTING_ENABLED remains default-OFF and is never enabled here.
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";
import { writeTransactionSourceLink } from "./accounting-spine-emit.js";
import { createJournalEntryOnClient } from "./journal-entries.service.js";
import { ensureOpenPeriod } from "./posting-engine.service.js";
import { AMORTIZATION_GL_POSTING_FLAG_KEY } from "./amortization-posting/amortization-posting.math.js";

type Actor = { userId: string; role: string };
type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

type FixedAssetRow = {
  id: string;
  name: string;
  unit_uuid: string | null;
  status: string;
  purchase_price_cents: string;
  prior_accumulated_depr_cents: string;
  asset_account_id: string | null;
  accum_depr_account_id: string | null;
};

export class OwnedAssetDisposalError extends Error {
  constructor(
    public readonly code:
      | "ASSET_NOT_FOUND"
      | "ASSET_NOT_POSTABLE"
      | "DISPOSAL_ALREADY_EXISTS"
      | "ACCOUNT_MISSING"
      | "ACCOUNT_ROLE_MAPPING_MISSING"
      | "PERIOD_LOCKED",
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "OwnedAssetDisposalError";
  }
}

export type OwnedAssetDisposalResult =
  | { result: "skipped_flag_off"; asset_id: string; journal_entry_id: null }
  | { result: "already_posted"; asset_id: string; journal_entry_id: string }
  | {
      result: "posted";
      asset_id: string;
      disposal_id: string;
      journal_entry_id: string;
      book_value_cents: number;
      gain_loss_cents: number;
      debit_total_cents: number;
      credit_total_cents: number;
    };

async function resolveRequiredRole(
  client: DbClient,
  operatingCompanyId: string,
  role: Parameters<typeof resolveRoleAccountOptional>[2]
): Promise<string> {
  const accountId = await resolveRoleAccountOptional(client as never, operatingCompanyId, role);
  if (!accountId) {
    throw new OwnedAssetDisposalError(
      "ACCOUNT_ROLE_MAPPING_MISSING",
      `No active chart-of-accounts role mapping for '${role}'`,
      { role }
    );
  }
  return accountId;
}

async function resolveCashLike(client: DbClient, operatingCompanyId: string): Promise<string> {
  return (
    (await resolveRoleAccountOptional(client as never, operatingCompanyId, "undeposited_funds")) ??
    (await resolveRoleAccountOptional(client as never, operatingCompanyId, "cash_clearing")) ??
    (await resolveRoleAccountOptional(client as never, operatingCompanyId, "ar_control")) ??
    (() => {
      throw new OwnedAssetDisposalError(
        "ACCOUNT_ROLE_MAPPING_MISSING",
        "No cash-like account (undeposited_funds/cash_clearing/ar_control) is mapped"
      );
    })()
  );
}

/** Dispose one owned asset through the shared JE spine, atomically with the disposal row and asset status. */
export async function postOwnedAssetDisposal(
  input: { operatingCompanyId: string; assetId: string; disposalDate: string; proceedsCents: number },
  actor: Actor
): Promise<OwnedAssetDisposalResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const enabled = await isEnabled(client as never, AMORTIZATION_GL_POSTING_FLAG_KEY, {
      operating_company_id: input.operatingCompanyId,
      user_uuid: actor.userId,
    });
    if (!enabled) return { result: "skipped_flag_off", asset_id: input.assetId, journal_entry_id: null };

    const assetRes = await client.query<FixedAssetRow>(
      `SELECT id::text, name, unit_uuid::text, status, purchase_price_cents::text,
              prior_accumulated_depr_cents::text, asset_account_id::text, accum_depr_account_id::text
         FROM accounting.fixed_assets
        WHERE operating_company_id = $1::uuid AND id = $2::uuid AND is_active = true
        LIMIT 1 FOR UPDATE`,
      [input.operatingCompanyId, input.assetId]
    );
    const asset = assetRes.rows[0];
    if (!asset) throw new OwnedAssetDisposalError("ASSET_NOT_FOUND", `Fixed asset ${input.assetId} not found`);
    if (!["active", "fully_depreciated"].includes(asset.status)) {
      throw new OwnedAssetDisposalError(
        "ASSET_NOT_POSTABLE",
        `Fixed asset ${input.assetId} is not postable for disposal (status=${asset.status})`
      );
    }
    if (!asset.asset_account_id || !asset.accum_depr_account_id) {
      throw new OwnedAssetDisposalError(
        "ACCOUNT_MISSING",
        `Fixed asset ${input.assetId} is missing asset_account_id and/or accum_depr_account_id`
      );
    }

    const existingDisposal = await client.query<{ disposal_je_id: string | null }>(
      `SELECT disposal_je_id::text
         FROM accounting.fixed_asset_disposals
        WHERE operating_company_id = $1::uuid AND asset_id = $2::uuid AND is_active = true
        LIMIT 1`,
      [input.operatingCompanyId, input.assetId]
    );
    if (existingDisposal.rows[0]) {
      const journalEntryId = existingDisposal.rows[0].disposal_je_id;
      if (journalEntryId) return { result: "already_posted", asset_id: input.assetId, journal_entry_id: journalEntryId };
      throw new OwnedAssetDisposalError("DISPOSAL_ALREADY_EXISTS", `Fixed asset ${input.assetId} already has an active disposal`);
    }

    await ensureOpenPeriod(client as never, input.operatingCompanyId, input.disposalDate).catch((error: unknown) => {
      throw new OwnedAssetDisposalError("PERIOD_LOCKED", error instanceof Error ? error.message : "Disposal period is closed");
    });

    const scheduleRes = await client.query<{ posted_depr_cents: string }>(
      `SELECT COALESCE(SUM(depreciation_amount_cents), 0)::text AS posted_depr_cents
         FROM accounting.depreciation_schedule_rows
        WHERE operating_company_id = $1::uuid AND asset_id = $2::uuid
          AND is_active = true AND posted = true AND period_date <= $3::date`,
      [input.operatingCompanyId, input.assetId, input.disposalDate]
    );
    const cost = Number(asset.purchase_price_cents);
    const accumulatedDepr = Math.min(
      cost,
      Math.max(0, Number(asset.prior_accumulated_depr_cents) + Number(scheduleRes.rows[0]?.posted_depr_cents ?? 0))
    );
    const bookValue = cost - accumulatedDepr;
    const proceeds = Math.max(0, Math.round(input.proceedsCents));
    const gainLoss = proceeds - bookValue;
    const gainLossAccount = gainLoss === 0 ? null : await resolveRequiredRole(client, input.operatingCompanyId, "gain_loss_on_disposal");
    const proceedsAccount = proceeds === 0 ? null : await resolveCashLike(client, input.operatingCompanyId);
    const label = `Owned asset ${asset.name} disposal (${asset.id})`;

    const postings = [
      ...(accumulatedDepr > 0
        ? [{ account_id: asset.accum_depr_account_id, debit_or_credit: "debit" as const, amount_cents: accumulatedDepr, description: `${label} accumulated depreciation` }]
        : []),
      ...(proceedsAccount
        ? [{ account_id: proceedsAccount, debit_or_credit: "debit" as const, amount_cents: proceeds, description: `${label} proceeds` }]
        : []),
      { account_id: asset.asset_account_id, debit_or_credit: "credit" as const, amount_cents: cost, description: `${label} asset cost` },
      ...(gainLoss > 0 && gainLossAccount
        ? [{ account_id: gainLossAccount, debit_or_credit: "credit" as const, amount_cents: gainLoss, description: `${label} gain on disposal` }]
        : gainLoss < 0 && gainLossAccount
          ? [{ account_id: gainLossAccount, debit_or_credit: "debit" as const, amount_cents: -gainLoss, description: `${label} loss on disposal` }]
          : []),
    ];

    const journalEntry = await createJournalEntryOnClient(
      client,
      {
        operating_company_id: input.operatingCompanyId,
        entry_date: input.disposalDate,
        memo: `${label} — gain/loss disposition`,
        source: "auto",
        postings,
      },
      actor
    );

    const postingRows = await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND journal_entry_uuid = $2::uuid
        ORDER BY line_sequence`,
      [input.operatingCompanyId, journalEntry.id]
    );
    for (const posting of postingRows.rows) {
      await writeTransactionSourceLink(client as never, {
        operating_company_id: input.operatingCompanyId,
        journal_entry_posting_id: posting.id,
        linked_object_type: "fixed_asset",
        linked_object_id: input.assetId,
        relationship_role: "owned_asset_disposal",
      });
      if (asset.unit_uuid) {
        await writeTransactionSourceLink(client as never, {
          operating_company_id: input.operatingCompanyId,
          journal_entry_posting_id: posting.id,
          linked_object_type: "unit",
          linked_object_id: asset.unit_uuid,
          relationship_role: "owned_asset_disposal_unit",
        });
      }
    }

    const disposalRes = await client.query<{ id: string }>(
      `INSERT INTO accounting.fixed_asset_disposals
        (operating_company_id, asset_id, disposal_date, disposal_type, proceeds_cents,
         book_value_at_disposal_cents, gain_loss_cents, gain_loss_account_id, disposal_je_id,
         posting_status, posted_at, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::date, 'sale', $4, $5, $6, $7::uuid, $8::uuid, 'posted', now(), $9::uuid)
       RETURNING id::text`,
      [input.operatingCompanyId, input.assetId, input.disposalDate, proceeds, bookValue, gainLoss, gainLossAccount, journalEntry.id, actor.userId]
    );
    const disposalId = disposalRes.rows[0]?.id;
    if (!disposalId) throw new Error("owned_asset_disposal_insert_failed");

    await client.query(
      `UPDATE accounting.fixed_assets
          SET status = 'disposed', updated_at = now(), updated_by_user_id = $3::uuid
        WHERE operating_company_id = $1::uuid AND id = $2::uuid`,
      [input.operatingCompanyId, input.assetId, actor.userId]
    );
    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.fixed_asset.disposed",
      {
        resource_type: "accounting.fixed_assets",
        resource_id: input.assetId,
        operating_company_id: input.operatingCompanyId,
        disposal_id: disposalId,
        journal_entry_id: journalEntry.id,
        proceeds_cents: proceeds,
        book_value_cents: bookValue,
        gain_loss_cents: gainLoss,
      },
      "info",
      "FLT-05-OWNED-ASSET-DISPOSAL"
    );

    const debitTotal = postings.filter((line) => line.debit_or_credit === "debit").reduce((sum, line) => sum + line.amount_cents, 0);
    const creditTotal = postings.filter((line) => line.debit_or_credit === "credit").reduce((sum, line) => sum + line.amount_cents, 0);
    return {
      result: "posted",
      asset_id: input.assetId,
      disposal_id: disposalId,
      journal_entry_id: journalEntry.id,
      book_value_cents: bookValue,
      gain_loss_cents: gainLoss,
      debit_total_cents: debitTotal,
      credit_total_cents: creditTotal,
    };
  });
}
