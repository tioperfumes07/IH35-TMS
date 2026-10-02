/**
 * ENGINE: Samsara driver login stamp — moves mdata.drivers.last_samsara_login_at forward from observed ELD activity
 * SCHEDULE: on demand — integrations/samsara/webhook-projectors/hos-projector.ts (HOS webhook) and vehicle-driver-pairing/pairing.service.ts (syncFromSamsara, run by cron/samsara-positions-cron.ts)
 * WRITES: mdata.drivers (last_samsara_login_at, updated_at)
 * IDEMPOTENCY: SAME-STATEMENT WHERE last_samsara_login_at IS NULL OR last_samsara_login_at < $3 (observedAt)
 * OVERLAP: the later timestamp wins; an older or replayed event updates nothing
 * REVERSE: NOT-A-DOCUMENT — telemetry stamp on the driver row
 * NEVER: must never move the login clock backwards, or stamp a driver outside the company and its active driver_company_authorizations
 * (ROUND 337 header — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
export type SamsaraDriverLoginDbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

/**
 * Persist the latest observed Samsara ELD activity for a driver.
 *
 * The selected company may reach a shared driver through an active DCA, so the
 * write uses the same company scope as the pairing and HOS readers. Older or
 * replayed webhook events never move the clock backwards.
 */
export async function recordSamsaraDriverLogin(
  client: SamsaraDriverLoginDbClient,
  operatingCompanyId: string,
  driverId: string,
  observedAt: string
): Promise<boolean> {
  const result = await client.query<{ id: string }>(
    `
      UPDATE mdata.drivers d
         SET last_samsara_login_at = $3::timestamptz,
             updated_at = now()
       WHERE d.id = $2::uuid
         AND (
           d.operating_company_id = $1::uuid
           OR EXISTS (
             SELECT 1
               FROM mdata.driver_company_authorizations samsara_login_dca
              WHERE samsara_login_dca.driver_id = d.id
                AND samsara_login_dca.company_id = $1::uuid
                AND samsara_login_dca.is_authorized = true
                AND samsara_login_dca.deactivated_at IS NULL
           )
         )
         AND (d.last_samsara_login_at IS NULL OR d.last_samsara_login_at < $3::timestamptz)
      RETURNING d.id::text AS id
    `,
    [operatingCompanyId, driverId, observedAt]
  );
  return Boolean(result.rows[0]?.id);
}
