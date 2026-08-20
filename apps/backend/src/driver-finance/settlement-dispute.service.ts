import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { createJournalEntry } from "../accounting/journal-entries.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { SETTLEMENT_GL_POSTING_FLAG_KEY } from "../accounting/settlement-posting/settlement-posting.math.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";

const CLOSED_STATUSES = new Set(["resolved_in_favor", "resolved_rejected", "partially_resolved", "withdrawn"]);

type DisputeStatus = "open" | "under_review" | "resolved_in_favor" | "resolved_rejected" | "partially_resolved" | "withdrawn";

type DisputeCategory =
  | "missing_pay"
  | "wrong_deduction"
  | "miscalculated_mileage"
  | "wrong_rate"
  | "detention_not_paid"
  | "cash_advance_dispute"
  | "fine_dispute"
  | "escrow_dispute"
  | "other";

function isOwnerOrAdmin(role: string) {
  return role === "Owner" || role === "Administrator";
}

async function loadDisputeForUpdate(client: any, disputeId: string, companyId: string) {
  const res = await client.query(
    `
      SELECT *
      FROM driver_finance.driver_settlement_disputes
      WHERE id = $1
        AND operating_company_id = $2::uuid
      FOR UPDATE
    `,
    [disputeId, companyId]
  );
  return res.rows[0] ?? null;
}

/**
 * ACCT-F5616 — resolve the corrective JE's Dr/Cr accounts via the standard fail-closed CoA-role
 * chain, exactly like every other poster in this codebase. This REPLACES an ORDER BY created_at ASC
 * LIMIT 2 pick of "whichever two accounts happen to sort first" — the anti-pattern
 * resolver.service.ts's own comments elsewhere in this file's neighbourhood explicitly warn against
 * ("never ORDER BY created_at LIMIT 2"). Dr driver_pay_expense (the correction increases what's owed
 * to the driver, same debit role every other pay-increasing leg in this codebase uses) / Cr
 * settlement_dispute_correction_recovery (owner-designated, no shape-fallback — an accounting-
 * treatment decision, never a guess). Undesignated => throws, so the dispute resolution itself still
 * fails loud (matching the pre-existing E_CORRECTIVE_JE_ACCOUNTS_MISSING contract) rather than posting
 * to an arbitrary account.
 */
async function pickCorrectionAccounts(client: any, operatingCompanyId: string) {
  const [debitAccountId, creditAccountId] = await Promise.all([
    resolveRoleAccountOptional(client, operatingCompanyId, "driver_pay_expense"),
    resolveRoleAccountOptional(client, operatingCompanyId, "settlement_dispute_correction_recovery"),
  ]);
  if (!debitAccountId || !creditAccountId) throw new Error("E_CORRECTIVE_JE_ACCOUNTS_MISSING");
  return { debitAccountId, creditAccountId };
}

export async function createCorrectiveJournalEntry(params: {
  actorUserId: string;
  actorRole: string;
  operatingCompanyId: string;
  disputeId: string;
  settlementId: string;
  amountCents: number;
  resolutionNotes: string;
}) {
  return withCurrentUser(params.actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [params.operatingCompanyId]);
    // FLAG GATE — OFF => post NOTHING (checked BEFORE any account read / JE insert), mirroring
    // settlement-posting.service.ts. This corrective JE previously posted UNGATED, so with
    // SETTLEMENT_GL_POSTING_ENABLED ON in prod it went live regardless of intent. Honor per-entity
    // overrides via isEnabled(); when OFF the dispute still resolves, resolution_journal_entry_id stays null.
    const flagOn = await isEnabled(client as never, SETTLEMENT_GL_POSTING_FLAG_KEY, {
      operating_company_id: params.operatingCompanyId,
      user_uuid: params.actorUserId,
    });
    if (!flagOn) return null;
    const accounts = await pickCorrectionAccounts(client, params.operatingCompanyId);
    const today = new Date().toISOString().slice(0, 10);
    const je = await createJournalEntry(
      {
        operating_company_id: params.operatingCompanyId,
        entry_date: today,
        memo: `Settlement dispute correction ${params.disputeId}: ${params.resolutionNotes.slice(0, 120)}`,
        source: "auto",
        postings: [
          {
            account_id: accounts.debitAccountId,
            debit_or_credit: "debit",
            amount_cents: params.amountCents,
            description: `Settlement dispute ${params.disputeId} correction debit`,
          },
          {
            account_id: accounts.creditAccountId,
            debit_or_credit: "credit",
            amount_cents: params.amountCents,
            description: `Settlement dispute ${params.disputeId} correction credit`,
          },
        ],
      },
      { userId: params.actorUserId, role: params.actorRole }
    );
    return je.id;
  });
}

