import { assertCompanyMembership, type CompanyMembershipClient } from "./company-membership-guard.js";

/**
 * Assert the caller belongs to `operatingCompanyId`, THEN set the RLS scope to it.
 *
 * `SET app.operating_company_id` is what every FORCED-RLS policy in this schema reads. When a handler
 * takes that value from the query string / body / params and sets the GUC directly, the caller is
 * choosing the scope RLS will enforce — so RLS authorizes nothing, it faithfully enforces whatever the
 * caller asked for. That is MDATA-F09, found live on POST /api/v1/mdata/drivers/:id/messages, where the
 * handler went on to send a real SMS to a caller-named driver in a caller-named entity.
 *
 * Writing `assertCompanyMembership(...)` and then `set_config(...)` as two separate statements at every
 * call site works, but it is a two-step ordering that a reviewer has to notice is missing — which is
 * exactly how 75 handlers ended up without it. This helper collapses the pair into one call so the
 * ordering cannot be got wrong, and so the safe form is shorter than the unsafe one.
 *
 * Note that an "accessible companies" predicate is NOT a substitute: under PERMANENT LAW 4,
 * org.user_accessible_company_ids() returns EVERY active company for an Owner session. Membership in
 * org.user_company_access is the real check, and that is what assertCompanyMembership performs.
 *
 * Throws `forbidden_company_membership` (statusCode 403) before touching the GUC. There is no global
 * setErrorHandler in this app, so callers must map that to a 403 themselves — see the house pattern at
 * accounting/recon/recon.routes.ts:51.
 *
 * @returns the company id, so it can be used inline as the scope for the queries that follow.
 */
export async function setScopedCompanyContext(
  client: CompanyMembershipClient,
  userId: string,
  operatingCompanyId: string
): Promise<string> {
  await assertCompanyMembership(client, userId, operatingCompanyId);
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
  return operatingCompanyId;
}
