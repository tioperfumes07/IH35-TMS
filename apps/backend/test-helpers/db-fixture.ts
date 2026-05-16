import pg from "pg";
import { buildPgClientConfig } from "../src/lib/pg-connection-options.js";
import { TEST_OWNER_EMAIL, TEST_OWNER_GOOGLE_ID, TEST_OWNER_USER_ID } from "./constants.js";

let cachedOperatingCompanyId: string | null = null;

export async function ensureIntegrationPrerequisites(): Promise<string> {
  if (cachedOperatingCompanyId) return cachedOperatingCompanyId;

  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) {
    throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for integration tests");
  }

  const client = new pg.Client(buildPgClientConfig(cs));
  await client.connect();

  try {
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const companyRes = await client.query(`SELECT id FROM org.companies WHERE code = 'TRANSP' LIMIT 1`);
    const companyId = companyRes.rows[0]?.id as string | undefined;
    if (!companyId) {
      throw new Error("integration tests require org.companies seed row code=TRANSP");
    }

    -- Self-heal: 0057 drops inline UNIQUE on email (users_email_key) in favor of idx_users_email_unique on lower(email).
    -- ON CONFLICT (email) requires a unique constraint/index on (email) alone — fresh DBs only have the expression index, so upsert by PK.
    await client.query(
      `
        INSERT INTO identity.users (id, email, google_user_id, role)
        VALUES ($1::uuid, $2, $3, 'Owner')
        ON CONFLICT (id) DO UPDATE
          SET email = EXCLUDED.email,
              role = EXCLUDED.role,
              google_user_id = EXCLUDED.google_user_id
      `,
      [TEST_OWNER_USER_ID, TEST_OWNER_EMAIL, TEST_OWNER_GOOGLE_ID]
    );

    await client.query(
      `
        INSERT INTO org.user_company_access (user_id, company_id)
        VALUES ($1::uuid, $2::uuid)
        ON CONFLICT (user_id, company_id) DO NOTHING
      `,
      [TEST_OWNER_USER_ID, companyId]
    );

    await client.query("COMMIT");
    cachedOperatingCompanyId = companyId;
    return companyId;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

export function getOperatingCompanyId(): string {
  if (!cachedOperatingCompanyId) {
    throw new Error("ensureIntegrationPrerequisites() must run before getOperatingCompanyId()");
  }
  return cachedOperatingCompanyId;
}
