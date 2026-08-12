/**
 * CANONICAL per-suite operating-company isolation for real-Postgres db.tests.
 *
 * Location of truth: `apps/backend/test-helpers/isolated-company.ts`
 * (re-exported from `db-fixture.ts` for import convenience).
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
 * #2717 integration: this helper is the shared home for bank-splits vendor-bill isolation.
 * Call sites that previously inlined a `Promise<string>` helper should:
 *   `const { companyId } = await createIsolatedOperatingCompany({ codePrefix, legalNamePrefix })`
 * Do NOT copy a second helper into `db-fixture.ts`. Product GL code in
 * `bank-transaction-splits.service.ts` is out of scope here.
 *
 * GLOBAL `catalogs.account_role_bindings` is still UNIQUE(role_key) — company isolation does NOT
 * fix that race. Settlement suites that mutate those bindings must use
 * `global-account-role-bindings-lock.ts` (save → bind → tests → fail-loud restore).
 *
 * Test hygiene only — no product GL / posting behavior change.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildPgClientConfig } from "../src/lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "./constants.js";

/** Production / seed entities — never deactivate via this helper. */
const PROTECTED_COMPANY_CODES = new Set(["TRANSP", "TRK", "USMCA"]);

export type IsolatedOperatingCompany = {
  companyId: string;
  code: string;
  label: string;
};

export type CreateIsolatedOperatingCompanyOpts = {
  /** Short human label used in legal_name / short_name (legacy #2719 callers). */
  label?: string;
  /** Code prefix before the unique suffix. Default `ISO`. #2717 uses e.g. `SPV`. */
  codePrefix?: string;
  /** Legal-name prefix before the unique suffix. */
  legalNamePrefix?: string;
  /**
   * User that MUST receive org.user_company_access after the company is created.
   * Defaults to TEST_OWNER_USER_ID (guaranteed to exist after ensureIntegrationPrerequisites).
   * Fail-loud if the user row is missing — never soft-skip.
   */
  grantUserId?: string;
  /**
   * Optional additional actor to grant. Must already exist in identity.users.
   * Prefer creating the actor first, then passing actorUserId — silent EXISTS-skip is forbidden
   * (that footgun left suites thinking membership was granted when it was not).
   */
  actorUserId?: string;
  /** Reuse an open client (same session / role). Caller owns connect/end. */
  client?: pg.Client;
};

function connectString(): string {
  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for isolated company fixtures");
  return cs;
}

async function assertUserExists(client: pg.Client, userId: string, purpose: string): Promise<void> {
  const found = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM identity.users WHERE id = $1::uuid LIMIT 1`,
    [userId]
  );
  if (!found.rows[0]?.id) {
    throw new Error(
      `createIsolatedOperatingCompany: ${purpose} user ${userId} does not exist in identity.users. ` +
        `Call ensureIntegrationPrerequisites() first (Owner), or INSERT the actor BEFORE requesting a grant — ` +
        `silent skip is forbidden.`
    );
  }
}

async function grantMembership(client: pg.Client, userId: string, companyId: string): Promise<void> {
  await client.query(
    `INSERT INTO org.user_company_access (user_id, company_id)
     VALUES ($1::uuid, $2::uuid)
     ON CONFLICT (user_id, company_id) DO NOTHING`,
    [userId, companyId]
  );
}

/**
 * Create a unique operating_carrier company + grant membership.
 *
 * Order (locked):
 * 1. ensureIntegrationPrerequisites() — Owner identity exists before any grant
 * 2. INSERT org.companies
 * 3. Grant grantUserId (default Owner) — fail-loud if missing
 * 4. Optional actorUserId grant — fail-loud if missing
 */
export async function createIsolatedOperatingCompany(
  opts?: CreateIsolatedOperatingCompanyOpts
): Promise<IsolatedOperatingCompany> {
  const label = opts?.label ?? "iso";
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  const codePrefix = (opts?.codePrefix ?? "ISO").replace(/-+$/, "");
  const code = `${codePrefix}-${suffix}`.slice(0, 32);
  const legalName =
    opts?.legalNamePrefix != null
      ? `${opts.legalNamePrefix} ${suffix}`
      : `Isolated ${label} ${suffix}`;
  const grantUserId = opts?.grantUserId ?? TEST_OWNER_USER_ID;
  const actorUserId = opts?.actorUserId;

  // Owner row must exist BEFORE membership grants. Dynamic import avoids the db-fixture ↔
  // isolated-company re-export cycle (db-fixture re-exports this module).
  const { ensureIntegrationPrerequisites } = await import("./db-fixture.js");
  await ensureIntegrationPrerequisites();

  const ownClient = !opts?.client;
  const client = opts?.client ?? new pg.Client(buildPgClientConfig(connectString()));
  if (ownClient) {
    await client.connect();
    await client.query("SET ROLE ih35_app");
  }

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    // Serialize company inserts only (unique code) — distinct from GLOBAL bindings / COA-role locks.
    await client.query("SELECT pg_advisory_xact_lock(922337203685477010::bigint)");

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO org.companies (code, legal_name, short_name, company_type, country, is_active)
       VALUES ($1, $2, $3, 'operating_carrier', 'US', true)
       RETURNING id`,
      [code, legalName, label.slice(0, 40)]
    );
    const companyId = inserted.rows[0]!.id;

    await assertUserExists(client, grantUserId, "grantUserId");
    await grantMembership(client, grantUserId, companyId);

    if (actorUserId && actorUserId !== grantUserId) {
      await assertUserExists(client, actorUserId, "actorUserId");
      await grantMembership(client, actorUserId, companyId);
    }

    const { seedDispatchFlagColorsForCompany, resolveLoadTrailerEquipmentIdForTests } = await import("./db-fixture.js");
    await seedDispatchFlagColorsForCompany(client, companyId);
    await resolveLoadTrailerEquipmentIdForTests(client, companyId);

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
 * Teardown for an isolated company namespace.
 * Deletes role rows + deactivates the company. Callers must delete their own bills/JEs/accounts
 * first (FK order). Never touches TRANSP/TRK/USMCA.
 */
export async function deactivateIsolatedOperatingCompany(
  client: pg.Client,
  company: IsolatedOperatingCompany | string
): Promise<void> {
  const companyId = typeof company === "string" ? company : company.companyId;
  const guard = await client.query<{ code: string }>(
    `SELECT code FROM org.companies WHERE id = $1::uuid`,
    [companyId]
  );
  const code = guard.rows[0]?.code;
  if (!code || PROTECTED_COMPANY_CODES.has(code)) {
    throw new Error(
      `deactivateIsolatedOperatingCompany refused: company ${companyId} code=${code ?? "missing"} is a protected seed entity`
    );
  }

  await client.query(
    `DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid`,
    [companyId]
  );
  await client.query(
    `UPDATE org.companies
        SET is_active = false, deactivated_at = COALESCE(deactivated_at, now()), updated_at = now()
      WHERE id = $1::uuid`,
    [companyId]
  );
  await client.query(`DELETE FROM org.user_company_access WHERE company_id = $1::uuid`, [companyId]);
}
