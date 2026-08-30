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
