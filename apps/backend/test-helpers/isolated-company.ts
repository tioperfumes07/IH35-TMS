/**
 * Per-suite operating-company isolation for real-Postgres db.tests.
 *
 * ROOT CAUSE this kills: `ensureIntegrationPrerequisites()` hands every suite the SAME TRANSP
 * company. Suites that seed `accounting.chart_of_accounts_roles` control singletons
 * (`ap_control` / `ar_control` / `cash_clearing`) then DO UPDATE / DELETE the shared row under
 * vitest `pool:"forks"`, so a parallel cash/CC bill-payment assertion can read a sibling's
 * account_id. Advisory locks only serialize the race — they do not remove it.
 *
 * FIX: each suite that mutates a control role owns a UNIQUE `org.companies` row + its own
 * role/account namespace. Production uniqueness `(operating_company_id, role) WHERE is_active`
 * is preserved exactly; parallel workers can no longer clobber each other.
 *
 * Test hygiene only — no product GL / posting behavior change.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildPgClientConfig } from "../src/lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "./constants.js";

export type IsolatedOperatingCompany = {
  companyId: string;
  code: string;
  label: string;
};

function connectString(): string {
  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for isolated company fixtures");
  return cs;
}

/**
 * Create a unique operating_carrier company + grant access to the suite actor (and the shared
 * integration Owner so ensureIntegrationPrerequisites-dependent helpers still resolve).
 *
 * Codes are globally unique (`org.companies.code`). Prefixed `ISO-` so humans can spot fixture
 * leftovers; deactivated (never deleted — org.companies has no DELETE grant for ih35_app) on cleanup.
 */
export async function createIsolatedOperatingCompany(opts?: {
  label?: string;
  actorUserId?: string;
  client?: pg.Client;
}): Promise<IsolatedOperatingCompany> {
  const label = opts?.label ?? "iso";
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  // org.companies.code is UNIQUE; keep short + collision-proof across parallel forks.
  const code = `ISO-${suffix}`.slice(0, 32);
  const legalName = `Isolated ${label} ${suffix}`;
  const actorUserId = opts?.actorUserId;

  const ownClient = !opts?.client;
  const client = opts?.client ?? new pg.Client(buildPgClientConfig(connectString()));
  if (ownClient) {
    await client.connect();
    await client.query("SET ROLE ih35_app");
  }

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    // Serialize company inserts only (unique code) — distinct from the shared COA-role lock.
    await client.query("SELECT pg_advisory_xact_lock(922337203685477010::bigint)");

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO org.companies (code, legal_name, short_name, company_type, country, is_active)
       VALUES ($1, $2, $3, 'operating_carrier', 'US', true)
       RETURNING id`,
      [code, legalName, label.slice(0, 40)]
    );
    const companyId = inserted.rows[0]!.id;

    // Grant the shared integration Owner (must already exist via ensureIntegrationPrerequisites).
    await client.query(
      `INSERT INTO org.user_company_access (user_id, company_id)
       VALUES ($1::uuid, $2::uuid)
       ON CONFLICT (user_id, company_id) DO NOTHING`,
      [TEST_OWNER_USER_ID, companyId]
    );
    // Optional suite actor — only if the identity.users row already exists. Suites that create
    // their actor AFTER isolation must grant membership themselves (the usual pattern).
    if (actorUserId) {
      await client.query(
        `INSERT INTO org.user_company_access (user_id, company_id)
         SELECT $1::uuid, $2::uuid
          WHERE EXISTS (SELECT 1 FROM identity.users WHERE id = $1::uuid)
         ON CONFLICT (user_id, company_id) DO NOTHING`,
        [actorUserId, companyId]
      );
    }

    await client.query("COMMIT");
    return { companyId, code, label };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (ownClient) await client.end();
  }
}

/**
 * Best-effort teardown for an isolated company namespace.
 * Deletes role rows + deactivates the company. Callers must delete their own bills/JEs/accounts
 * first (FK order). Never touches TRANSP/TRK/USMCA.
 */
export async function deactivateIsolatedOperatingCompany(
  client: pg.Client,
  company: IsolatedOperatingCompany
): Promise<void> {
  // Refuse to touch seeded production entities even if a caller passes the wrong id.
  const guard = await client.query<{ code: string }>(
    `SELECT code FROM org.companies WHERE id = $1::uuid`,
    [company.companyId]
  );
  const code = guard.rows[0]?.code;
  if (!code || !code.startsWith("ISO-")) {
    throw new Error(
      `deactivateIsolatedOperatingCompany refused: company ${company.companyId} code=${code ?? "missing"} is not an ISO-* fixture`
    );
  }

  await client.query(
    `DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid`,
    [company.companyId]
  );
  await client.query(
    `UPDATE org.companies
        SET is_active = false, deactivated_at = COALESCE(deactivated_at, now()), updated_at = now()
      WHERE id = $1::uuid AND code LIKE 'ISO-%'`,
    [company.companyId]
  );
  await client.query(`DELETE FROM org.user_company_access WHERE company_id = $1::uuid`, [company.companyId]);
}
