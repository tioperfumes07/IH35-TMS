/**
 * Wrap a route test's query mock so the company-membership probe is answered truthfully.
 *
 * WHY THIS EXISTS: `setScopedCompanyContext` runs a real
 * `SELECT 1 FROM org.user_company_access …` before setting `app.operating_company_id`. Route tests mock
 * the DB client, and an unrecognised statement falls through to the mock's default — usually
 * `{ rows: [] }` — so the assert concludes "not a member" and every request 403s. That is a FIXTURE
 * gap, not a product defect.
 *
 * THE FIX MUST NOT BE `vi.mock("../_helpers/company-membership-guard.js")`. Stubbing the guard away
 * deletes the control from the test, so the suite would keep passing if someone removed the real gate —
 * the exact vacuous-control shape this codebase keeps getting bitten by. Here the REAL assert still
 * executes; it just receives a truthful answer.
 *
 * Default is member = true (the ordinary case). Flip the ref to exercise the cross-entity rejection,
 * which is the property actually worth asserting: 403, no tenant GUC set, and no side effect performed.
 */
type QueryFn = (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;

export type MembershipRef = { member: boolean };

/** A flippable membership flag, so one test can toggle member / non-member. */
export function membershipRef(member = true): MembershipRef {
  return { member };
}

export function membershipAware<T extends QueryFn>(query: T, ref: MembershipRef = membershipRef(true)): T {
  const wrapped = (async (sql: string, values?: unknown[]) => {
    if (typeof sql === "string" && sql.includes("org.user_company_access")) {
      return ref.member ? { rows: [{ ok: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    return query(sql, values);
  }) as T;
  // Preserve the vitest spy surface (mock.calls, mockClear, mockImplementation …) so existing
  // assertions against the wrapped mock keep working unchanged.
  return Object.assign(wrapped, query);
}
