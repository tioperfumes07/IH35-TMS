import { insertDriverPwaNotification } from "../../pwa/driver-notifications.js";

export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

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
  const outboxEvent = await client.query(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at)
      VALUES ($1, $2::jsonb, now())
      RETURNING id::text
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
  if (!outboxEvent.rows[0]?.id) throw new Error("equipment_transfer_outbox_enqueue_failed");

  // LV-DRIVER-PWA-NOTIFY-SILENTLY-DROPPED — never bare-return when table absent.
  await insertDriverPwaNotification(client, {
    operatingCompanyId: args.operatingCompanyId,
    driverId: args.driverUuid,
    title: args.title,
    message: args.message,
    payload: {
      kind: args.eventType,
      transfer_uuid: args.transferUuid,
      equipment_uuid: args.equipmentUuid ?? null,
      equipment_kind: args.equipmentKind ?? null,
    },
  });
}
