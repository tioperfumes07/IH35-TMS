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
      FROM org.companies c
      WHERE c.id = $2::uuid
        -- NOTE: do NOT gate on c.is_active here. is_active is a UI-visibility flag
        -- ("not selectable in UI even if user has access" — 0013_org_companies.sql),
        -- NOT an authorization signal. Pre-launch entities (USMCA, is_active=false
        -- until July 2026) are TMS-authoritative and must remain reachable via the API
        -- for setup/sync. Only true deactivation (deactivated_at) revokes access.
        AND c.deactivated_at IS NULL
        -- DISP-API-RLS / SETL-UI-API — must match org.user_accessible_company_ids(), NOT a
        -- raw org.user_company_access probe. Owner role elevation returns every active
        -- company even when uca rows are absent (live: jpm@ / laura.m@ Owner, uca_count=0).
        AND c.id IN (SELECT org.user_accessible_company_ids())
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
