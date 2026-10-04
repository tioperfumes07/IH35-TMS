// ROUND 389.3 RULING 2 — driver sub-account numbers: <parent>-00-nnn under 1245 / 1255 / 1256 / 1257 / 2100, and nnn
// is ONE stable number per driver under EVERY parent (LUIS ARMANDO SOSA PEREZ is 2100-00-001 and 1245-00-001 and
// 1255-00-001). It replaces the generated DRIVERCASHAD896665-nnn strings and the NULL numbers the provisioners wrote
// after ROUND 181 (which accounts_active_requires_account_number refuses on an active account).
//
// allocateDriverSubAccountNnn: the driver's EXISTING nnn when any account already linked to him (his escrow account
// via accounting.escrow_accounts, his advance account via driver_finance.driver_advance_accounts) carries one;
// otherwise the next number after the highest nnn ever used in this entity under any of the five parents — live or
// retired, so a retired number is never reused. Serialized per entity with a transaction-scoped advisory lock so two
// concurrent hires cannot take the same number.

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const DRIVER_SUBACCOUNT_NUMBER_RE = /^(1245|1255|1256|1257|2100)-00-([0-9]{3})$/;
const SQL_NUMBER_RE = "^(1245|1255|1256|1257|2100)-00-[0-9]{3}$";

export function formatDriverSubAccountNumber(parentNumber: "1245" | "1255" | "1256" | "1257" | "2100", nnn: string): string {
  return `${parentNumber}-00-${nnn}`;
}

export async function allocateDriverSubAccountNnn(client: DbClient, operatingCompanyId: string, driverId: string): Promise<string> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('driver-subaccount-nnn:' || $1::text))`, [operatingCompanyId]);
  const existing = await client.query<{ nnn: string }>(
    `
      SELECT substring(a.account_number FROM '-([0-9]{3})$') AS nnn
        FROM catalogs.accounts a
       WHERE a.operating_company_id = $1::uuid
         AND a.account_number ~ '${SQL_NUMBER_RE}'
         AND a.id IN (
           SELECT ea.coa_account_id FROM accounting.escrow_accounts ea WHERE ea.holder_type = 'driver' AND ea.holder_id = $2::uuid
           UNION
           SELECT d.coa_account_id FROM driver_finance.driver_advance_accounts d WHERE d.operating_company_id = $1::uuid AND d.driver_id = $2::uuid
         )
       ORDER BY a.deactivated_at IS NULL DESC, a.created_at ASC
       LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );
  if (existing.rows[0]?.nnn) return existing.rows[0].nnn;
  const max = await client.query<{ n: number | null }>(
    `SELECT max(substring(account_number FROM '-([0-9]{3})$')::int) AS n
       FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid AND account_number ~ '${SQL_NUMBER_RE}'`,
    [operatingCompanyId]
  );
  const next = Number(max.rows[0]?.n ?? 0) + 1;
  if (next > 999) throw new Error("driver_subaccount_number_exhausted: no 3-digit driver number left in this entity");
  return String(next).padStart(3, "0");
}
