import { describe, expect, it, vi } from "vitest";
import {
  OperatingCompanyMembershipError,
  resolveOperatingCompanyId,
} from "../operating-company-scope.js";

const USER = "11111111-1111-1111-1111-111111111111";
const MEMBER_OPCO = "91e0bf0a-133f-4ce8-a734-2586cfa66d96"; // TRANSP
const FOREIGN_OPCO = "5c854333-1111-4111-8111-111111111111"; // an opco the user does NOT belong to
const DEFAULT_OPCO = "22222222-2222-4222-8222-222222222222";

/**
 * The canonical resolver runs exactly one query per call:
 *  - when `requested` is present → a membership-validation SELECT (returns the id row iff the
 *    caller is a member of that operating company);
 *  - when `requested` is absent → a COALESCE(default, lowest-accessible) SELECT.
 * The mock inspects the SQL to answer each shape.
 */
function makeClient(opts: { memberOf: Set<string>; defaultCompany: string | null }) {
  const query = vi.fn(async (sql: string, values: unknown[]) => {
    if (sql.includes("user_accessible_company_ids") && sql.includes("c.id = $1")) {
      // membership validation for a requested id
      const requested = String(values[0]);
      return { rows: opts.memberOf.has(requested) ? [{ id: requested }] : [] };
    }
    // default resolution
    return { rows: opts.defaultCompany ? [{ id: opts.defaultCompany }] : [] };
  });
  return { query };
}

describe("resolveOperatingCompanyId — G1-6 membership validation", () => {
  it("returns the requested opco when the caller IS a member of it", async () => {
    const client = makeClient({ memberOf: new Set([MEMBER_OPCO]), defaultCompany: DEFAULT_OPCO });
    await expect(resolveOperatingCompanyId(client, USER, MEMBER_OPCO)).resolves.toBe(MEMBER_OPCO);
  });

  it("REJECTS with 403 when the caller requests an opco they are NOT a member of", async () => {
    const client = makeClient({ memberOf: new Set([MEMBER_OPCO]), defaultCompany: DEFAULT_OPCO });
    await expect(resolveOperatingCompanyId(client, USER, FOREIGN_OPCO)).rejects.toMatchObject({
      message: "forbidden_company_membership",
      statusCode: 403,
    });
    await expect(resolveOperatingCompanyId(client, USER, FOREIGN_OPCO)).rejects.toBeInstanceOf(
      OperatingCompanyMembershipError
    );
  });

  it("does NOT silently downgrade a foreign requested opco to the caller's default", async () => {
    const client = makeClient({ memberOf: new Set([MEMBER_OPCO]), defaultCompany: DEFAULT_OPCO });
    // A foreign id must throw, never resolve to DEFAULT_OPCO.
    await expect(resolveOperatingCompanyId(client, USER, FOREIGN_OPCO)).rejects.toBeInstanceOf(
      OperatingCompanyMembershipError
    );
  });

  it("rejects a malformed (non-UUID) requested id without hitting the database", async () => {
    const client = makeClient({ memberOf: new Set([MEMBER_OPCO]), defaultCompany: DEFAULT_OPCO });
    await expect(resolveOperatingCompanyId(client, USER, "not-a-uuid")).rejects.toBeInstanceOf(
      OperatingCompanyMembershipError
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it("falls back to the caller's default company when no opco is requested (unchanged behavior)", async () => {
    const client = makeClient({ memberOf: new Set([MEMBER_OPCO]), defaultCompany: DEFAULT_OPCO });
    await expect(resolveOperatingCompanyId(client, USER)).resolves.toBe(DEFAULT_OPCO);
    await expect(resolveOperatingCompanyId(client, USER, null)).resolves.toBe(DEFAULT_OPCO);
  });

  it("returns null when no opco is requested and the caller has no accessible company", async () => {
    const client = makeClient({ memberOf: new Set(), defaultCompany: null });
    await expect(resolveOperatingCompanyId(client, USER)).resolves.toBeNull();
  });
});
