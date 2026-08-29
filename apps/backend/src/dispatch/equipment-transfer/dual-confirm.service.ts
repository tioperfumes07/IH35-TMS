import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { enqueueEquipmentTransferNotify } from "./notify.js";
import { setTransferCompanyScope, type Queryable } from "./request.service.js";

const BLOCK_ID = "GAP-37-EQUIPMENT-DUAL-CONFIRM";

export type ConfirmResult =
  | { kind: "ok"; uuid: string }
  | { kind: "not_found" }
  | { kind: "equipment_not_found" }
  | { kind: "driver_mismatch" }
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
      SELECT uuid::text, from_driver_uuid::text, to_driver_uuid::text, equipment_uuid::text,
             equipment_kind, status
      FROM dispatch.equipment_transfer_requests
      WHERE uuid = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [requestUuid, operatingCompanyId]
  );
  const req = row.rows[0];
  if (!req) return { kind: "not_found" };
  if (String(req.from_driver_uuid) !== driverUuid) return { kind: "driver_mismatch" };
  if (req.status !== "pending_outbound") return { kind: "invalid_status" };

  const transferUpdate = await client.query(
    `
      UPDATE dispatch.equipment_transfer_requests
      SET status = 'outbound_confirmed',
          outbound_confirmed_at = now(),
          outbound_evidence_uuid = $3::uuid
      WHERE uuid = $1::uuid
        AND operating_company_id = $2::uuid
        AND status = 'pending_outbound'
      RETURNING uuid::text
    `,
    [requestUuid, operatingCompanyId, evidenceUuid]
  );
  if (!transferUpdate.rows[0]?.uuid) return { kind: "invalid_status" };

  await appendCrudAudit(
    client as never,
    userId,
    "dispatch.equipment_transfer.outbound_confirmed",
    {
      resource_id: requestUuid,
      driver_uuid: driverUuid,
      evidence_uuid: evidenceUuid,
      operating_company_id: operatingCompanyId,
      wf047_dual_confirm: true,
    },
    "info",
    BLOCK_ID
  );

  // Confirm → notify initiator / from_driver.
  await enqueueEquipmentTransferNotify(client, {
    eventType: "dispatch.equipment_transfer.confirmed",
    operatingCompanyId,
    transferUuid: requestUuid,
    driverUuid: String(req.from_driver_uuid),
    title: "Equipment transfer outbound confirmed",
    message: `Outbound confirmation recorded for your ${String(req.equipment_kind ?? "equipment")} transfer.`,
    equipmentUuid: req.equipment_uuid ? String(req.equipment_uuid) : null,
    equipmentKind: req.equipment_kind ? String(req.equipment_kind) : null,
  });

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
      FOR UPDATE
    `,
    [requestUuid, operatingCompanyId]
  );
  const req = row.rows[0];
  if (!req) return { kind: "not_found" };
  if (String(req.to_driver_uuid) !== driverUuid) return { kind: "driver_mismatch" };
  if (req.status !== "outbound_confirmed") return { kind: "invalid_status" };

  const transferUpdate = await client.query(
    `
      UPDATE dispatch.equipment_transfer_requests
      SET status = 'completed',
          inbound_confirmed_at = now(),
          inbound_evidence_uuid = $3::uuid
      WHERE uuid = $1::uuid
        AND operating_company_id = $2::uuid
        AND status = 'outbound_confirmed'
      RETURNING uuid::text
    `,
    [requestUuid, operatingCompanyId, evidenceUuid]
  );
  if (!transferUpdate.rows[0]?.uuid) return { kind: "invalid_status" };

  const equipmentUpdate = await client.query(
    // §4 landmine: mdata.equipment has NO operating_company_id column (owner_company_id +
    // currently_leased_to_company_id are the real entity columns — migration 0015). The prior
    // `operating_company_id = $2` 42703'd → inbound transfer confirm 500'd. Scope by ownership/lease.
    `
      UPDATE mdata.equipment
      SET assigned_driver_id = $3::uuid, updated_at = now()
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      RETURNING id::text
    `,
    [req.equipment_uuid, operatingCompanyId, req.to_driver_uuid]
  );
  if (!equipmentUpdate.rows[0]?.id) return { kind: "equipment_not_found" };

  // Domain equipment activity log (0242 / biz-flow-8). event_type CHECK only allows
  // Coupled|Uncoupled|Moved|StatusChange|MaintenanceStart|MaintenanceEnd|Note — use Moved
  // for driver reassignment; from/to drivers live in notes (table has no driver columns).
  const logRes = await client.query(
    `
      INSERT INTO mdata.equipment_log (
        equipment_id, event_type, event_at, notes, created_by_user_id, updated_by_user_id
      ) VALUES (
        $1::uuid,
        'Moved',
        now(),
        $2::text,
        $3::uuid,
        $3::uuid
      )
      RETURNING id::text
    `,
    [
      req.equipment_uuid,
      `Equipment transfer completed: transfer_request=${requestUuid} from_driver=${req.from_driver_uuid} to_driver=${req.to_driver_uuid} operating_company_id=${operatingCompanyId}`,
      userId,
    ]
  );
  const equipmentLogId = String(logRes.rows[0]?.id ?? "");
  if (!equipmentLogId) throw new Error("equipment_log_create_failed");

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
      wf047_dual_confirm: true,
      audit_chain: {
        outbound_evidence_uuid: req.outbound_evidence_uuid,
        inbound_evidence_uuid: evidenceUuid,
      },
    },
    "info",
    BLOCK_ID
  );

  await appendCrudAudit(
    client as never,
    userId,
    "dispatch.equipment_transfer.completed",
    {
      resource_id: requestUuid,
      equipment_uuid: req.equipment_uuid,
      assigned_driver_uuid: req.to_driver_uuid,
      operating_company_id: operatingCompanyId,
      equipment_log_id: equipmentLogId || undefined,
    },
    "info",
    BLOCK_ID
  );

  await appendCrudAudit(
      client as never,
      userId,
      "mdata.equipment_log.created",
      {
        resource_id: equipmentLogId,
        resource_type: "mdata.equipment_log",
        id: equipmentLogId,
        equipment_id: req.equipment_uuid,
        event_type: "Moved",
        transfer_request_uuid: requestUuid,
        from_driver_uuid: req.from_driver_uuid,
        to_driver_uuid: req.to_driver_uuid,
        operating_company_id: operatingCompanyId,
      },
      "info",
      BLOCK_ID
  );

  // Confirm (completed) → notify initiator / from_driver.
  if (req.from_driver_uuid) {
    await enqueueEquipmentTransferNotify(client, {
      eventType: "dispatch.equipment_transfer.confirmed",
      operatingCompanyId,
      transferUuid: requestUuid,
      driverUuid: String(req.from_driver_uuid),
      title: "Equipment transfer completed",
      message: `Inbound confirmation completed; equipment was transferred successfully.`,
      equipmentUuid: req.equipment_uuid ? String(req.equipment_uuid) : null,
      equipmentKind: null,
    });
  }

  return { kind: "ok", uuid: requestUuid };
}

export async function confirmOutboundForUser(
  userId: string,
  operatingCompanyId: string,
  requestUuid: string,
  driverUuid: string,
  evidenceUuid: string
) {
  return withCurrentUser(userId, async (client) => {
    await setTransferCompanyScope(client, operatingCompanyId);
    return confirmOutbound(client, userId, operatingCompanyId, requestUuid, driverUuid, evidenceUuid);
  });
}

export async function confirmInboundForUser(
  userId: string,
  operatingCompanyId: string,
  requestUuid: string,
  driverUuid: string,
  evidenceUuid: string
) {
  return withCurrentUser(userId, async (client) => {
    await setTransferCompanyScope(client, operatingCompanyId);
    return confirmInbound(client, userId, operatingCompanyId, requestUuid, driverUuid, evidenceUuid);
  });
}
