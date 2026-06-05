import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import {
  dualAckComplete,
  encodeDualAckNotes,
  enrichTransferRow,
  initialDualAckState,
  parseDualAckNotes,
  stripDualAckNotes,
  withDropoffAck,
  withPickupAck,
} from "../equipment/transfer-dual-confirm.js";

type InitiateTransferInput = {
  operating_company_id: string;
  equipment_id: string;
  from_driver_id: string;
  to_driver_id: string;
  transfer_location?: string;
  notes?: string;
};

export async function initiateTransfer(userId: string, input: InitiateTransferInput) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    await client.query("BEGIN");
    try {
      const drivers = await client.query<{ id: string }>(
        `
          SELECT id
          FROM mdata.drivers
          WHERE id = ANY($1::uuid[])
            AND operating_company_id = $2
            AND deactivated_at IS NULL
        `,
        [[input.from_driver_id, input.to_driver_id], input.operating_company_id]
      );
      if (drivers.rows.length !== 2) throw new Error("E_DRIVER_NOT_IN_COMPANY");

      const equipment = await client.query<{ id: string; assigned_driver_id: string | null }>(
        `
          SELECT id, assigned_driver_id
          FROM mdata.equipment
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [input.equipment_id]
      );
      const row = equipment.rows[0];
      if (!row?.id) throw new Error("E_EQUIPMENT_NOT_FOUND");
      if (row.assigned_driver_id && row.assigned_driver_id !== input.from_driver_id) {
        throw new Error("E_EQUIPMENT_NOT_HELD_BY_FROM_DRIVER");
      }

      const pending = await client.query<{ id: string }>(
        `
          SELECT id
          FROM mdata.equipment_transfers
          WHERE equipment_id = $1
            AND status = 'pending_to_confirm'
            AND expires_at > now()
          LIMIT 1
        `,
        [input.equipment_id]
      );
      if (pending.rows[0]?.id) throw new Error("E_EQUIPMENT_TRANSFER_PENDING");

      const transfer = await client.query<{ id: string; expires_at: string }>(
        `
          INSERT INTO mdata.equipment_transfers (
            operating_company_id, equipment_id, from_driver_id, to_driver_id,
            transfer_location, status, initiated_by_user_id, notes
          )
          VALUES ($1,$2,$3,$4,$5,'pending_to_confirm',$6,$7)
          RETURNING id, expires_at::text
        `,
        [
          input.operating_company_id,
          input.equipment_id,
          input.from_driver_id,
          input.to_driver_id,
          input.transfer_location ?? null,
          userId,
          encodeDualAckNotes(input.notes ?? null, initialDualAckState()),
        ]
      );

      await appendCrudAudit(
        client,
        userId,
        "mdata.equipment_transfer.initiated",
        {
          resource_type: "mdata.equipment_transfers",
          resource_id: transfer.rows[0]?.id,
          operating_company_id: input.operating_company_id,
          equipment_id: input.equipment_id,
          from_driver_id: input.from_driver_id,
          to_driver_id: input.to_driver_id,
          wf047_dual_ack: true,
        },
        "info",
        "P5-F5-EQUIPMENT-TRANSFER"
      );

      await client.query("COMMIT");
      const dualNotes = encodeDualAckNotes(input.notes ?? null, initialDualAckState());
      return enrichTransferRow({
        id: transfer.rows[0]?.id,
        status: "pending_to_confirm",
        expires_at: transfer.rows[0]?.expires_at,
        notes: dualNotes,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function confirmTransfer(
  userId: string,
  input: { operating_company_id: string; transfer_id: string; confirming_driver_id: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    await client.query("BEGIN");
    try {
      const transferRes = await client.query<{
        id: string;
        equipment_id: string;
        to_driver_id: string;
        status: string;
        expires_at: string;
      }>(
        `
          SELECT id, equipment_id, to_driver_id, status, expires_at::text
          FROM mdata.equipment_transfers
          WHERE id = $1
            AND operating_company_id = $2
          FOR UPDATE
        `,
        [input.transfer_id, input.operating_company_id]
      );
      const transfer = transferRes.rows[0];
      if (!transfer) throw new Error("E_NOT_FOUND");
      if (transfer.to_driver_id !== input.confirming_driver_id) throw new Error("E_TRANSFER_NOT_ASSIGNED_TO_DRIVER");
      if (transfer.status !== "pending_to_confirm") throw new Error("E_TRANSFER_NOT_PENDING");
      if (new Date(transfer.expires_at).getTime() < Date.now()) throw new Error("E_TRANSFER_EXPIRED");

      const notesRes = await client.query<{ notes: string | null }>(
        `SELECT notes FROM mdata.equipment_transfers WHERE id = $1`,
        [input.transfer_id]
      );
      const dualAck = parseDualAckNotes(notesRes.rows[0]?.notes);
      if (dualAck && !dualAckComplete(dualAck)) throw new Error("E_TRANSFER_DUAL_ACK_INCOMPLETE");

      await client.query(
        `
          UPDATE mdata.equipment_transfers
          SET status = 'confirmed',
              confirmed_at = now(),
              updated_at = now()
          WHERE id = $1
        `,
        [input.transfer_id]
      );
      await client.query(
        `
          UPDATE mdata.equipment
          SET assigned_driver_id = $2,
              updated_at = now()
          WHERE id = $1
        `,
        [transfer.equipment_id, input.confirming_driver_id]
      );
      await appendCrudAudit(
        client,
        userId,
        "mdata.equipment_transfer.confirmed",
        {
          resource_type: "mdata.equipment_transfers",
          resource_id: input.transfer_id,
          operating_company_id: input.operating_company_id,
          equipment_id: transfer.equipment_id,
          to_driver_id: input.confirming_driver_id,
        },
        "info",
        "P5-F5-EQUIPMENT-TRANSFER"
      );
      await client.query("COMMIT");
      return { id: input.transfer_id, status: "confirmed" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function rejectTransfer(
  userId: string,
  input: { operating_company_id: string; transfer_id: string; confirming_driver_id: string; rejection_reason: string }
) {
  if (!input.rejection_reason || input.rejection_reason.trim().length < 10) {
    throw new Error("E_REJECTION_REASON_MIN_10");
  }
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    const transfer = await client.query<{ id: string; to_driver_id: string; status: string }>(
      `
        UPDATE mdata.equipment_transfers
        SET status = 'rejected',
            rejected_at = now(),
            rejection_reason = $4,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
          AND to_driver_id = $3
          AND status = 'pending_to_confirm'
        RETURNING id, to_driver_id, status
      `,
      [input.transfer_id, input.operating_company_id, input.confirming_driver_id, input.rejection_reason.trim()]
    );
    if (!transfer.rows[0]?.id) throw new Error("E_NOT_FOUND_OR_NOT_PENDING");
    await appendCrudAudit(
      client,
      userId,
      "mdata.equipment_transfer.rejected",
      {
        resource_type: "mdata.equipment_transfers",
        resource_id: input.transfer_id,
        operating_company_id: input.operating_company_id,
        to_driver_id: input.confirming_driver_id,
        rejection_reason: input.rejection_reason.trim(),
      },
      "warning",
      "P5-F5-EQUIPMENT-TRANSFER"
    );
    return { id: input.transfer_id, status: "rejected" };
  });
}

export async function listTransfers(
  userId: string,
  input: { operating_company_id?: string; status?: string; to_driver_id?: string }
) {
  return withCurrentUser(userId, async (client) => {
    const values: unknown[] = [];
    const filters: string[] = [];
    if (input.operating_company_id) {
      await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
      values.push(input.operating_company_id);
      filters.push(`operating_company_id = $${values.length}`);
    }
    if (input.status) {
      values.push(input.status);
      filters.push(`status = $${values.length}`);
    }
    if (input.to_driver_id) {
      values.push(input.to_driver_id);
      filters.push(`to_driver_id = $${values.length}`);
    }
    const rows = await client.query(
      `
        SELECT *
        FROM mdata.equipment_transfers
        ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY initiated_at DESC
      `,
      values
    );
    return { rows: rows.rows.map((row) => enrichTransferRow(row as Record<string, unknown>)) };
  });
}

async function loadPendingTransfer(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  input: { operating_company_id: string; transfer_id: string }
) {
  const transferRes = await client.query(
    `
      SELECT id, equipment_id, from_driver_id, to_driver_id, status, expires_at::text, notes
      FROM mdata.equipment_transfers
      WHERE id = $1 AND operating_company_id = $2
      FOR UPDATE
    `,
    [input.transfer_id, input.operating_company_id]
  );
  const transfer = transferRes.rows[0];
  if (!transfer) throw new Error("E_NOT_FOUND");
  if (transfer.status !== "pending_to_confirm") throw new Error("E_TRANSFER_NOT_PENDING");
  if (new Date(String(transfer.expires_at)).getTime() < Date.now()) throw new Error("E_TRANSFER_EXPIRED");
  return transfer;
}

async function finalizeDualAckTransfer(
  client: Parameters<Parameters<typeof withCurrentUser>[1]>[0],
  userId: string,
  operatingCompanyId: string,
  transfer: Record<string, unknown>,
  receivingDriverId: string
) {
  await client.query(
    `UPDATE mdata.equipment_transfers SET status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE id = $1`,
    [transfer.id]
  );
  await client.query(
    `UPDATE mdata.equipment SET assigned_driver_id = $2, updated_at = now() WHERE id = $1`,
    [transfer.equipment_id, receivingDriverId]
  );
  await appendCrudAudit(
    client,
    userId,
    "mdata.equipment_transfer.confirmed",
    {
      resource_type: "mdata.equipment_transfers",
      resource_id: transfer.id,
      operating_company_id: operatingCompanyId,
      equipment_id: transfer.equipment_id,
      to_driver_id: receivingDriverId,
      wf047_dual_ack: true,
    },
    "info",
    "P5-F5-EQUIPMENT-TRANSFER"
  );
}

export async function ackDropoffTransfer(
  userId: string,
  input: { operating_company_id: string; transfer_id: string; from_driver_id: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    await client.query("BEGIN");
    try {
      const transfer = await loadPendingTransfer(client, input);
      if (transfer.from_driver_id !== input.from_driver_id) throw new Error("E_TRANSFER_NOT_FROM_DRIVER");
      const state = parseDualAckNotes(String(transfer.notes ?? "")) ?? initialDualAckState();
      if (state.dropoff_ack_at) throw new Error("E_DROPOFF_ALREADY_ACKED");
      const next = withDropoffAck(state);
      const notes = encodeDualAckNotes(stripDualAckNotes(String(transfer.notes ?? "")), next);
      await client.query(`UPDATE mdata.equipment_transfers SET notes = $2, updated_at = now() WHERE id = $1`, [
        input.transfer_id,
        notes,
      ]);
      if (dualAckComplete(next)) await finalizeDualAckTransfer(client, userId, input.operating_company_id, transfer, input.from_driver_id);
      await client.query("COMMIT");
      return enrichTransferRow({ id: input.transfer_id, status: dualAckComplete(next) ? "confirmed" : "pending_to_confirm", notes });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function ackPickupTransfer(
  userId: string,
  input: { operating_company_id: string; transfer_id: string; to_driver_id: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    await client.query("BEGIN");
    try {
      const transfer = await loadPendingTransfer(client, input);
      if (transfer.to_driver_id !== input.to_driver_id) throw new Error("E_TRANSFER_NOT_ASSIGNED_TO_DRIVER");
      const state = parseDualAckNotes(String(transfer.notes ?? "")) ?? initialDualAckState();
      if (!state.dropoff_ack_at) throw new Error("E_DROPOFF_ACK_REQUIRED");
      if (state.pickup_ack_at) throw new Error("E_PICKUP_ALREADY_ACKED");
      const next = withPickupAck(state);
      const notes = encodeDualAckNotes(stripDualAckNotes(String(transfer.notes ?? "")), next);
      await client.query(`UPDATE mdata.equipment_transfers SET notes = $2, updated_at = now() WHERE id = $1`, [
        input.transfer_id,
        notes,
      ]);
      if (dualAckComplete(next)) await finalizeDualAckTransfer(client, userId, input.operating_company_id, transfer, input.to_driver_id);
      await client.query("COMMIT");
      return enrichTransferRow({ id: input.transfer_id, status: dualAckComplete(next) ? "confirmed" : "pending_to_confirm", notes });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function expireOldTransfers(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    const res = await client.query<{ id: string }>(
      `
        UPDATE mdata.equipment_transfers
        SET status = 'expired',
            updated_at = now()
        WHERE operating_company_id = $1
          AND status = 'pending_to_confirm'
          AND expires_at < now()
        RETURNING id
      `,
      [operatingCompanyId]
    );
    return { expired_count: res.rows.length };
  });
}
