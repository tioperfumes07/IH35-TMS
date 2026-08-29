import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
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
    await setScopedCompanyContext(client, userId, input.operating_company_id);
      const drivers = await client.query<{ id: string }>(
        `
          SELECT id
          FROM mdata.drivers
          WHERE id = ANY($1::uuid[])
            AND operating_company_id = $2::uuid
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
            -- Entity scope (USMCA cross-entity leak fix): mdata.equipment has no operating_company_id
            -- and its RLS is identity/role-scoped, so confirm the equipment is owned-by/leased-to the
            -- transferring company before locking it.
            AND (owner_company_id = $2 OR currently_leased_to_company_id = $2)
          LIMIT 1
          FOR UPDATE
        `,
        [input.equipment_id, input.operating_company_id]
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
      const createdTransfer = transfer.rows[0];
      if (!createdTransfer?.id) throw new Error("E_EQUIPMENT_TRANSFER_INSERT_FAILED");

      await appendCrudAudit(
        client,
        userId,
        "mdata.equipment_transfer.initiated",
        {
          resource_type: "mdata.equipment_transfers",
          resource_id: createdTransfer.id,
          operating_company_id: input.operating_company_id,
          equipment_id: input.equipment_id,
          from_driver_id: input.from_driver_id,
          to_driver_id: input.to_driver_id,
          wf047_dual_ack: true,
        },
        "info",
        "P5-F5-EQUIPMENT-TRANSFER"
      );

      const dualNotes = encodeDualAckNotes(input.notes ?? null, initialDualAckState());
      return enrichTransferRow({
        id: createdTransfer.id,
        status: "pending_to_confirm",
        expires_at: createdTransfer.expires_at,
        notes: dualNotes,
      });
  });
}

