/**
 * SET-03 — P6 dispute wire surface over the SINGLE canonical subledger
 * `driver_finance.driver_settlement_disputes`.
 *
 * Wire contracts (reason_code / submitted / approved / denied / evidence_r2_paths) stay;
 * storage maps onto canonical columns + status vocabulary. The stranded table
 * `driver_finance.settlement_disputes` is @archived — no writers.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";
import { notifySettlementDisputeDecided } from "../services/push-notification.service.js";
import { createCorrectiveJournalEntry } from "./settlement-dispute.service.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

const CANONICAL_CATEGORIES = new Set([
  "missing_pay",
  "wrong_deduction",
  "miscalculated_mileage",
  "wrong_rate",
  "detention_not_paid",
  "cash_advance_dispute",
  "fine_dispute",
  "escrow_dispute",
  "other",
]);

/** P6 wire status → canonical CHECK status */
function toCanonicalStatus(wire: string): string {
  switch (wire) {
    case "draft":
    case "submitted":
      return "open";
    case "under_review":
      return "under_review";
    case "approved":
      return "resolved_in_favor";
    case "denied":
      return "resolved_rejected";
    case "withdrawn":
      return "withdrawn";
    default:
      return "open";
  }
}

/** Canonical status → P6 wire status (API contract) */
function toWireStatus(canonical: string): string {
  switch (canonical) {
    case "open":
      return "submitted";
    case "under_review":
      return "under_review";
    case "resolved_in_favor":
    case "partially_resolved":
      return "approved";
    case "resolved_rejected":
      return "denied";
    case "withdrawn":
      return "withdrawn";
    default:
      return canonical;
  }
}

function mapReasonToCategory(reasonCode: string): string {
  const raw = reasonCode.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (CANONICAL_CATEGORIES.has(raw)) return raw;
  const aliases: Record<string, string> = {
    missing_line: "missing_pay",
    incorrect_rate: "wrong_rate",
    duplicate_deduction: "wrong_deduction",
    wrong_unit: "other",
  };
  return aliases[raw] ?? "other";
}

function ensureDescription(text: string): string {
  const t = text.trim();
  if (t.length >= 20) return t;
  // Canonical CHECK requires ≥20 chars; pad without inventing business facts.
  return `${t}${".".repeat(20 - t.length)}`;
}

/** SELECT list projecting canonical rows into the P6 wire shape. */
const P6_WIRE_SELECT = `
  d.id,
  d.operating_company_id,
  d.settlement_id,
  d.settlement_line_id,
  d.driver_id,
  COALESCE(d.reason_code, d.dispute_category) AS reason_code,
  d.dispute_description AS reason_text,
  d.evidence_r2_paths,
  d.disputed_amount_cents AS claimed_adjustment_cents,
  d.opened_at AS submitted_at,
  CASE d.status
    WHEN 'open' THEN 'submitted'
    WHEN 'under_review' THEN 'under_review'
    WHEN 'resolved_in_favor' THEN 'approved'
    WHEN 'partially_resolved' THEN 'approved'
    WHEN 'resolved_rejected' THEN 'denied'
    WHEN 'withdrawn' THEN 'withdrawn'
    ELSE d.status
  END AS status,
  d.reviewed_by_user_id AS reviewer_user_id,
  d.reviewed_at,
  d.resolution_notes AS resolution_text,
  d.resolution_amount_cents AS adjustment_cents,
  d.resolution_journal_entry_id AS adjustment_journal_id,
  d.created_at,
  d.updated_at
`;

async function emitOutbox(client: DbClient, eventType: string, payload: Record<string, unknown>) {
  /* outbox-handler-parity: literal-types=["settlement_dispute.submitted","settlement_dispute.decided"] */
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    eventType,
    JSON.stringify(payload),
  ]);
}

