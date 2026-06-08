import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";

function isOwner(role: string) {
  return role === "Owner";
}

export async function cancelLoad(
  userId: string,
  role: string,
  input: {
    operating_company_id: string;
    load_id: string;
    reason_code: string;
    cancellation_notes: string;
    billable_to_customer?: boolean;
    cancellation_charge_cents?: number;
  }
) {
  if (!input.cancellation_notes || input.cancellation_notes.trim().length < 20) {
    throw new Error("E_CANCELLATION_NOTES_MIN_20");
  }

  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    await client.query("BEGIN");
    try {
      const loadRes = await client.query(
        `
          SELECT id, status
          FROM mdata.loads
          WHERE id = $1
            AND operating_company_id = $2
            AND soft_deleted_at IS NULL
          FOR UPDATE
        `,
        [input.load_id, input.operating_company_id]
      );
      if (!loadRes.rows[0]?.id) throw new Error("E_LOAD_NOT_FOUND");

      const reasonRes = await client.query<{
        reason_code: string;
        billable_to_customer_default: boolean;
        requires_owner_approval: boolean;
      }>(
        `
          SELECT reason_code, billable_to_customer_default, requires_owner_approval
          FROM catalogs.cancellation_reasons
          WHERE reason_code = $1
            AND is_active = true
          LIMIT 1
        `,
        [input.reason_code]
      );
      const reason = reasonRes.rows[0];
      if (!reason) throw new Error("E_REASON_NOT_FOUND");

      const pendingOwnerApproval = reason.requires_owner_approval && !isOwner(role);
      const row = await client.query<{ id: string; status: string }>(
        `
          INSERT INTO dispatch.load_cancellations (
            operating_company_id, load_id, reason_code, cancellation_notes,
            billable_to_customer, cancellation_charge_cents, status, cancelled_by_user_id, cancelled_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
          ON CONFLICT (load_id) DO UPDATE
          SET reason_code = EXCLUDED.reason_code,
              cancellation_notes = EXCLUDED.cancellation_notes,
              billable_to_customer = EXCLUDED.billable_to_customer,
              cancellation_charge_cents = EXCLUDED.cancellation_charge_cents,
              status = EXCLUDED.status,
              cancelled_by_user_id = EXCLUDED.cancelled_by_user_id,
              cancelled_at = EXCLUDED.cancelled_at
          RETURNING id, status
        `,
        [
          input.operating_company_id,
          input.load_id,
          input.reason_code,
          input.cancellation_notes.trim(),
          input.billable_to_customer ?? reason.billable_to_customer_default,
          input.cancellation_charge_cents ?? null,
          pendingOwnerApproval ? "requested" : "approved",
          userId,
        ]
      );

      if (!pendingOwnerApproval) {
        await client.query(
          `
            UPDATE mdata.loads
            SET status = 'cancelled'::mdata.load_status_enum,
                updated_at = now()
            WHERE id = $1
          `,
          [input.load_id]
        );
      }

      await appendCrudAudit(
        client,
        userId,
        "dispatch.load.cancellation_requested",
        {
          resource_type: "mdata.loads",
          resource_id: input.load_id,
          operating_company_id: input.operating_company_id,
          reason_code: input.reason_code,
          pending_owner_approval: pendingOwnerApproval,
        },
        "warning",
        "P5-F4-CANCELLATIONS"
      );

      await client.query("COMMIT");
      return {
        load_id: input.load_id,
        cancellation_id: row.rows[0]?.id,
        status: pendingOwnerApproval ? "pending_owner_approval" : "cancelled",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function listCancellations(
  userId: string,
  input: { operating_company_id: string; since?: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    const values: unknown[] = [input.operating_company_id];
    const filters = ["c.operating_company_id = $1"];
    if (input.since) {
      values.push(input.since);
      filters.push(`c.cancelled_at >= $${values.length}::timestamptz`);
    }
    const rows = await client.query(
      `
        SELECT c.*, r.reason_label
        FROM dispatch.load_cancellations c
        JOIN catalogs.cancellation_reasons r ON r.reason_code = c.reason_code
        WHERE ${filters.join(" AND ")}
        ORDER BY c.cancelled_at DESC
      `,
      values
    );
    return { rows: rows.rows };
  });
}

export async function listCancellationReasons(userId: string) {
  return withCurrentUser(userId, async (client) => {
    const rows = await client.query(
      `
        SELECT reason_code, reason_label, billable_to_customer_default, requires_owner_approval, sort_order
        FROM catalogs.cancellation_reasons
        WHERE is_active = true
        ORDER BY sort_order ASC, reason_label ASC
      `
    );
    return { reasons: rows.rows };
  });
}

export async function approveCancellation(
  userId: string,
  role: string,
  input: { operating_company_id: string; cancellation_id: string }
) {
  if (!isOwner(role)) throw new Error("E_OWNER_ONLY");
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    await client.query("BEGIN");
    try {
      const row = await client.query<{ id: string; load_id: string; status: string }>(
        `
          UPDATE dispatch.load_cancellations
          SET status = 'approved',
              approved_by_user_id = $2,
              approved_at = now()
          WHERE id = $1
            AND operating_company_id = $3
          RETURNING id, load_id, status
        `,
        [input.cancellation_id, userId, input.operating_company_id]
      );
      const cancellation = row.rows[0];
      if (!cancellation) throw new Error("E_NOT_FOUND");
      await client.query(
        `
          UPDATE mdata.loads
          SET status = 'cancelled'::mdata.load_status_enum,
              updated_at = now()
          WHERE id = $1
        `,
        [cancellation.load_id]
      );
      await appendCrudAudit(
        client,
        userId,
        "dispatch.load.cancellation_approved",
        {
          resource_type: "dispatch.load_cancellations",
          resource_id: input.cancellation_id,
          operating_company_id: input.operating_company_id,
          load_id: cancellation.load_id,
        },
        "warning",
        "P5-F4-CANCELLATIONS"
      );
      await client.query("COMMIT");
      return { id: input.cancellation_id, status: "approved" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