export async function listDisputes(
  userId: string,
  input: { operating_company_id: string; status?: "open" | "all"; driver_id?: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const values: unknown[] = [input.operating_company_id];
    const where: string[] = [`d.operating_company_id = $1::uuid`];
    if (input.status && input.status !== "all") {
      where.push(`d.status IN ('open', 'under_review')`);
    }
    if (input.driver_id) {
      values.push(input.driver_id);
      where.push(`d.driver_id = $${values.length}`);
    }
    const res = await client.query(
      `
        SELECT
          d.*,
          concat_ws(' ', dr.first_name, dr.last_name) AS driver_name,
          s.display_id AS settlement_display_id,
          s.period_start::text AS period_start,
          s.period_end::text AS period_end
        FROM driver_finance.driver_settlement_disputes d
        -- ENTITY PREDICATES (CLS-JOIN-ENTITY-UNSCOPED): the dispute d is scoped by the WHERE, but the
        -- driver NAME and settlement DISPLAY_ID it resolves were not. RLS is no backstop —
        -- org.user_accessible_company_ids() returns EVERY active company when the role is Owner.
        JOIN mdata.drivers dr ON dr.id = d.driver_id
                             AND dr.operating_company_id = d.operating_company_id
        JOIN driver_finance.driver_settlements s ON s.id = d.settlement_id
                                                AND s.operating_company_id = d.operating_company_id
        WHERE ${where.join(" AND ")}
        ORDER BY d.opened_at DESC
        LIMIT 300
      `,
      values
    );
    return res.rows;
  });
}

export async function getDispute(userId: string, input: { operating_company_id: string; dispute_id: string }) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const res = await client.query(
      `
        SELECT
          d.*,
          concat_ws(' ', dr.first_name, dr.last_name) AS driver_name,
          s.display_id AS settlement_display_id,
          s.period_start::text AS period_start,
          s.period_end::text AS period_end,
          s.gross_pay, s.deductions_total, s.net_pay
        FROM driver_finance.driver_settlement_disputes d
        -- ENTITY PREDICATES (CLS-JOIN-ENTITY-UNSCOPED): the dispute d is scoped by the WHERE, but the
        -- driver NAME and settlement DISPLAY_ID it resolves were not. RLS is no backstop —
        -- org.user_accessible_company_ids() returns EVERY active company when the role is Owner.
        JOIN mdata.drivers dr ON dr.id = d.driver_id
                             AND dr.operating_company_id = d.operating_company_id
        JOIN driver_finance.driver_settlements s ON s.id = d.settlement_id
                                                AND s.operating_company_id = d.operating_company_id
        WHERE d.id = $2
          AND d.operating_company_id = $1::uuid
        LIMIT 1
      `,
      [input.operating_company_id, input.dispute_id]
    );
    return res.rows[0] ?? null;
  });
}

export async function openDispute(
  userId: string,
  input: {
    operating_company_id: string;
    settlement_id: string;
    driver_id: string;
    dispute_category: DisputeCategory;
    dispute_description: string;
    disputed_amount_cents?: number;
    opened_by_driver?: boolean;
  }
) {
  if (!input.dispute_description || input.dispute_description.trim().length < 20) {
    throw new Error("E_DESCRIPTION_REQUIRED: dispute_description >=20 chars required");
  }
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
  const settlement = await client.query(
      `
        SELECT id
        FROM driver_finance.driver_settlements
        WHERE id = $1
          AND operating_company_id = $2::uuid
          AND driver_id = $3
        LIMIT 1
      `,
      [input.settlement_id, input.operating_company_id, input.driver_id]
    );
    if (!settlement.rows[0]?.id) throw new Error("E_SETTLEMENT_NOT_FOUND_FOR_DRIVER");

    const inserted = await client.query(
      `
        INSERT INTO driver_finance.driver_settlement_disputes (
          operating_company_id, settlement_id, driver_id, dispute_category, dispute_description,
          disputed_amount_cents, opened_by_driver, opened_by_user_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id
      `,
      [
        input.operating_company_id,
        input.settlement_id,
        input.driver_id,
        input.dispute_category,
        input.dispute_description.trim(),
        input.disputed_amount_cents ?? null,
        input.opened_by_driver ?? true,
        userId,
      ]
    );
    const disputeId = inserted.rows[0]?.id;
    if (!disputeId) throw new Error("E_DISPUTE_CREATE_FAILED");

    await appendCrudAudit(
      client,
      userId,
      "driver_finance.dispute.opened",
      {
        resource_type: "driver_finance.driver_settlement_disputes",
        resource_id: disputeId,
        operating_company_id: input.operating_company_id,
        settlement_id: input.settlement_id,
        driver_id: input.driver_id,
        dispute_category: input.dispute_category,
        disputed_amount_cents: input.disputed_amount_cents ?? null,
      },
      "warning",
      "P5-E2-DISPUTES"
    );
    await appendCrudAudit(
      client,
      userId,
      "workflow.requested",
      {
        action_code: "WF-064-DISPUTE-001",
        workflow_context: "driver_settlement_dispute_opened",
        owner_notification_required: true,
        target_resource_type: "driver_finance.driver_settlement_disputes",
        target_resource_id: disputeId,
        operating_company_id: input.operating_company_id,
      },
      "warning",
      "P5-E2-WF064"
    );
    return { id: disputeId };
  });
}