async function assertDriverOwnsSettlement(
  client: DbClient,
  input: { settlementId: string; driverId: string; operatingCompanyId: string }
) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM driver_finance.driver_settlements
      -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): id + driver_id already disambiguate (a driver
      -- can't own a settlement outside its own entity), but this floor matches every sibling
      -- driver_finance.driver_settlements read in this codebase, which all carry an explicit
      -- operating_company_id predicate as a defense-in-depth guard against a future FK-integrity bug.
      WHERE id = $1
        AND driver_id = $2
        AND operating_company_id = $3::uuid
      LIMIT 1
    `,
    [input.settlementId, input.driverId, input.operatingCompanyId]
  );
  if (!res.rows[0]?.id) throw new Error("E_SETTLEMENT_NOT_FOUND_FOR_DRIVER");
}

export async function submitSettlementDisputeP6(
  userId: string,
  input: {
    operating_company_id: string;
    settlement_id: string;
    driver_id: string;
    settlement_line_id?: string | null;
    reason_code: string;
    reason_text: string;
    claimed_adjustment_cents?: number | null;
    evidence_r2_paths?: string[] | null;
  }
) {
  if (!input.reason_text || input.reason_text.trim().length < 10) throw new Error("E_REASON_TEXT_REQUIRED");

  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    await assertDriverOwnsSettlement(client, {
      settlementId: input.settlement_id,
      driverId: input.driver_id,
      operatingCompanyId: input.operating_company_id,
    });

    const category = mapReasonToCategory(input.reason_code);
    const description = ensureDescription(input.reason_text);

    const insertRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.driver_settlement_disputes (
          operating_company_id,
          settlement_id,
          settlement_line_id,
          driver_id,
          dispute_category,
          dispute_description,
          disputed_amount_cents,
          reason_code,
          evidence_r2_paths,
          status,
          opened_by_driver,
          opened_by_user_id,
          opened_at
        )
        VALUES ($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9::text[],'open', true, $10::uuid, now())
        RETURNING id
      `,
      [
        input.operating_company_id,
        input.settlement_id,
        input.settlement_line_id ?? null,
        input.driver_id,
        category,
        description,
        input.claimed_adjustment_cents ?? null,
        input.reason_code.trim(),
        input.evidence_r2_paths ?? null,
        userId,
      ]
    );

    const disputeId = String(insertRes.rows[0]?.id ?? "");
    if (!disputeId) throw new Error("E_DISPUTE_INSERT_FAILED");

    await appendCrudAudit(
      client,
      userId,
      "driver_finance.settlement_dispute.submitted",
      {
        resource_type: "driver_finance.driver_settlement_disputes",
        resource_id: disputeId,
        settlement_id: input.settlement_id,
        driver_id: input.driver_id,
      },
      "info",
      "P6-T11185"
    );

    await emitOutbox(client, "settlement_dispute.submitted", {
      dispute_id: disputeId,
      settlement_id: input.settlement_id,
      driver_id: input.driver_id,
      operating_company_id: input.operating_company_id,
    });

    return { id: disputeId };
  });
}

export async function listSettlementDisputesForSettlementDriverP6(
  userId: string,
  input: { operating_company_id: string; settlement_id: string; driver_id: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    await assertDriverOwnsSettlement(client, {
      settlementId: input.settlement_id,
      driverId: input.driver_id,
      operatingCompanyId: input.operating_company_id,
    });

    const res = await client.query(
      `
        SELECT ${P6_WIRE_SELECT}
        FROM driver_finance.driver_settlement_disputes d
        WHERE d.operating_company_id = $1::uuid
          AND d.settlement_id = $2
          AND d.driver_id = $3
        ORDER BY d.opened_at DESC
      `,
      [input.operating_company_id, input.settlement_id, input.driver_id]
    );
    return res.rows;
  });
}

export async function withdrawSettlementDisputeP6(
  userId: string,
  input: { operating_company_id: string; dispute_id: string; driver_id: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const updated = await client.query(
      `
        UPDATE driver_finance.driver_settlement_disputes
        SET status = 'withdrawn',
            closed_at = now(),
            updated_at = now()
        WHERE id = $2
          AND operating_company_id = $1::uuid
          AND driver_id = $3
          AND status IN ('open')
        RETURNING id
      `,
      [input.operating_company_id, input.dispute_id, input.driver_id]
    );
    if (!updated.rows[0]?.id) throw new Error("E_DISPUTE_WITHDRAW_FORBIDDEN_OR_CLOSED");

    await appendCrudAudit(
      client,
      userId,
      "driver_finance.settlement_dispute.withdrawn",
      {
        resource_type: "driver_finance.driver_settlement_disputes",
        resource_id: input.dispute_id,
        driver_id: input.driver_id,
      },
      "info",
      "P6-T11185"
    );

    return { id: input.dispute_id };
  });
}

export async function listSettlementDisputesForSettlementOfficeP6(
  userId: string,
  input: { operating_company_id: string; settlement_id: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const res = await client.query(
      `
        SELECT ${P6_WIRE_SELECT},
               concat_ws(' ', dr.first_name, dr.last_name) AS driver_name
        FROM driver_finance.driver_settlement_disputes d
        JOIN mdata.drivers dr
          ON dr.id = d.driver_id
         AND dr.operating_company_id = d.operating_company_id
        WHERE d.operating_company_id = $1::uuid
          AND d.settlement_id = $2
        ORDER BY d.opened_at DESC
      `,
      [input.operating_company_id, input.settlement_id]
    );
    return res.rows;
  });
}

