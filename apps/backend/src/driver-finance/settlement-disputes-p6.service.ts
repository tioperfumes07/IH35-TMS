import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";
import { notifySettlementDisputeDecided } from "../services/push-notification.service.js";
import { createCorrectiveJournalEntry } from "./settlement-dispute.service.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function emitOutbox(client: DbClient, eventType: string, payload: Record<string, unknown>) {
  /* outbox-handler-parity: literal-types=["settlement_dispute.submitted","settlement_dispute.decided"] */
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    eventType,
    JSON.stringify(payload),
  ]);
}

async function assertDriverOwnsSettlement(client: DbClient, input: { settlementId: string; driverId: string }) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM driver_finance.driver_settlements
      WHERE id = $1
        AND driver_id = $2
      LIMIT 1
    `,
    [input.settlementId, input.driverId]
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    await assertDriverOwnsSettlement(client, { settlementId: input.settlement_id, driverId: input.driver_id });

    const insertRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.settlement_disputes (
          operating_company_id,
          settlement_id,
          settlement_line_id,
          driver_id,
          reason_code,
          reason_text,
          evidence_r2_paths,
          claimed_adjustment_cents,
          status,
          submitted_at
        )
        VALUES ($1,$2,$3::uuid,$4,$5,$6,$7::text[],$8,'submitted', now())
        RETURNING id
      `,
      [
        input.operating_company_id,
        input.settlement_id,
        input.settlement_line_id ?? null,
        input.driver_id,
        input.reason_code.trim(),
        input.reason_text.trim(),
        input.evidence_r2_paths ?? null,
        input.claimed_adjustment_cents ?? null,
      ]
    );

    const disputeId = String(insertRes.rows[0]?.id ?? "");
    if (!disputeId) throw new Error("E_DISPUTE_INSERT_FAILED");

    await appendCrudAudit(
      client,
      userId,
      "driver_finance.settlement_dispute.submitted",
      {
        resource_type: "driver_finance.settlement_disputes",
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    await assertDriverOwnsSettlement(client, { settlementId: input.settlement_id, driverId: input.driver_id });

    const res = await client.query(
      `
        SELECT *
        FROM driver_finance.settlement_disputes
        WHERE operating_company_id = $1
          AND settlement_id = $2
          AND driver_id = $3
        ORDER BY submitted_at DESC
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);

    const updated = await client.query(
      `
        UPDATE driver_finance.settlement_disputes
        SET status = 'withdrawn',
            updated_at = now()
        WHERE id = $2
          AND operating_company_id = $1
          AND driver_id = $3
          AND status IN ('draft','submitted')
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
        resource_type: "driver_finance.settlement_disputes",
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    const res = await client.query(
      `
        SELECT sd.*,
               concat_ws(' ', dr.first_name, dr.last_name) AS driver_name
        FROM driver_finance.settlement_disputes sd
        JOIN mdata.drivers dr ON dr.id = sd.driver_id
        WHERE sd.operating_company_id = $1
          AND sd.settlement_id = $2
        ORDER BY sd.submitted_at DESC
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);

    const values: unknown[] = [input.operating_company_id];
    const where: string[] = [`sd.operating_company_id = $1`];

    if (input.status && input.status !== "all") {
      values.push(input.status);
      where.push(`sd.status = $${values.length}`);
    }

    if (input.driver_id) {
      values.push(input.driver_id);
      where.push(`sd.driver_id = $${values.length}`);
    }

    const countValues = [...values];

    values.push(input.limit);
    const limitPos = values.length;
    values.push(input.offset);
    const offsetPos = values.length;

    const res = await client.query(
      `
        SELECT
          sd.*,
          concat_ws(' ', dr.first_name, dr.last_name) AS driver_name,
          s.display_id AS settlement_display_id
        FROM driver_finance.settlement_disputes sd
        JOIN mdata.drivers dr ON dr.id = sd.driver_id
        JOIN driver_finance.driver_settlements s ON s.id = sd.settlement_id
        WHERE ${where.join(" AND ")}
        ORDER BY sd.submitted_at DESC
        LIMIT $${limitPos} OFFSET $${offsetPos}
      `,
      values
    );

    const countRes = await client.query<{ c: string }>(
      `
        SELECT count(*)::text AS c
        FROM driver_finance.settlement_disputes sd
        WHERE ${where.join(" AND ")}
      `,
      countValues
    );

    return { rows: res.rows, total: Number(countRes.rows[0]?.c ?? 0) };
  });
}

export async function startSettlementDisputeReviewP6(userId: string, input: { operating_company_id: string; dispute_id: string }) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);

    const updated = await client.query(
      `
        UPDATE driver_finance.settlement_disputes
        SET status = 'under_review',
            reviewer_user_id = $3,
            reviewed_at = COALESCE(reviewed_at, now()),
            updated_at = now()
        WHERE id = $2
          AND operating_company_id = $1
          AND status = 'submitted'
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
        resource_type: "driver_finance.settlement_disputes",
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);

    const disputeRes = await client.query<{
      id: string;
      settlement_id: string;
      driver_id: string;
      status: string;
      claimed_adjustment_cents: string | number | null;
    }>(
      `
        SELECT id, settlement_id, driver_id, status, claimed_adjustment_cents
        FROM driver_finance.settlement_disputes
        WHERE id = $2
          AND operating_company_id = $1
        FOR UPDATE
      `,
      [input.operating_company_id, input.dispute_id]
    );
    const dispute = disputeRes.rows[0];
    if (!dispute) throw new Error("E_NOT_FOUND");
    if (String(dispute.status) !== "under_review") throw new Error("E_DECIDE_REQUIRES_UNDER_REVIEW");

    const nextStatus = input.decision === "approved" ? "approved" : "denied";

    let adjustment = Number(input.adjustment_cents ?? 0);
    if (input.decision !== "approved") adjustment = 0;
    if (input.decision === "approved" && (!Number.isFinite(adjustment) || adjustment <= 0)) {
      const fallback = Number(dispute.claimed_adjustment_cents ?? 0);
      adjustment = Number.isFinite(fallback) ? fallback : 0;
    }
    if (input.decision === "approved" && adjustment <= 0) throw new Error("E_ADJUSTMENT_REQUIRED");

    let journalId: string | null = null;
    if (input.decision === "approved") {
      journalId = await createCorrectiveJournalEntry({
        actorUserId: userId,
        actorRole: userRole,
        operatingCompanyId: input.operating_company_id,
        disputeId: input.dispute_id,
        settlementId: String(dispute.settlement_id),
        amountCents: adjustment,
        resolutionNotes: input.resolution_text.trim(),
      });
    }

    await client.query(
      `
        UPDATE driver_finance.settlement_disputes
        SET status = $3,
            reviewer_user_id = $4,
            reviewed_at = now(),
            resolution_text = $5,
            adjustment_cents = $6,
            adjustment_journal_id = $7::uuid,
            updated_at = now()
        WHERE id = $2
          AND operating_company_id = $1
      `,
      [
        input.operating_company_id,
        input.dispute_id,
        nextStatus,
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
        resource_type: "driver_finance.settlement_disputes",
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
          LIMIT 1
        `,
        [dispute.driver_id]
      );
      const driverRow = rowRes.rows[0];
      const email = driverRow?.email ? String(driverRow.email).trim() : "";
      if (!email) return;

      const settleRes = await luciaClient.query<{ display_id: string | null }>(
        `SELECT display_id FROM driver_finance.driver_settlements WHERE id = $1 LIMIT 1`,
        [dispute.settlement_id]
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
      `SELECT display_id FROM driver_finance.driver_settlements WHERE id = $1 LIMIT 1`,
      [dispute.settlement_id]
    );

    return {
      id: input.dispute_id,
      status: nextStatus,
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