export async function markUnderReview(
  userId: string,
  userRole: string,
  input: { operating_company_id: string; dispute_id: string }
) {
  if (!isOwnerOrAdmin(userRole)) throw new Error("E_OWNER_OR_ADMIN_ONLY");
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const current = await loadDisputeForUpdate(client, input.dispute_id, input.operating_company_id);
    if (!current) throw new Error("E_NOT_FOUND");
    if (CLOSED_STATUSES.has(String(current.status))) throw new Error("E_CLOSED_IMMUTABLE");
    const updated = await client.query(
      `
        UPDATE driver_finance.driver_settlement_disputes
        SET status = 'under_review',
            reviewed_by_user_id = $2,
            reviewed_at = now(),
            updated_at = now()
        WHERE id = $1
        RETURNING id
      `,
      [input.dispute_id, userId]
    );
    await appendCrudAudit(
      client,
      userId,
      "driver_finance.dispute.under_review",
      {
        resource_type: "driver_finance.driver_settlement_disputes",
        resource_id: input.dispute_id,
        operating_company_id: input.operating_company_id,
      },
      "info",
      "P5-E2-DISPUTES"
    );
    return { id: updated.rows[0]?.id ?? input.dispute_id };
  });
}

export async function resolveDispute(
  userId: string,
  userRole: string,
  input: {
    operating_company_id: string;
    dispute_id: string;
    resolution: "in_favor" | "rejected" | "partial";
    resolution_notes: string;
    resolution_amount_cents?: number;
  }
) {
  if (!isOwnerOrAdmin(userRole)) throw new Error("E_OWNER_OR_ADMIN_ONLY");
  if (!input.resolution_notes || input.resolution_notes.trim().length < 20) {
    throw new Error("E_RESOLUTION_NOTES_REQUIRED");
  }

  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const dispute = await loadDisputeForUpdate(client, input.dispute_id, input.operating_company_id);
    if (!dispute) throw new Error("E_NOT_FOUND");
    if (CLOSED_STATUSES.has(String(dispute.status))) throw new Error("E_CLOSED_IMMUTABLE");

    const normalizedStatus: DisputeStatus =
      input.resolution === "in_favor"
        ? "resolved_in_favor"
        : input.resolution === "partial"
          ? "partially_resolved"
          : "resolved_rejected";

    let resolutionAmountCents = Number(input.resolution_amount_cents ?? dispute.disputed_amount_cents ?? 0);
    if (input.resolution === "rejected") resolutionAmountCents = 0;
    if ((input.resolution === "in_favor" || input.resolution === "partial") && resolutionAmountCents <= 0) {
      throw new Error("E_RESOLUTION_AMOUNT_REQUIRED");
    }

    let journalEntryId: string | null = null;
    if (input.resolution === "in_favor" || input.resolution === "partial") {
      journalEntryId = await createCorrectiveJournalEntry({
        actorUserId: userId,
        actorRole: userRole,
        operatingCompanyId: input.operating_company_id,
        disputeId: input.dispute_id,
        settlementId: String(dispute.settlement_id),
        amountCents: resolutionAmountCents,
        resolutionNotes: input.resolution_notes.trim(),
      });

      // ACCT-F5619 — write the settlement_lines('dispute_adjustment') memo row REGARDLESS of
      // journalEntryId (GL posting can be flag-OFF while the settlement still needs to record what
      // was approved), mirroring disputes.routes.ts's own resolveDispute-adjacent write exactly.
      // Without this, an approved correction on THIS route (settlement-dispute.routes.ts's own
      // reviewDispute path) never appears on the settlement header/PDF/driver statement at all —
      // the only mounted sibling that DOES write this row is the OTHER dispute-resolution route
      // (disputes.routes.ts), so which endpoint an operator happens to hit silently changed whether
      // the correction was ever recorded against the settlement.
      await client.query(
        `
          INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
          VALUES ($1::uuid, 'dispute_adjustment', $2, $3::numeric)
        `,
        [dispute.settlement_id, `Dispute adjustment (${normalizedStatus})`, resolutionAmountCents / 100]
      );
    }

    await client.query(
      `
        UPDATE driver_finance.driver_settlement_disputes
        SET status = $2,
            reviewed_by_user_id = $3,
            reviewed_at = COALESCE(reviewed_at, now()),
            resolution_notes = $4,
            resolution_amount_cents = $5,
            resolution_journal_entry_id = $6,
            closed_at = now(),
            updated_at = now()
        WHERE id = $1
      `,
      [
        input.dispute_id,
        normalizedStatus,
        userId,
        input.resolution_notes.trim(),
        resolutionAmountCents || null,
        journalEntryId,
      ]
    );

    await appendCrudAudit(
      client,
      userId,
      "driver_finance.dispute.resolved",
      {
        resource_type: "driver_finance.driver_settlement_disputes",
        resource_id: input.dispute_id,
        operating_company_id: input.operating_company_id,
        final_status: normalizedStatus,
        resolution_amount_cents: resolutionAmountCents || null,
        resolution_journal_entry_id: journalEntryId,
      },
      "warning",
      "P5-E2-DISPUTES"
    );

    return { id: input.dispute_id, status: normalizedStatus, resolution_journal_entry_id: journalEntryId };
  });
}