export async function listSettlementDisputeQueueP6(
  userId: string,
  input: {
    operating_company_id: string;
    status?: string | null;
    driver_id?: string | null;
    limit: number;
    offset: number;
  }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const values: unknown[] = [input.operating_company_id];
    const where: string[] = [`d.operating_company_id = $1::uuid`];

    if (input.status && input.status !== "all") {
      values.push(toCanonicalStatus(input.status));
      where.push(`d.status = $${values.length}`);
    }

    if (input.driver_id) {
      values.push(input.driver_id);
      where.push(`d.driver_id = $${values.length}`);
    }

    const countValues = [...values];

    values.push(input.limit);
    const limitPos = values.length;
    values.push(input.offset);
    const offsetPos = values.length;

    const res = await client.query(
      `
        SELECT
          ${P6_WIRE_SELECT},
          concat_ws(' ', dr.first_name, dr.last_name) AS driver_name,
          s.display_id AS settlement_display_id
        FROM driver_finance.driver_settlement_disputes d
        JOIN mdata.drivers dr
          ON dr.id = d.driver_id
         AND dr.operating_company_id = d.operating_company_id
        JOIN driver_finance.driver_settlements s
          ON s.id = d.settlement_id
         AND s.operating_company_id = d.operating_company_id
        WHERE ${where.join(" AND ")}
        ORDER BY d.opened_at DESC
        LIMIT $${limitPos} OFFSET $${offsetPos}
      `,
      values
    );

    const countRes = await client.query<{ c: string }>(
      `
        SELECT count(*)::text AS c
        FROM driver_finance.driver_settlement_disputes d
        WHERE ${where.join(" AND ")}
      `,
      countValues
    );

    return { rows: res.rows, total: Number(countRes.rows[0]?.c ?? 0) };
  });
}

export async function startSettlementDisputeReviewP6(userId: string, input: { operating_company_id: string; dispute_id: string }) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const updated = await client.query(
      `
        UPDATE driver_finance.driver_settlement_disputes
        SET status = 'under_review',
            reviewed_by_user_id = $3,
            reviewed_at = COALESCE(reviewed_at, now()),
            updated_at = now()
        WHERE id = $2
          AND operating_company_id = $1::uuid
          AND status = 'open'
        RETURNING id
      `,
      [input.operating_company_id, input.dispute_id, userId]
    );

    if (!updated.rows[0]?.id) throw new Error("E_START_REVIEW_INVALID_STATE");

    await appendCrudAudit(
      client,
      userId,
      "driver_finance.settlement_dispute.review_started",
      {
        resource_type: "driver_finance.driver_settlement_disputes",
        resource_id: input.dispute_id,
      },
      "info",
      "P6-T11185"
    );

    return { id: input.dispute_id };
  });
}

