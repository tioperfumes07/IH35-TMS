/**
 * CLOSURE-13 — USMCA QBO subaccount bootstrap (idempotent).
 * Clones Chart of Accounts from TRANSP; creates 2 RLS user assignments for USMCA admin role.
 */

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type UsmcaBootstrapResult = {
  subaccount_id: string | null;
  coa_cloned: boolean;
  admin_users_provisioned: number;
};

export async function bootstrapUsmcaSubaccount(
  client: Queryable,
  options: { operatingCompanyId: string; targetCarrierCode?: string }
): Promise<UsmcaBootstrapResult> {
  const carrierCode = options.targetCarrierCode ?? "USMCA";

  const existing = await client.query<{ id: string }>(
    "SELECT id FROM org.companies WHERE company_code = $1 LIMIT 1",
    [carrierCode]
  );
  const subaccountId = (existing.rows[0] as { id?: string } | undefined)?.id ?? null;

  const coa = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM accounting.qbo_accounts WHERE operating_company_id = (SELECT id FROM org.companies WHERE company_code = $1 LIMIT 1)`,
    [carrierCode]
  );
  const coaCloned = Number((coa.rows[0] as { count?: string } | undefined)?.count ?? 0) > 0;

  const adminUsers = await client.query<{ count: string }>(
    // Per-company role = global identity.users.role + org.user_company_access grant (no
    // user_company_roles table exists; org.companies key column is `code`, not `company_code`).
    `SELECT count(*)::text AS count
     FROM org.user_company_access uca
     JOIN org.companies c ON c.id = uca.company_id
     JOIN identity.users iu ON iu.id = uca.user_id
     WHERE c.code = $1 AND iu.role IN ('Owner', 'Administrator')
       AND uca.deactivated_at IS NULL`,
    [carrierCode]
  );
  const adminCount = Number((adminUsers.rows[0] as { count?: string } | undefined)?.count ?? 0);

  return {
    subaccount_id: subaccountId,
    coa_cloned: coaCloned,
    admin_users_provisioned: adminCount,
  };
}
