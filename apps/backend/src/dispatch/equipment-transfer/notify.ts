import type { Queryable } from "./request.service.js";

export type EquipmentTransferNotifyEvent =
  | "dispatch.equipment_transfer.requested"
  | "dispatch.equipment_transfer.confirmed"
  | "dispatch.equipment_transfer.rejected";

/**
 * Enqueue transfer lifecycle notification via outbox + optional PWA inbox row.
 * Mirrors driver-finance cash-advance notify (outbox trail + pwa.driver_notifications).
 */
export async function enqueueEquipmentTransferNotify(
  client: Queryable,
  args: {
    eventType: EquipmentTransferNotifyEvent;
    operatingCompanyId: string;
    transferUuid: string;
    driverUuid: string;
    title: string;
    message: string;
    equipmentUuid?: string | null;
    equipmentKind?: string | null;
  }
): Promise<void> {
  /* outbox-handler-parity: literal-types=["dispatch.equipment_transfer.requested","dispatch.equipment_transfer.confirmed","dispatch.equipment_transfer.rejected"] */
  await client.query(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at)
      VALUES ($1, $2::jsonb, now())
    `,
    [
      args.eventType,
      JSON.stringify({
        operating_company_id: args.operatingCompanyId,
        transfer_uuid: args.transferUuid,
        driver_uuid: args.driverUuid,
        equipment_uuid: args.equipmentUuid ?? null,
        equipment_kind: args.equipmentKind ?? null,
        title: args.title,
        message: args.message,
      }),
    ]
  );

  const reg = await client.query(`SELECT to_regclass('pwa.driver_notifications') IS NOT NULL AS ok`);
  if (!reg.rows[0]?.ok) return;

  await client.query(
    `
      INSERT INTO pwa.driver_notifications (
        operating_company_id, driver_id, title, message, payload
      ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)
    `,
    [
      args.operatingCompanyId,
      args.driverUuid,
      args.title,
      args.message,
      JSON.stringify({
        kind: args.eventType,
        transfer_uuid: args.transferUuid,
        equipment_uuid: args.equipmentUuid ?? null,
        equipment_kind: args.equipmentKind ?? null,
      }),
    ]
  );
}
