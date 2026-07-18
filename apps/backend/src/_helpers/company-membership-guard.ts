import { withCurrentUser } from "../auth/db.js";

export type CompanyMembershipClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number }>;
};

async function hasActiveCompanyMembership(
  client: CompanyMembershipClient,
  userId: string,
  operatingCompanyId: string
): Promise<boolean> {
  const access = await client.query(
    `
      SELECT 1
      FROM org.user_company_access uca
      JOIN org.companies c
        ON c.id = uca.company_id
       AND c.is_active = true
       AND c.deactivated_at IS NULL
      WHERE uca.user_id = $1::uuid
        AND uca.company_id = $2::uuid
        AND uca.deactivated_at IS NULL
      LIMIT 1
    `,
    [userId, operatingCompanyId]
  );
  return (access.rowCount ?? 0) > 0;
}

export async function assertCompanyMembership(
  client: CompanyMembershipClient,
  userId: string,
  operatingCompanyId: string
): Promise<void>;
export async function assertCompanyMembership(userId: string, operatingCompanyId: string): Promise<void>;
export async function assertCompanyMembership(
  clientOrUserId: CompanyMembershipClient | string,
  userIdOrCompanyId: string,
  maybeCompanyId?: string
) {
  const ok =
    typeof clientOrUserId === "string"
      ? await withCurrentUser(clientOrUserId, (client) =>
          hasActiveCompanyMembership(client, clientOrUserId, userIdOrCompanyId)
        )
      : await hasActiveCompanyMembership(clientOrUserId, userIdOrCompanyId, maybeCompanyId!);

  if (!ok) {
    const err = new Error("forbidden_company_membership");
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
}
