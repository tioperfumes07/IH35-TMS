import type pg from "pg";
import { withCurrentUser } from "./db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OperatingCompanyScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatingCompanyScopeError";
  }
}

export function assertOperatingCompanyId(operatingCompanyId: string): void {
  if (!UUID_RE.test(operatingCompanyId)) {
    throw new OperatingCompanyScopeError("Invalid operating_company_id UUID");
  }
}

export async function setOperatingCompanySessionVar(
  client: pg.PoolClient,
  operatingCompanyId: string
): Promise<void> {
  assertOperatingCompanyId(operatingCompanyId);
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
    operatingCompanyId,
  ]);
}

/** Ensures app.operating_company_id is set before any carrier-scoped query runs. */
export async function withOperatingCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  assertOperatingCompanyId(operatingCompanyId);
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await setOperatingCompanySessionVar(client, operatingCompanyId);
    const check = await client.query<{ val: string | null }>(
      `SELECT current_setting('app.operating_company_id', true) AS val`
    );
    const setVal = check.rows[0]?.val ?? "";
    if (!setVal || setVal !== operatingCompanyId) {
      throw new OperatingCompanyScopeError(
        "app.operating_company_id session var not set before database query"
      );
    }
    return fn(client);
  });
}
