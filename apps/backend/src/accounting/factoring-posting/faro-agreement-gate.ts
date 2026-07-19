/**
 * Authoritative TRANSP/Faro full-recourse agreement gate for all factoring posting paths.
 * Same resolver as Home Factoring Balance — never customer-majority / sole-factor / name match.
 */
import { companyBusinessDate } from "../../lib/company-business-date.js";
import {
  FARO_FULL_RECOURSE_AGREEMENT_CODE,
  resolveFaroFactorIdentity,
  type ActiveFactorIdentity,
  type DbClient,
} from "../../home/factoring-balance-invoice-linkage.service.js";

export { FARO_FULL_RECOURSE_AGREEMENT_CODE, resolveFaroFactorIdentity };
export type { ActiveFactorIdentity };

/** Re-export literal for guards / callers — same code as Home Faro identity. */
export const FARO_FULL_RECOURSE_V1 = FARO_FULL_RECOURSE_AGREEMENT_CODE;

export type FaroAgreementGate =
  | {
      ok: true;
      vendorId: string;
      vendorName: string | null;
      agreementId: string;
      factorProfileId: string | null;
      companyCode: string | null;
      asOf: string;
    }
  | { ok: false; reason: string };

/** Resolve the single effective Faro full-recourse agreement; RTS/partial/missing/expired/ambiguous fail closed. */
export async function requireEffectiveFaroFullRecourseAgreement(
  client: DbClient,
  operatingCompanyId: string,
  asOfBusinessDate?: string
): Promise<FaroAgreementGate> {
  const asOf = asOfBusinessDate ?? companyBusinessDate();
  const identity = await resolveFaroFactorIdentity(client, operatingCompanyId, asOf);
  if (!identity.ok || !identity.vendorId || !identity.agreementId) {
    return {
      ok: false,
      reason: identity.reason ?? "missing_faro_agreement_binding",
    };
  }
  return {
    ok: true,
    vendorId: identity.vendorId,
    vendorName: identity.vendorName,
    agreementId: identity.agreementId,
    factorProfileId: identity.factorProfileId ?? null,
    companyCode: identity.companyCode,
    asOf,
  };
}

/** Advance must be bound to the effective Faro factor vendor (never entity-wide / other-factor). */
export async function advanceBoundToFaroVendor(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string,
  faroVendorId: string
): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
          FROM accounting.factoring_advances fa
         WHERE fa.id = $1::uuid
           AND fa.operating_company_id = $2::uuid
           AND fa.factoring_company_vendor_id = $3::uuid
      ) AS ok
    `,
    [factoringAdvanceId, operatingCompanyId, faroVendorId]
  );
  return Boolean(res.rows[0]?.ok);
}