export async function confirmTransfer(
  userId: string,
  input: { operating_company_id: string; transfer_id: string; confirming_driver_id: string }
) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, input.operating_company_id);
      const transferRes = await client.query<{
        id: string;
        equipment_id: string;
        from_driver_id: string | null;
        to_driver_id: string;
        status: string;
        expires_at: string;
      }>(
        `
          SELECT id, equipment_id, from_driver_id, to_driver_id, status, expires_at::text
          FROM mdata.equipment_transfers
          WHERE id = $1
            AND operating_company_id = $2::uuid
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

      const confirmed = await client.query<{ id: string }>(
        `
          UPDATE mdata.equipment_transfers
          SET status = 'confirmed',
              confirmed_at = now(),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND status = 'pending_to_confirm'
          RETURNING id::text AS id
        `,
        [input.transfer_id, input.operating_company_id]
      );
      if (!confirmed.rows[0]?.id) throw new Error("E_EQUIPMENT_TRANSFER_CONFIRM_FAILED");
      const assigned = await client.query<{ id: string }>(
        `
          UPDATE mdata.equipment
          SET assigned_driver_id = $2,
              updated_at = now()
          WHERE id = $1
            AND (owner_company_id = $3::uuid OR currently_leased_to_company_id = $3::uuid)
          RETURNING id::text AS id
        `,
        [transfer.equipment_id, input.confirming_driver_id, input.operating_company_id]
      );
      if (!assigned.rows[0]?.id) throw new Error("E_EQUIPMENT_TRANSFER_ASSIGN_FAILED");
      const equipmentLogId = await insertEquipmentTransferLog(client, userId, {
        equipmentId: transfer.equipment_id,
        transferId: input.transfer_id,
        fromDriverId: transfer.from_driver_id,
        toDriverId: input.confirming_driver_id,
        operatingCompanyId: input.operating_company_id,
      });
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
          equipment_log_id: equipmentLogId,
        },
        "info",
        "P5-F5-EQUIPMENT-TRANSFER"
      );
      return { id: input.transfer_id, status: "confirmed" };
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
    await setScopedCompanyContext(client, userId, input.operating_company_id);
    const transfer = await client.query<{ id: string; to_driver_id: string; status: string }>(
      `
        UPDATE mdata.equipment_transfers
        SET status = 'rejected',
            rejected_at = now(),
            rejection_reason = $4,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2::uuid
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
      await setScopedCompanyContext(client, userId, input.operating_company_id);
      values.push(input.operating_company_id);
      filters.push(`r.operating_company_id = $${values.length}::uuid`);
    }
    if (input.status) {
      values.push(input.status);
      filters.push(`r.status = $${values.length}`);
    }
    if (input.to_driver_id) {
      values.push(input.to_driver_id);
      filters.push(`r.to_driver_id = $${values.length}`);
    }
    const rows = await client.query(
      `
        SELECT r.*,
               e.equipment_number,
               NULLIF(TRIM(CONCAT(COALESCE(from_driver.first_name, ''), ' ', COALESCE(from_driver.last_name, ''))), '') AS from_driver_name,
               NULLIF(TRIM(CONCAT(COALESCE(to_driver.first_name, ''), ' ', COALESCE(to_driver.last_name, ''))), '') AS to_driver_name
        FROM mdata.equipment_transfers r
        LEFT JOIN mdata.equipment e
          ON e.id = r.equipment_id
         AND (e.owner_company_id = r.operating_company_id OR e.currently_leased_to_company_id = r.operating_company_id)
        LEFT JOIN mdata.drivers from_driver
          ON from_driver.id = r.from_driver_id
         AND (from_driver.operating_company_id = r.operating_company_id OR EXISTS (
               SELECT 1
               FROM mdata.driver_company_authorizations transfer_from_dca
               WHERE transfer_from_dca.driver_id = from_driver.id
                 AND transfer_from_dca.company_id = r.operating_company_id
                 AND transfer_from_dca.is_authorized = true
                 AND transfer_from_dca.deactivated_at IS NULL
             ))
        LEFT JOIN mdata.drivers to_driver
          ON to_driver.id = r.to_driver_id
         AND (to_driver.operating_company_id = r.operating_company_id OR EXISTS (
               SELECT 1
               FROM mdata.driver_company_authorizations transfer_to_dca
               WHERE transfer_to_dca.driver_id = to_driver.id
                 AND transfer_to_dca.company_id = r.operating_company_id
                 AND transfer_to_dca.is_authorized = true
                 AND transfer_to_dca.deactivated_at IS NULL
             ))
        ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY r.initiated_at DESC
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
      WHERE id = $1 AND operating_company_id = $2::uuid
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

async function writeDualAckNotes(
  client: { query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: R[] }> },
  input: { transferId: string; operatingCompanyId: string; priorNotes: string; nextNotes: string }
) {
  const updated = await client.query<{ id: string }>(
    `UPDATE mdata.equipment_transfers
        SET notes = $4, updated_at = now()
      WHERE id = $1
        AND operating_company_id = $2::uuid
        AND status = 'pending_to_confirm'
        AND COALESCE(notes, '') = $3
      RETURNING id::text AS id`,
    [input.transferId, input.operatingCompanyId, input.priorNotes, input.nextNotes]
  );
  if (!updated.rows[0]?.id) throw new Error("E_TRANSFER_ACK_WRITE_CONFLICT");
}

/** Append mdata.equipment_log on transfer completion (0242). event_type CHECK has no 'transfer'. */
async function insertEquipmentTransferLog(
  client: Parameters<Parameters<typeof withCurrentUser>[1]>[0],
  userId: string,
  args: {
    equipmentId: string;
    transferId: string;
    fromDriverId: string | null;
    toDriverId: string;
    operatingCompanyId: string;
  }
): Promise<string> {
  const notes = [
    "Equipment transfer completed:",
    `transfer=${args.transferId}`,
    args.fromDriverId ? `from_driver=${args.fromDriverId}` : null,
    `to_driver=${args.toDriverId}`,
    `operating_company_id=${args.operatingCompanyId}`,
  ]
    .filter(Boolean)
    .join(" ");
  const logRes = await client.query<{ id: string }>(
    `
      INSERT INTO mdata.equipment_log (
        equipment_id, event_type, event_at, notes, created_by_user_id, updated_by_user_id
      ) VALUES (
        $1::uuid, 'Moved', now(), $2::text, $3::uuid, $3::uuid
      )
      RETURNING id::text AS id
    `,
    [args.equipmentId, notes, userId]
  );
  const equipmentLogId = logRes.rows[0]?.id;
  if (!equipmentLogId) throw new Error("E_EQUIPMENT_TRANSFER_LOG_INSERT_FAILED");
  await appendCrudAudit(
    client,
    userId,
    "mdata.equipment_log.created",
    {
      resource_id: equipmentLogId,
      resource_type: "mdata.equipment_log",
      id: equipmentLogId,
      equipment_id: args.equipmentId,
      event_type: "Moved",
      transfer_id: args.transferId,
      from_driver_id: args.fromDriverId,
      to_driver_id: args.toDriverId,
      operating_company_id: args.operatingCompanyId,
    },
    "info",
    "P5-F5-EQUIPMENT-TRANSFER"
  );
  return equipmentLogId;
}

async function finalizeDualAckTransfer(
  client: Parameters<Parameters<typeof withCurrentUser>[1]>[0],
  userId: string,
  operatingCompanyId: string,
  transfer: Record<string, unknown>,
  receivingDriverId: string
) {
  const confirmed = await client.query<{ id: string }>(
    `UPDATE mdata.equipment_transfers
     SET status = 'confirmed', confirmed_at = now(), updated_at = now()
     WHERE id = $1 AND operating_company_id = $2::uuid AND status = 'pending_to_confirm'
     RETURNING id::text AS id`,
    [transfer.id, operatingCompanyId]
  );
  if (!confirmed.rows[0]?.id) throw new Error("E_EQUIPMENT_TRANSFER_CONFIRM_FAILED");
  const assigned = await client.query<{ id: string }>(
    `UPDATE mdata.equipment
     SET assigned_driver_id = $2, updated_at = now()
     WHERE id = $1
       AND (owner_company_id = $3::uuid OR currently_leased_to_company_id = $3::uuid)
     RETURNING id::text AS id`,
    [transfer.equipment_id, receivingDriverId, operatingCompanyId]
  );
  if (!assigned.rows[0]?.id) throw new Error("E_EQUIPMENT_TRANSFER_ASSIGN_FAILED");
  const equipmentLogId = await insertEquipmentTransferLog(client, userId, {
    equipmentId: String(transfer.equipment_id),
    transferId: String(transfer.id),
    fromDriverId: transfer.from_driver_id ? String(transfer.from_driver_id) : null,
    toDriverId: receivingDriverId,
    operatingCompanyId,
  });
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
      equipment_log_id: equipmentLogId,
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
    await setScopedCompanyContext(client, userId, input.operating_company_id);
      const transfer = await loadPendingTransfer(client, input);
      if (transfer.from_driver_id !== input.from_driver_id) throw new Error("E_TRANSFER_NOT_FROM_DRIVER");
      const state = parseDualAckNotes(String(transfer.notes ?? "")) ?? initialDualAckState();
      if (state.dropoff_ack_at) throw new Error("E_DROPOFF_ALREADY_ACKED");
      const next = withDropoffAck(state);
      const notes = encodeDualAckNotes(stripDualAckNotes(String(transfer.notes ?? "")), next);
      await writeDualAckNotes(client, {
        transferId: input.transfer_id,
        operatingCompanyId: input.operating_company_id,
        priorNotes: String(transfer.notes ?? ""),
        nextNotes: notes,
      });
      if (dualAckComplete(next)) await finalizeDualAckTransfer(client, userId, input.operating_company_id, transfer, input.from_driver_id);
      return enrichTransferRow({ id: input.transfer_id, status: dualAckComplete(next) ? "confirmed" : "pending_to_confirm", notes });
  });
}

export async function ackPickupTransfer(
  userId: string,
  input: { operating_company_id: string; transfer_id: string; to_driver_id: string }
) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, input.operating_company_id);
      const transfer = await loadPendingTransfer(client, input);
      if (transfer.to_driver_id !== input.to_driver_id) throw new Error("E_TRANSFER_NOT_ASSIGNED_TO_DRIVER");
      const state = parseDualAckNotes(String(transfer.notes ?? "")) ?? initialDualAckState();
      if (!state.dropoff_ack_at) throw new Error("E_DROPOFF_ACK_REQUIRED");
      if (state.pickup_ack_at) throw new Error("E_PICKUP_ALREADY_ACKED");
      const next = withPickupAck(state);
      const notes = encodeDualAckNotes(stripDualAckNotes(String(transfer.notes ?? "")), next);
      await writeDualAckNotes(client, {
        transferId: input.transfer_id,
        operatingCompanyId: input.operating_company_id,
        priorNotes: String(transfer.notes ?? ""),
        nextNotes: notes,
      });
      if (dualAckComplete(next)) await finalizeDualAckTransfer(client, userId, input.operating_company_id, transfer, input.to_driver_id);
      return enrichTransferRow({ id: input.transfer_id, status: dualAckComplete(next) ? "confirmed" : "pending_to_confirm", notes });
  });
}

export async function expireOldTransfers(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, operatingCompanyId);
    const res = await client.query<{ id: string }>(
      `
        UPDATE mdata.equipment_transfers
        SET status = 'expired',
            updated_at = now()
        WHERE operating_company_id = $1::uuid
          AND status = 'pending_to_confirm'
          AND expires_at < now()
        RETURNING id
      `,
      [operatingCompanyId]
    );
    return { expired_count: res.rows.length };
  });
}
