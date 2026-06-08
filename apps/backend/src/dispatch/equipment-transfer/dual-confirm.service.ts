import { appendCrudAudit } from "../../audit/crud-audit.js";
import type { Queryable } from "./request.service.js";

const BLOCK_ID = "GAP-37-EQUIPMENT-DUAL-CONFIRM";

export type ConfirmResult =
  | { kind: "ok"; uuid: string }
  | { kind: "not_found" }
  | { kind: "wrong_driver" }
  | { kind: "invalid_status" };

export async function confirmOutbound(
  client: Queryable,
  userId: string,
  operatingCompanyId: string,
  requestUuid: string,
  driverUuid: string,
  evidenceUuid: string
): Promise<ConfirmResult> {
  const row = await client.query(
    `
      SELECT uuid::text, from_driver_uuid::text, status
      FROM dispatch.equipment_transfer_requests
      WHERE uuid = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [requestUuid, operatingCompanyId]
  );
  const req = row.rows[0];
  if (!req) return { kind: "not_found" };
  if (String(req.from_driver_uuid) !== driverUuid) return { kind: "wrong_driver" as const, reason: "driver_mismatch" };
  if (req.status !== "pending_outbound") return { kind: "invalid_status" };

  await client.query(
    `
      UPDATE dispatch.equipment_transfer_requests
      SET status = 'outbound_confirmed',
          outbound_confirmed_at = now(),
          outbound_evidence_uuid = $3::uuid
      WHERE uuid = $1::uuid AND operating_company_id = $2::uuid
    `,
    [requestUuid, operatingCompanyId, evidenceUuid]
  );

  await appendCrudAudit(
    client as never,
    userId,
    "dispatch.equipment_transfer.outbound_confirmed",
    {
      resource_id: requestUuid,
      driver_uuid: driverUuid,
      evidence_uuid: evidenceUuid,
      operating_company_id: operatingCompanyId,
      wf047_outbound: true,
    },
    "info",
    BLOCK_ID
  );
  return { kind: "ok", uuid: requestUuid };
}

export async function confirmInbound(
  client: Queryable,
  userId: string,
  operatingCompanyId: string,
  requestUuid: string,
  driverUuid: string,
  evidenceUuid: string
): Promise<ConfirmResult> {
  const row = await client.query(
    `
      SELECT uuid::text, to_driver_uuid::text, from_driver_uuid::text, equipment_uuid::text, status,
             outbound_evidence_uuid::text
      FROM dispatch.equipment_transfer_requests
      WHERE uuid = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [requestUuid, operatingCompanyId]
  );
  const req = row.rows[0];
  if (!req) return { kind: "not_found" };
  if (String(req.to_driver_uuid) !== driverUuid) return { kind: "wrong_driver" as const, reason: "driver_mismatch" };
  if (req.status !== "outbound_confirmed") return { kind: "invalid_status" };

  await client.query(
    `
      UPDATE dispatch.equipment_transfer_requests
      SET status = 'completed',
          inbound_confirmed_at = now(),
          inbound_evidence_uuid = $3::uuid
      WHERE uuid = $1::uuid AND operating_company_id = $2::uuid
    `,
    [requestUuid, operatingCompanyId, evidenceUuid]
  );

  await client.query(
    `
      UPDATE mdata.equipment
      SET assigned_driver_id = $3::uuid, updated_at = now()
      WHERE id = $1::uuid
    `,
    [req.equipment_uuid, operatingCompanyId, req.to_driver_uuid]
  ).catch(() => ({ rows: [] }));

  await appendCrudAudit(
    client as never,
    userId,
    "dispatch.equipment_transfer.inbound_confirmed",
    {
      resource_id: requestUuid,
      driver_uuid: driverUuid,
      evidence_uuid: evidenceUuid,
      outbound_evidence_uuid: req.outbound_evidence_uuid,
      equipment_uuid: req.equipment_uuid,
      operating_company_id: operatingCompanyId,
      wf047_inbound: true,
      wf047_chain_complete: true,
      audit_chain: {
        outbound_evidence_uuid: req.outbound_evidence_uuid,
        inbound_evidence_uuid: evidenceUuid,
      },
    },
    "info",
    BLOCK_ID
  );
  return { kind: "ok", uuid: requestUuid };
}
