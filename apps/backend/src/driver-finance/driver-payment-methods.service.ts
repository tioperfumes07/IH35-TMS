import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";

// Canonical driver payment-method master data (driver_finance.driver_payment_methods, migration
// 202607370000). This is the store the settlement payment path was probing for on mdata.drivers (columns
// that never existed). Master data only — NO GL/posting, NO money movement. Tokenized reference + last4
// for display; raw account/routing numbers are never persisted here.

type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DriverPaymentMethod = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  method: "ach" | "check";
  account_token: string | null;
  routing_last4: string | null;
  account_last4: string | null;
  account_holder_name: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const SELECT_COLS = `
  id,
  operating_company_id::text AS operating_company_id,
  driver_id::text AS driver_id,
  method,
  account_token,
  routing_last4,
  account_last4,
  account_holder_name,
  is_default,
  is_active,
  created_at::text AS created_at,
  updated_at::text AS updated_at
`;

const PAYMENT_METHODS_FLAG_KEY = "DRIVER_PAYMENT_METHODS_ENABLED";

async function setScope(client: QueryableClient, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
}

export async function listDriverPaymentMethods(
  userId: string,
  operatingCompanyId: string,
  driverId: string,
  opts: { includeInactive?: boolean } = {}
): Promise<DriverPaymentMethod[]> {
  return withCurrentUser(userId, async (client) => {
    await setScope(client, operatingCompanyId);
    const res = await client.query<DriverPaymentMethod>(
      `
        SELECT ${SELECT_COLS}
        FROM driver_finance.driver_payment_methods
        WHERE operating_company_id = $1 AND driver_id = $2
          ${opts.includeInactive ? "" : "AND is_active = true"}
        ORDER BY is_default DESC, created_at DESC
      `,
      [operatingCompanyId, driverId]
    );
    return res.rows;
  });
}

export async function createDriverPaymentMethod(
  userId: string,
  input: {
    operatingCompanyId: string;
    driverId: string;
    method: "ach" | "check";
    accountToken?: string | null;
    routingLast4?: string | null;
    accountLast4?: string | null;
    accountHolderName?: string | null;
    makeDefault?: boolean;
  }
): Promise<DriverPaymentMethod> {
  // ACH requires a tokenized reference (the DB CHECK also enforces this — fail early with a clear error).
  if (input.method === "ach" && !input.accountToken) throw new Error("ach_requires_account_token");
  return withCurrentUser(userId, async (client) => {
    await setScope(client, input.operatingCompanyId);
    // Only ONE default active method per driver — unset the current default before adding a new default.
    if (input.makeDefault) {
      await client.query(
        `UPDATE driver_finance.driver_payment_methods
           SET is_default = false, updated_by_user_id = $3, updated_at = now()
         WHERE operating_company_id = $1 AND driver_id = $2 AND is_default = true AND is_active = true`,
        [input.operatingCompanyId, input.driverId, userId]
      );
    }
    const res = await client.query<DriverPaymentMethod>(
      `
        INSERT INTO driver_finance.driver_payment_methods
          (operating_company_id, driver_id, method, account_token, routing_last4, account_last4,
           account_holder_name, is_default, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${SELECT_COLS}
      `,
      [
        input.operatingCompanyId,
        input.driverId,
        input.method,
        input.accountToken ?? null,
        input.routingLast4 ?? null,
        input.accountLast4 ?? null,
        input.accountHolderName ?? null,
        Boolean(input.makeDefault),
        userId,
      ]
    );
    const row = res.rows[0];
    if (!row) throw new Error("driver_payment_method_insert_failed");
    await appendCrudAudit(
      client,
      userId,
      "driver_finance.driver_payment_method.created",
      {
        resource_type: "driver_finance.driver_payment_methods",
        resource_id: row.id,
        operating_company_id: input.operatingCompanyId,
        driver_id: input.driverId,
        method: input.method,
        is_default: row.is_default,
      },
      "info",
      "DRIVER-PAYMENT-METHODS"
    );
    return row;
  });
}

