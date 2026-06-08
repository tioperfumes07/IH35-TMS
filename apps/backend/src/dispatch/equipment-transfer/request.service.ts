import { appendCrudAudit } from "../../audit/crud-audit.js";

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
  created_at: string;
};

const BLOCK_ID = "GAP-37-EQUIPMENT-DUAL-CONFIRM";

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
      wf047: true,
    },
    "info",
    BLOCK_ID
  );
  return uuid;
}

export async function listPendingForDriver(
  client: Queryable,
  operatingCompanyId: string,
  driverUuid: string,
  direction: "outbound" | "inbound"
): Promise<TransferRequestRow[]> {
  const status = direction === "outbound" ? "pending_outbound" : "outbound_confirmed";
  const driverCol = direction === "outbound" ? "from_driver_uuid" : "to_driver_uuid";
  const res = await client.query(
    `
      SELECT uuid::text, operating_company_id::text, equipment_uuid::text, equipment_kind,
             from_driver_uuid::text, to_driver_uuid::text, status, transfer_location, created_at::text
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
        AND status IN ('pending_outbound', 'outbound_confirmed')
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
             from_driver_uuid::text, to_driver_uuid::text, status, transfer_location, created_at::text
      FROM dispatch.equipment_transfer_requests
      WHERE operating_company_id = $1::uuid
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY created_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows as TransferRequestRow[];
}
