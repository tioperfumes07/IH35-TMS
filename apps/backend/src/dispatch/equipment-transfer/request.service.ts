import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";

export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type TransferRequestRow = {
  uuid: string;
  operating_company_id: string;
  equipment_uuid: string;
  equipment_kind: string;
  from_driver_uuid: string | null;
  to_driver_uuid: string | null;
  status: string;
  transfer_location: string;
  outbound_confirmed_at?: string | null;
  outbound_evidence_uuid?: string | null;
  inbound_confirmed_at?: string | null;
  inbound_evidence_uuid?: string | null;
  created_at: string;
};

const BLOCK_ID = "GAP-37-EQUIPMENT-DUAL-CONFIRM";

export async function setTransferCompanyScope(client: Queryable, operatingCompanyId: string) {
  await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
}

export async function initiateTransfer(
  client: Queryable,
  userId: string,
  input: {
    operating_company_id: string;
    equipment_uuid: string;
    equipment_kind: "truck" | "trailer" | "chassis";
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
      SELECT id::text
      FROM mdata.equipment
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.equipment_uuid, input.operating_company_id]
  );
  if (!equipment.rows[0]) throw new Error("equipment_not_found");

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
  return uuid;
}

export async function listPendingForDriver(
  client: Queryable,
  operatingCompanyId: string,
  driverUuid?: string,
  direction?: "outbound" | "inbound"
): Promise<TransferRequestRow[]> {
  if (!driverUuid) {
    return listInProgress(client, operatingCompanyId);
  }

  const dir = direction ?? "outbound";
  const status = dir === "outbound" ? "pending_outbound" : "outbound_confirmed";
  const driverCol = dir === "outbound" ? "from_driver_uuid" : "to_driver_uuid";
  const res = await client.query(
    `
      SELECT uuid::text, operating_company_id::text, equipment_uuid::text, equipment_kind,
             from_driver_uuid::text, to_driver_uuid::text, status, transfer_location,
             outbound_confirmed_at::text, outbound_evidence_uuid::text,
             inbound_confirmed_at::text, inbound_evidence_uuid::text,
             created_at::text
      FROM dispatch.equipment_transfer_requests
      WHERE operating_company_id = $1::uuid
        AND ${driverCol} = $2::uuid
        AND status = $3
      ORDER BY created_at DESC
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
      RETURNING uuid::text
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
  return true;
}

export async function listInProgress(
  client: Queryable,
  operatingCompanyId: string
): Promise<TransferRequestRow[]> {
  const res = await client.query(
    `
      SELECT uuid::text, operating_company_id::text, equipment_uuid::text, equipment_kind,
             from_driver_uuid::text, to_driver_uuid::text, status, transfer_location,
             outbound_confirmed_at::text, outbound_evidence_uuid::text,
             inbound_confirmed_at::text, inbound_evidence_uuid::text,
             created_at::text
      FROM dispatch.equipment_transfer_requests
      WHERE operating_company_id = $1::uuid
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY created_at DESC
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
  direction?: "outbound" | "inbound"
) {
  return withCurrentUser(userId, async (client) => {
    await setTransferCompanyScope(client, operatingCompanyId);
    const requests = await listPendingForDriver(client, operatingCompanyId, driverUuid, direction);
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