export async function setDefaultDriverPaymentMethod(
  userId: string,
  operatingCompanyId: string,
  id: string
): Promise<DriverPaymentMethod> {
  return withCurrentUser(userId, async (client) => {
    await setScope(client, operatingCompanyId);
    const target = await client.query<{ id: string; driver_id: string }>(
      `SELECT id, driver_id::text AS driver_id
         FROM driver_finance.driver_payment_methods
        WHERE id = $1 AND operating_company_id = $2 AND is_active = true
        LIMIT 1 FOR UPDATE`,
      [id, operatingCompanyId]
    );
    const found = target.rows[0];
    if (!found) throw new Error("driver_payment_method_not_found");
    await client.query(
      `UPDATE driver_finance.driver_payment_methods
         SET is_default = false, updated_by_user_id = $3, updated_at = now()
       WHERE operating_company_id = $1 AND driver_id = $2 AND is_default = true AND is_active = true`,
      [operatingCompanyId, found.driver_id, userId]
    );
    const res = await client.query<DriverPaymentMethod>(
      `UPDATE driver_finance.driver_payment_methods
         SET is_default = true, updated_by_user_id = $3, updated_at = now()
       WHERE id = $1 AND operating_company_id = $2
       RETURNING ${SELECT_COLS}`,
      [id, operatingCompanyId, userId]
    );
    const row = res.rows[0];
    if (!row) throw new Error("driver_payment_method_not_found");
    await appendCrudAudit(
      client,
      userId,
      "driver_finance.driver_payment_method.set_default",
      {
        resource_type: "driver_finance.driver_payment_methods",
        resource_id: row.id,
        operating_company_id: operatingCompanyId,
        driver_id: row.driver_id,
      },
      "info",
      "DRIVER-PAYMENT-METHODS"
    );
    return row;
  });
}

export async function voidDriverPaymentMethod(
  userId: string,
  operatingCompanyId: string,
  id: string,
  reason: string
): Promise<DriverPaymentMethod> {
  if (!reason || !reason.trim()) throw new Error("void_reason_required");
  return withCurrentUser(userId, async (client) => {
    await setScope(client, operatingCompanyId);
    // void-not-delete: deactivate + record who/when/why; never DELETE (grants carry no DELETE).
    const res = await client.query<DriverPaymentMethod>(
      `UPDATE driver_finance.driver_payment_methods
         SET is_active = false, is_default = false, voided_at = now(), voided_by_user_id = $3,
             void_reason = $4, updated_by_user_id = $3, updated_at = now()
       WHERE id = $1 AND operating_company_id = $2 AND is_active = true
       RETURNING ${SELECT_COLS}`,
      [id, operatingCompanyId, userId, reason.trim()]
    );
    const row = res.rows[0];
    if (!row) throw new Error("driver_payment_method_not_found");
    await appendCrudAudit(
      client,
      userId,
      "driver_finance.driver_payment_method.voided",
      {
        resource_type: "driver_finance.driver_payment_methods",
        resource_id: row.id,
        operating_company_id: operatingCompanyId,
        driver_id: row.driver_id,
        reason: reason.trim(),
      },
      "warning",
      "DRIVER-PAYMENT-METHODS"
    );
    return row;
  });
}

/**
 * Resolve a driver's default ACH token for the settlement payment path — flag-gated + expand/contract-safe.
 * Returns null (no config) when: the DRIVER_PAYMENT_METHODS_ENABLED flag is OFF for the entity (default —
 * preserves prior behavior), OR the HELD migration hasn't been applied yet (to_regclass guard, so a
 * code-first deploy can't 500), OR the driver has no active default ACH method with a token. The caller
 * must already have set app.operating_company_id (driver_finance.* is FORCE RLS).
 */
export async function resolveDefaultAchToken(
  client: QueryableClient,
  operatingCompanyId: string,
  driverId: string
): Promise<string | null> {
  const enabled = await isEnabled(client, PAYMENT_METHODS_FLAG_KEY, { operating_company_id: operatingCompanyId });
  if (!enabled) return null;
  const reg = await client.query<{ t: string | null }>(
    `SELECT to_regclass('driver_finance.driver_payment_methods')::text AS t`
  );
  if (!reg.rows[0]?.t) return null;
  const res = await client.query<{ account_token: string | null }>(
    `SELECT account_token
       FROM driver_finance.driver_payment_methods
      WHERE operating_company_id = $1 AND driver_id = $2
        AND method = 'ach' AND is_default = true AND is_active = true AND account_token IS NOT NULL
      LIMIT 1`,
    [operatingCompanyId, driverId]
  );
  return res.rows[0]?.account_token ?? null;
}
