/**
 * LV-DRIVER-PWA-NOTIFY-SILENTLY-DROPPED — shared insert for pwa.driver_notifications.
 * Never bare-return when the table is missing: record an outbox undelivered event.
 */

export type QueryableClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type DriverPwaNotificationArgs = {
  operatingCompanyId: string;
  driverId: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
};

/**
 * Insert a driver PWA inbox row when the relation exists.
 * If absent, enqueue `pwa.driver_notification.undelivered` so the drop is auditable.
 * Returns true when a row was inserted, false when recorded as undelivered.
 */
export async function insertDriverPwaNotification(
  client: QueryableClient,
  args: DriverPwaNotificationArgs
): Promise<boolean> {
  const reg = await client.query(
    `SELECT to_regclass('pwa.driver_notifications') IS NOT NULL AS ok`
  );
  const ok = Boolean((reg.rows[0] as { ok?: boolean } | undefined)?.ok);
  if (!ok) {
    // Fail-loud signal (not silent): durable outbox row + declared unavailable code in payload.
    const undelivered = await client.query(
      `
        INSERT INTO outbox.events (event_type, payload, next_retry_at)
        VALUES ($1, $2::jsonb, now())
        RETURNING id::text
      `,
      [
        "pwa.driver_notification.undelivered",
        JSON.stringify({
          code: "E_PWA_DRIVER_NOTIFICATIONS_UNAVAILABLE",
          operating_company_id: args.operatingCompanyId,
          driver_id: args.driverId,
          title: args.title,
          message: args.message,
          payload: args.payload,
        }),
      ]
    );
    if (!undelivered.rows[0]?.id) throw new Error("pwa_driver_notification_undelivered_enqueue_failed");
    return false;
  }

  const inserted = await client.query(
    `
      INSERT INTO pwa.driver_notifications (operating_company_id, driver_id, title, message, payload)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)
      RETURNING id::text
    `,
    [
      args.operatingCompanyId,
      args.driverId,
      args.title,
      args.message,
      JSON.stringify(args.payload),
    ]
  );
  if (!inserted.rows[0]?.id) throw new Error("pwa_driver_notification_insert_failed");
  return true;
}