export async function withdrawDispute(
  userId: string,
  input: { operating_company_id: string; dispute_id: string; driver_id: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const dispute = await loadDisputeForUpdate(client, input.dispute_id, input.operating_company_id);
    if (!dispute) throw new Error("E_NOT_FOUND");
    if (CLOSED_STATUSES.has(String(dispute.status))) throw new Error("E_CLOSED_IMMUTABLE");
    if (String(dispute.driver_id) !== input.driver_id) throw new Error("E_FORBIDDEN_NOT_DRIVER");

    await client.query(
      `
        UPDATE driver_finance.driver_settlement_disputes
        SET status = 'withdrawn',
            closed_at = now(),
            updated_at = now()
        WHERE id = $1
      `,
      [input.dispute_id]
    );

    await appendCrudAudit(
      client,
      userId,
      "driver_finance.dispute.withdrawn",
      {
        resource_type: "driver_finance.driver_settlement_disputes",
        resource_id: input.dispute_id,
        operating_company_id: input.operating_company_id,
        driver_id: input.driver_id,
      },
      "info",
      "P5-E2-DISPUTES"
    );
    return { id: input.dispute_id };
  });
}

export async function listMyDisputes(userId: string) {
  return withCurrentUser(userId, async (client) => {
    const driverRes = await client.query(
      `
        SELECT id
        FROM mdata.drivers
        WHERE identity_user_id = $1
          AND deactivated_at IS NULL
        LIMIT 1
      `,
      [userId]
    );
    const driverId = driverRes.rows[0]?.id ?? null;
    if (!driverId) throw new Error("E_DRIVER_PROFILE_NOT_FOUND");

    const rows = await client.query(
      `
        SELECT
          d.id,
          d.operating_company_id::text,
          d.settlement_id,
          s.display_id AS settlement_display_id,
          s.period_start::text,
          s.period_end::text,
          d.dispute_category,
          d.dispute_description,
          d.disputed_amount_cents,
          d.status,
          d.opened_at::text,
          d.reviewed_at::text,
          d.closed_at::text
        FROM driver_finance.driver_settlement_disputes d
        JOIN driver_finance.driver_settlements s ON s.id = d.settlement_id
        WHERE d.driver_id = $1
        ORDER BY d.opened_at DESC
        LIMIT 200
      `,
      [driverId]
    );
    return { driver_id: driverId, disputes: rows.rows };
  });
}

export async function resolveDriverIdForUser(userId: string) {
  return withCurrentUser(userId, async (client) => {
    const driverRes = await client.query(
      `
        SELECT id
        FROM mdata.drivers
        WHERE identity_user_id = $1
          AND deactivated_at IS NULL
        LIMIT 1
      `,
      [userId]
    );
    return driverRes.rows[0]?.id ?? null;
  });
}
