import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { enqueueEquipmentTransferNotify } from "./notify.js";

export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type TransferRequestRow = {
  uuid: string;
  operating_company_id: string;
  equipment_uuid: string;
  equipment_kind: string;
  equipment_number?: string | null;
  from_driver_uuid: string | null;
  to_driver_uuid: string | null;
  status: string;
  transfer_location: string;
  outbound_confirmed_at?: string | null;
  outbound_evidence_uuid?: string | null;
  inbound_confirmed_at?: string | null;
  inbound_evidence_uuid?: string | null;
  created_at: string;
  /** Human driver names, joined for display. NULL only when the driver row is gone —
   *  the FE falls back to a truncated uuid ONLY then, so a uuid on screen means MISSING DATA. */
  from_driver_name?: string | null;
  to_driver_name?: string | null;
};

const BLOCK_ID = "GAP-37-EQUIPMENT-DUAL-CONFIRM";

export async function setTransferCompanyScope(client: Queryable, operatingCompanyId: string) {
  await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
}

export async function initiateTransfer(
  client: Queryable,
  userId: string,
  input: {
    operating_company_id: string;
    equipment_uuid: string;
    equipment_kind: "trailer" | "chassis";
    from_driver_uuid: string;
    to_driver_uuid: string;
    transfer_location: string;
    notes?: string;
  }
): Promise<string> {
  const drivers = await client.query(
    `
      SELECT id::text
      FROM mdata.drivers
      WHERE id = ANY($1::uuid[])
        AND operating_company_id = $2::uuid
        AND deactivated_at IS NULL
    `,
    [[input.from_driver_uuid, input.to_driver_uuid], input.operating_company_id]
  );
  if (drivers.rows.length !== 2) throw new Error("driver_not_in_company");

  const equipment = await client.query(
    `
      SELECT id::text, equipment_type
      FROM mdata.equipment
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [input.equipment_uuid, input.operating_company_id]
  );
  if (!equipment.rows[0]) throw new Error("equipment_not_found");
  const actualKind = String(equipment.rows[0].equipment_type ?? "") === "Chassis" ? "chassis" : "trailer";
  if (actualKind !== input.equipment_kind) throw new Error("equipment_kind_mismatch");

  const pending = await client.query(
    `
      SELECT uuid::text
      FROM dispatch.equipment_transfer_requests
      WHERE equipment_uuid = $1::uuid
        AND operating_company_id = $2::uuid
        AND status IN ('pending_outbound', 'outbound_confirmed', 'inbound_confirmed')
      LIMIT 1
    `,
    [input.equipment_uuid, input.operating_company_id]
  );
  if (pending.rows[0]) throw new Error("transfer_already_active");

  const res = await client.query(
    `
      INSERT INTO dispatch.equipment_transfer_requests (
        operating_company_id, equipment_uuid, equipment_kind,
        from_driver_uuid, to_driver_uuid, initiated_by_user_uuid,
        transfer_location, status, notes
      )
      VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6::uuid, $7, 'pending_outbound', $8)
      RETURNING uuid::text
    `,
    [
      input.operating_company_id,
      input.equipment_uuid,
      input.equipment_kind,
      input.from_driver_uuid,
      input.to_driver_uuid,
      userId,
      input.transfer_location,
      input.notes ?? null,
    ]
  );
  const uuid = String(res.rows[0]?.uuid ?? "");
  if (!uuid) throw new Error("transfer_create_failed");
  await appendCrudAudit(
    client as never,
    userId,
    "dispatch.equipment_transfer.initiated",
    {
      resource_type: "dispatch.equipment_transfer_requests",
      resource_id: uuid,
      operating_company_id: input.operating_company_id,
      wf047_dual_confirm: true,
    },
    "info",
    BLOCK_ID
  );

  // Notify receiving driver (to_driver) that a transfer was requested.
  await enqueueEquipmentTransferNotify(client, {
    eventType: "dispatch.equipment_transfer.requested",
    operatingCompanyId: input.operating_company_id,
    transferUuid: uuid,
    driverUuid: input.to_driver_uuid,
    title: "Equipment transfer requested",
    message: `A ${input.equipment_kind} transfer at ${input.transfer_location} is waiting for your confirmation.`,
    equipmentUuid: input.equipment_uuid,
    equipmentKind: input.equipment_kind,
  });

  return uuid;
}

export async function listPendingForDriver(
  client: Queryable,
  operatingCompanyId: string,
  driverUuid?: string,
  direction?: "outbound" | "inbound" | "both",
  equipmentUuid?: string,
  requestUuid?: string
): Promise<TransferRequestRow[]> {
  if (requestUuid) {
    const res = await client.query(
      `
        SELECT r.uuid::text, r.operating_company_id::text, r.equipment_uuid::text, r.equipment_kind,
               e.equipment_number,
               r.from_driver_uuid::text, r.to_driver_uuid::text, r.status, r.transfer_location,
               r.outbound_confirmed_at::text, r.outbound_evidence_uuid::text,
               r.inbound_confirmed_at::text, r.inbound_evidence_uuid::text, r.created_at::text,
               NULLIF(TRIM(CONCAT_WS(' ', fd.first_name, fd.last_name)), '') AS from_driver_name,
               NULLIF(TRIM(CONCAT_WS(' ', td.first_name, td.last_name)), '') AS to_driver_name
        FROM dispatch.equipment_transfer_requests r
        LEFT JOIN mdata.drivers fd ON fd.id = r.from_driver_uuid AND (fd.operating_company_id = r.operating_company_id OR EXISTS (
          SELECT 1 FROM mdata.driver_company_authorizations request_from_dca
          WHERE request_from_dca.driver_id = fd.id AND request_from_dca.company_id = r.operating_company_id
            AND request_from_dca.is_authorized = true AND request_from_dca.deactivated_at IS NULL
        ))
        LEFT JOIN mdata.drivers td ON td.id = r.to_driver_uuid AND (td.operating_company_id = r.operating_company_id OR EXISTS (
          SELECT 1 FROM mdata.driver_company_authorizations request_to_dca
          WHERE request_to_dca.driver_id = td.id AND request_to_dca.company_id = r.operating_company_id
            AND request_to_dca.is_authorized = true AND request_to_dca.deactivated_at IS NULL
        ))
        LEFT JOIN mdata.equipment e ON e.id = r.equipment_uuid
                                   AND (e.owner_company_id = r.operating_company_id OR e.currently_leased_to_company_id = r.operating_company_id)
        WHERE r.operating_company_id = $1::uuid
          AND r.uuid = $2::uuid
        LIMIT 1
      `,
      [operatingCompanyId, requestUuid]
    );
    return res.rows as TransferRequestRow[];
  }
  if (equipmentUuid) {
    const res = await client.query(
      `
        SELECT r.uuid::text, r.operating_company_id::text, r.equipment_uuid::text, r.equipment_kind,
               e.equipment_number,
               r.from_driver_uuid::text, r.to_driver_uuid::text, r.status, r.transfer_location,
               r.outbound_confirmed_at::text, r.outbound_evidence_uuid::text,
               r.inbound_confirmed_at::text, r.inbound_evidence_uuid::text, r.created_at::text,
               NULLIF(TRIM(CONCAT_WS(' ', fd.first_name, fd.last_name)), '') AS from_driver_name,
               NULLIF(TRIM(CONCAT_WS(' ', td.first_name, td.last_name)), '') AS to_driver_name
        FROM dispatch.equipment_transfer_requests r
        LEFT JOIN mdata.drivers fd ON fd.id = r.from_driver_uuid AND (fd.operating_company_id = r.operating_company_id OR EXISTS (
          SELECT 1 FROM mdata.driver_company_authorizations request_from_dca
          WHERE request_from_dca.driver_id = fd.id AND request_from_dca.company_id = r.operating_company_id
            AND request_from_dca.is_authorized = true AND request_from_dca.deactivated_at IS NULL
        ))
        LEFT JOIN mdata.drivers td ON td.id = r.to_driver_uuid AND (td.operating_company_id = r.operating_company_id OR EXISTS (
          SELECT 1 FROM mdata.driver_company_authorizations request_to_dca
          WHERE request_to_dca.driver_id = td.id AND request_to_dca.company_id = r.operating_company_id
            AND request_to_dca.is_authorized = true AND request_to_dca.deactivated_at IS NULL
        ))
        LEFT JOIN mdata.equipment e ON e.id = r.equipment_uuid
                                   AND (e.owner_company_id = r.operating_company_id OR e.currently_leased_to_company_id = r.operating_company_id)
        WHERE r.operating_company_id = $1::uuid
          AND r.equipment_uuid = $2::uuid
        ORDER BY r.created_at DESC
      `,
      [operatingCompanyId, equipmentUuid]
    );
    return res.rows as TransferRequestRow[];
  }
  if (!driverUuid) {
    return listInProgress(client, operatingCompanyId);
  }

  if (direction === "both") {
    const res = await client.query(
      `
        SELECT r.uuid::text, r.operating_company_id::text, r.equipment_uuid::text, r.equipment_kind,
               e.equipment_number,
               r.from_driver_uuid::text, r.to_driver_uuid::text, r.status, r.transfer_location,
               r.outbound_confirmed_at::text, r.inbound_confirmed_at::text, r.created_at::text,
               NULLIF(TRIM(CONCAT_WS(' ', fd.first_name, fd.last_name)), '') AS from_driver_name,
               NULLIF(TRIM(CONCAT_WS(' ', td.first_name, td.last_name)), '') AS to_driver_name
        FROM dispatch.equipment_transfer_requests r
        LEFT JOIN mdata.drivers fd ON fd.id = r.from_driver_uuid AND (fd.operating_company_id = r.operating_company_id OR EXISTS (
          SELECT 1 FROM mdata.driver_company_authorizations request_from_dca
          WHERE request_from_dca.driver_id = fd.id AND request_from_dca.company_id = r.operating_company_id
            AND request_from_dca.is_authorized = true AND request_from_dca.deactivated_at IS NULL
        ))
        LEFT JOIN mdata.drivers td ON td.id = r.to_driver_uuid AND (td.operating_company_id = r.operating_company_id OR EXISTS (
          SELECT 1 FROM mdata.driver_company_authorizations request_to_dca
          WHERE request_to_dca.driver_id = td.id AND request_to_dca.company_id = r.operating_company_id
            AND request_to_dca.is_authorized = true AND request_to_dca.deactivated_at IS NULL
        ))
        LEFT JOIN mdata.equipment e ON e.id = r.equipment_uuid
                                   AND (e.owner_company_id = r.operating_company_id OR e.currently_leased_to_company_id = r.operating_company_id)
        WHERE r.operating_company_id = $1::uuid
          AND (r.from_driver_uuid = $2::uuid OR r.to_driver_uuid = $2::uuid)
        ORDER BY r.created_at DESC
      `,
      [operatingCompanyId, driverUuid]
    );
    return res.rows as TransferRequestRow[];
  }

  const dir = direction ?? "outbound";
  const status = dir === "outbound" ? "pending_outbound" : "outbound_confirmed";
  const driverCol = dir === "outbound" ? "from_driver_uuid" : "to_driver_uuid";
  const res = await client.query(
    `
      SELECT r.uuid::text, r.operating_company_id::text, r.equipment_uuid::text, r.equipment_kind,
             e.equipment_number,
             r.from_driver_uuid::text, r.to_driver_uuid::text, r.status, r.transfer_location,
             r.outbound_confirmed_at::text, r.outbound_evidence_uuid::text,
             r.inbound_confirmed_at::text, r.inbound_evidence_uuid::text,
             r.created_at::text,
             -- Raw-uuid display class: this list rendered from_driver_uuid.slice(0,8) — an opaque hex
             -- fragment where the driver's NAME was one LEFT JOIN away.
             NULLIF(TRIM(CONCAT_WS(' ', fd.first_name, fd.last_name)), '') AS from_driver_name,
             NULLIF(TRIM(CONCAT_WS(' ', td.first_name, td.last_name)), '') AS to_driver_name
      FROM dispatch.equipment_transfer_requests r
      LEFT JOIN mdata.drivers fd ON fd.id = r.from_driver_uuid AND (fd.operating_company_id = r.operating_company_id OR EXISTS (
        SELECT 1 FROM mdata.driver_company_authorizations request_from_dca
        WHERE request_from_dca.driver_id = fd.id AND request_from_dca.company_id = r.operating_company_id
          AND request_from_dca.is_authorized = true AND request_from_dca.deactivated_at IS NULL
      ))
      LEFT JOIN mdata.drivers td ON td.id = r.to_driver_uuid AND (td.operating_company_id = r.operating_company_id OR EXISTS (
        SELECT 1 FROM mdata.driver_company_authorizations request_to_dca
        WHERE request_to_dca.driver_id = td.id AND request_to_dca.company_id = r.operating_company_id
          AND request_to_dca.is_authorized = true AND request_to_dca.deactivated_at IS NULL
      ))
      LEFT JOIN mdata.equipment e ON e.id = r.equipment_uuid
                                 AND (e.owner_company_id = r.operating_company_id
                                      OR e.currently_leased_to_company_id = r.operating_company_id)
      WHERE r.operating_company_id = $1::uuid
        AND r.${driverCol} = $2::uuid
        AND r.status = $3
      ORDER BY r.created_at DESC
    `,
    [operatingCompanyId, driverUuid, status]
  );
  return res.rows as TransferRequestRow[];
}

export async function cancelTransfer(
  client: Queryable,
  userId: string,
  operatingCompanyId: string,
  requestUuid: string
): Promise<boolean> {
  const res = await client.query(
    `
      UPDATE dispatch.equipment_transfer_requests
      SET status = 'cancelled'
      WHERE uuid = $1::uuid
        AND operating_company_id = $2::uuid
        AND status IN ('pending_outbound', 'outbound_confirmed', 'inbound_confirmed')
      RETURNING uuid::text, from_driver_uuid::text, equipment_uuid::text, equipment_kind, transfer_location
    `,
    [requestUuid, operatingCompanyId]
  );
  if (!res.rows[0]) return false;
  await appendCrudAudit(
    client as never,
    userId,
    "dispatch.equipment_transfer.cancelled",
    { resource_id: requestUuid, operating_company_id: operatingCompanyId },
    "info",
    BLOCK_ID
  );

  // Reject/cancel → notify initiator / from_driver.
  const fromDriverUuid = res.rows[0].from_driver_uuid ? String(res.rows[0].from_driver_uuid) : "";
  if (fromDriverUuid) {
    await enqueueEquipmentTransferNotify(client, {
      eventType: "dispatch.equipment_transfer.rejected",
      operatingCompanyId,
      transferUuid: requestUuid,
      driverUuid: fromDriverUuid,
      title: "Equipment transfer cancelled",
      message: `The ${String(res.rows[0].equipment_kind ?? "equipment")} transfer was cancelled.`,
      equipmentUuid: res.rows[0].equipment_uuid ? String(res.rows[0].equipment_uuid) : null,
      equipmentKind: res.rows[0].equipment_kind ? String(res.rows[0].equipment_kind) : null,
    });
  }

  return true;
}

export async function listInProgress(
  client: Queryable,
  operatingCompanyId: string
): Promise<TransferRequestRow[]> {
  const res = await client.query(
    `
      SELECT r.uuid::text, r.operating_company_id::text, r.equipment_uuid::text, r.equipment_kind,
             e.equipment_number,
             r.from_driver_uuid::text, r.to_driver_uuid::text, r.status, r.transfer_location,
             r.outbound_confirmed_at::text, r.outbound_evidence_uuid::text,
             r.inbound_confirmed_at::text, r.inbound_evidence_uuid::text,
             r.created_at::text,
             -- Raw-uuid display class: this list rendered from_driver_uuid.slice(0,8) — an opaque hex
             -- fragment where the driver's NAME was one LEFT JOIN away.
             NULLIF(TRIM(CONCAT_WS(' ', fd.first_name, fd.last_name)), '') AS from_driver_name,
             NULLIF(TRIM(CONCAT_WS(' ', td.first_name, td.last_name)), '') AS to_driver_name
      FROM dispatch.equipment_transfer_requests r
      LEFT JOIN mdata.drivers fd ON fd.id = r.from_driver_uuid AND (fd.operating_company_id = r.operating_company_id OR EXISTS (
        SELECT 1 FROM mdata.driver_company_authorizations request_from_dca
        WHERE request_from_dca.driver_id = fd.id AND request_from_dca.company_id = r.operating_company_id
          AND request_from_dca.is_authorized = true AND request_from_dca.deactivated_at IS NULL
      ))
      LEFT JOIN mdata.drivers td ON td.id = r.to_driver_uuid AND (td.operating_company_id = r.operating_company_id OR EXISTS (
        SELECT 1 FROM mdata.driver_company_authorizations request_to_dca
        WHERE request_to_dca.driver_id = td.id AND request_to_dca.company_id = r.operating_company_id
          AND request_to_dca.is_authorized = true AND request_to_dca.deactivated_at IS NULL
      ))
      LEFT JOIN mdata.equipment e ON e.id = r.equipment_uuid
                                 AND (e.owner_company_id = r.operating_company_id
                                      OR e.currently_leased_to_company_id = r.operating_company_id)
      WHERE r.operating_company_id = $1::uuid
        AND r.status NOT IN ('completed', 'cancelled')
      ORDER BY r.created_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows as TransferRequestRow[];
}

export async function initiateTransferForUser(
  userId: string,
  input: Parameters<typeof initiateTransfer>[2]
) {
  return withCurrentUser(userId, async (client) => {
    await setTransferCompanyScope(client, input.operating_company_id);
    const uuid = await initiateTransfer(client, userId, input);
    return { uuid };
  });
}

export async function listPendingForDriverForUser(
  userId: string,
  operatingCompanyId: string,
  driverUuid?: string,
  direction?: "outbound" | "inbound" | "both",
  equipmentUuid?: string,
  requestUuid?: string
) {
  return withCurrentUser(userId, async (client) => {
    await setTransferCompanyScope(client, operatingCompanyId);
    const requests = await listPendingForDriver(client, operatingCompanyId, driverUuid, direction, equipmentUuid, requestUuid);
    return { requests };
  });
}

export async function cancelTransferForUser(
  userId: string,
  operatingCompanyId: string,
  requestUuid: string
) {
  return withCurrentUser(userId, async (client) => {
    await setTransferCompanyScope(client, operatingCompanyId);
    const ok = await cancelTransfer(client, userId, operatingCompanyId, requestUuid);
    return { ok };
  });
}
