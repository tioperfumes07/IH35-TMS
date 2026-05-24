import { withCurrentUser } from "../auth/db.js";

export async function assertCompanyMembership(userId: string, operatingCompanyId: string) {
  const ok = await withCurrentUser(userId, async (client) => {
    const access = await client.query(
      `
        SELECT 1
        FROM org.user_company_access
        WHERE user_id = $1::uuid
          AND company_id = $2::uuid
        LIMIT 1
      `,
      [userId, operatingCompanyId]
    );
    return (access.rowCount ?? 0) > 0;
  });

  if (!ok) {
    const err = new Error("forbidden_company_membership");
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
}
