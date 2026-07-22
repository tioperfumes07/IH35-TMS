import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { insuranceClaimsApi, type InsuranceClaim } from "../../api/insurance";
import { useAuth } from "../../auth/useAuth";
import { EntityLink } from "../shared/EntityLink";

type Filter =
  | { driver_id: string; unit_id?: never }
  | { unit_id: string; driver_id?: never };

type Props = {
  operatingCompanyId: string;
  filter: Filter;
  /** Short context phrase, e.g. "this driver" / "this unit". */
  contextLabel: string;
  /** Optional test id for the section root. */
  "data-testid"?: string;
};

/**
 * Owner/Administrator-gated reverse drill-through to insurance.claim
 * (mirrors LegalMattersReverseSection — total-connectivity Law §9).
 */
export function InsuranceClaimsReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "insurance-claims-reverse-section",
}: Props) {
  const { user } = useAuth();
  const canView = user?.role === "Owner" || user?.role === "Administrator";

  const query = useQuery({
    queryKey: ["insurance-claims", "reverse", operatingCompanyId, filter],
    queryFn: () =>
      insuranceClaimsApi.list({
        operating_company_id: operatingCompanyId,
        ...filter,
      }),
    enabled: canView && Boolean(operatingCompanyId) && Boolean(Object.values(filter)[0]),
  });

  if (!canView) return null;

  const claims: InsuranceClaim[] = query.data?.claims ?? [];

  return (
    <div
      className="space-y-2 rounded-sm border border-gray-200 bg-white p-3"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Insurance Claims</h3>
        <Link className="text-xs font-semibold text-slate-700 underline" to="/safety/insurance/claims">
          Open Claims
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        Insurance claims linked to {contextLabel} (Owner/Admin).
      </p>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {query.isError ? (
        <p className="text-sm text-red-600">Failed to load linked insurance claims.</p>
      ) : null}
      {!query.isLoading && !query.isError && claims.length === 0 ? (
        <p className="text-sm text-gray-500">No linked claims.</p>
      ) : null}
      {claims.length > 0 ? (
        <ul className="space-y-2">
          {claims.map((claim) => (
            <li key={claim.id} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
              <EntityLink
                kind="claim"
                id={claim.id}
                label={claim.claim_number || claim.id.slice(0, 8)}
                className="font-semibold text-slate-700"
              />
              <span className="ml-2 text-gray-600">{claim.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