export async function decideSettlementDisputeP6(
  userId: string,
  userRole: string,
  input: {
    operating_company_id: string;
    dispute_id: string;
    decision: "approved" | "denied";
    resolution_text: string;
    adjustment_cents?: number | null;
  }
) {
  if (!input.resolution_text || input.resolution_text.trim().length < 10) throw new Error("E_RESOLUTION_TEXT_REQUIRED");

  const result = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const disputeRes = await client.query<{
      id: string;
      settlement_id: string;
      driver_id: string;
      status: string;
      disputed_amount_cents: string | number | null;
    }>(
      `
        SELECT id, settlement_id, driver_id, status, disputed_amount_cents
        FROM driver_finance.driver_settlement_disputes
        WHERE id = $2
          AND operating_company_id = $1::uuid
        FOR UPDATE
      `,
      [input.operating_company_id, input.dispute_id]
    );
    const dispute = disputeRes.rows[0];
    if (!dispute) throw new Error("E_NOT_FOUND");
    if (String(dispute.status) !== "under_review") throw new Error("E_DECIDE_REQUIRES_UNDER_REVIEW");

    const nextCanonical = input.decision === "approved" ? "resolved_in_favor" : "resolved_rejected";
    const nextWire = toWireStatus(nextCanonical);

    let adjustment = Number(input.adjustment_cents ?? 0);
    if (input.decision !== "approved") adjustment = 0;
    if (input.decision === "approved" && (!Number.isFinite(adjustment) || adjustment <= 0)) {
      const fallback = Number(dispute.disputed_amount_cents ?? 0);
      adjustment = Number.isFinite(fallback) ? fallback : 0;
    }
    if (input.decision === "approved" && adjustment <= 0) throw new Error("E_ADJUSTMENT_REQUIRED");

    let journalId: string | null = null;
    if (input.decision === "approved") {
      journalId = await createCorrectiveJournalEntry(client, {
        actorUserId: userId,
        actorRole: userRole,
        operatingCompanyId: input.operating_company_id,
        disputeId: input.dispute_id,
        settlementId: String(dispute.settlement_id),
        amountCents: adjustment,
        resolutionNotes: input.resolution_text.trim(),
      });

      // ACCT-F5619 — write the settlement_lines('dispute_adjustment') memo row REGARDLESS of
      // journalId (GL posting can be flag-OFF while the settlement still needs to record what was
      // approved). Without this, an approved correction on THIS route (the P6 decide-dispute path)
      // never appears on the settlement header/PDF/driver statement -- the only sibling that DOES
      // write this row is disputes.routes.ts's own resolveDispute.
      await client.query(
        `
          INSERT INTO driver_finance.settlement_lines (
            settlement_id, line_type, description, amount, is_sample_data
          )
          SELECT ds.id, 'dispute_adjustment', $2, $3::numeric, ds.is_sample_data
          FROM driver_finance.driver_settlements ds
          WHERE ds.id = $1::uuid
            AND ds.operating_company_id = $4::uuid
        `,
        [
          dispute.settlement_id,
          `Dispute adjustment (${nextCanonical})`,
          adjustment / 100,
          input.operating_company_id,
        ]
      );
    }

    await client.query(
      `
        UPDATE driver_finance.driver_settlement_disputes
        SET status = $3,
            reviewed_by_user_id = $4,
            reviewed_at = now(),
            resolution_notes = $5,
            resolution_amount_cents = $6,
            resolution_journal_entry_id = $7::uuid,
            closed_at = now(),
            updated_at = now()
        WHERE id = $2
          AND operating_company_id = $1::uuid
      `,
      [
        input.operating_company_id,
        input.dispute_id,
        nextCanonical,
        userId,
        input.resolution_text.trim(),
        input.decision === "approved" ? adjustment : null,
        journalId,
      ]
    );

    await appendCrudAudit(
      client,
      userId,
      "driver_finance.settlement_dispute.decided",
      {
        resource_type: "driver_finance.driver_settlement_disputes",
        resource_id: input.dispute_id,
        decision: input.decision,
        adjustment_cents: input.decision === "approved" ? adjustment : null,
        adjustment_journal_id: journalId,
      },
      "warning",
      "P6-T11185"
    );

    await emitOutbox(client, "settlement_dispute.decided", {
      dispute_id: input.dispute_id,
      settlement_id: dispute.settlement_id,
      driver_id: dispute.driver_id,
      operating_company_id: input.operating_company_id,
      decision: input.decision,
    });

    await withLuciaBypass(async (luciaClient) => {
      const rowRes = await luciaClient.query<{
        email: string | null;
        first_name: string | null;
        last_name: string | null;
      }>(
        `
          SELECT d.email, d.first_name, d.last_name
          FROM mdata.drivers d
          WHERE d.id = $1
            AND d.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [dispute.driver_id, input.operating_company_id]
      );
      const driverRow = rowRes.rows[0];
      const email = driverRow?.email ? String(driverRow.email).trim() : "";
      if (!email) return;

      const settleRes = await luciaClient.query<{ display_id: string | null }>(
        // ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): id alone does not scope the row -- this label
        // goes into an email subject/body sent to a real driver, the exact "another entity's number
        // rendered as a plausible reference" shape this class exists to catch.
        `SELECT display_id FROM driver_finance.driver_settlements WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [dispute.settlement_id, input.operating_company_id]
      );
      const settlementLabel = String(settleRes.rows[0]?.display_id ?? dispute.settlement_id);

      const driverName =
        `${String(driverRow?.first_name ?? "").trim()} ${String(driverRow?.last_name ?? "").trim()}`.trim() || "Driver";

      await enqueueEmail({
        operatingCompanyId: input.operating_company_id,
        toAddresses: [email],
        subject: `Settlement dispute ${input.decision} — ${settlementLabel}`,
        templateKey: "settlement-dispute-decided",
        templateVars: {
          driverName,
          settlementLabel,
          decision: input.decision,
          resolutionText: input.resolution_text.trim(),
        },
        queuedByUserId: userId,
      });
    }).catch(() => undefined);

    const displayRes = await client.query<{ display_id: string | null }>(
      // ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): matches the fix above -- id alone does not scope
      // the row this response label comes from.
      `SELECT display_id FROM driver_finance.driver_settlements WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [dispute.settlement_id, input.operating_company_id]
    );

    return {
      id: input.dispute_id,
      status: nextWire,
      adjustment_journal_id: journalId,
      settlement_id: dispute.settlement_id,
      driver_id: dispute.driver_id,
      settlement_display_id: displayRes.rows[0]?.display_id ?? null,
    };
  });

  void notifySettlementDisputeDecided({
    operatingCompanyId: input.operating_company_id,
    driverId: result.driver_id,
    settlementId: String(result.settlement_id),
    disputeId: input.dispute_id,
    decision: input.decision,
    displayId: result.settlement_display_id,
  }).catch(() => undefined);

  return { id: result.id, status: result.status, adjustment_journal_id: result.adjustment_journal_id };
}
