/**
 * CLS-GUARD-LITERAL-GUC — "does this source set the tenant GUC?", asked once, in one place.
 *
 * ~51 guards answer that question by grepping the source for the literal
 * `set_config('app.operating_company_id'`. That was accurate while every route wrote the GUC by hand.
 * It stopped being accurate the moment routes started going through the shared helper
 * `setScopedCompanyContext(client, userId, companyId)` (apps/backend/src/_helpers/scoped-company-context.ts),
 * which asserts company membership and THEN sets the very same GUC — a STRICTLY STRONGER form of the
 * property those guards exist to protect.
 *
 * The failure mode is the dangerous direction: a route is made SAFER, and the guard goes RED. Two went
 * red on the CLS-GUC-CALLER-SCOPED drain — verify-dispatch-live-gps-wired ("positions endpoint must be
 * per-entity scoped") and verify-hos-clocks-tenant-scope — purely because `telematics/hos.routes.ts`
 * adopted the helper. A guard that punishes the correct fix gets worked around, and the workaround is
 * to leave the unsafe form in place.
 *
 * Root cause: those guards assert a MECHANISM (one exact call) instead of the PROPERTY (the tenant GUC
 * is set from this file). This module asserts the property, so adopting the helper anywhere else does
 * not break anything, and a file that sets the GUC by neither route still fails.
 *
 * Deliberately NOT a general "any tenant scoping" matcher: a route that merely mentions
 * operating_company_id in a WHERE clause has not set the GUC, and must not pass.
 */

/** The hand-written form: `set_config('app.operating_company_id', …)`, any quote style. */
const DIRECT = /set_config\(\s*(['"`])app\.operating_company_id\1/;

/**
 * The shared-helper form. Matches the CALL, never the declaration — `function
 * setScopedCompanyContext(` would otherwise satisfy this in the helper's own file, the
 * definition-counts-as-usage bug (CLS-GUARD-READS-COMMENTS) that has now been found in five guards.
 */
const VIA_HELPER = /(?<!function\s)\bsetScopedCompanyContext\s*\(/;

/**
 * True when `src` sets the tenant GUC, by either the direct call or the shared helper.
 *
 * Callers that must ALSO prove ordering (membership asserted BEFORE the GUC) should keep using
 * verify-caller-scoped-guc-membership / verify-scoped-company-context-asserts-first — this answers
 * only "is the GUC set here at all", which is what the ~51 literal-grepping guards were asking.
 */
export function setsTenantGuc(src) {
  return DIRECT.test(src) || VIA_HELPER.test(src);
}

/** For guard failure messages, so the operator is told both accepted forms rather than one. */
export const TENANT_GUC_HINT =
  "set the tenant GUC either with set_config('app.operating_company_id', …) or, preferably, via " +
  "setScopedCompanyContext(client, userId, companyId) from apps/backend/src/_helpers/scoped-company-context.ts, " +
  "which asserts company membership first";
