import { useQuery } from "@tanstack/react-query";
import { legalMattersApi } from "../../api/legal-matters";
import { useAuth } from "../../auth/useAuth";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

type Filter =
  | { unit_id: string; insurance_claim_id?: never; related_driver_id?: never; equipment_id?: never }
  | { insurance_claim_id: string; unit_id?: never; related_driver_id?: never; equipment_id?: never }
  | { insurance_lawsuit_id: string; insurance_claim_id?: never; unit_id?: never; related_driver_id?: never; equipment_id?: never }
  | { related_driver_id: string; unit_id?: never; insurance_claim_id?: never; equipment_id?: never }
  // Trailers are mdata.equipment rows, not mdata.units - passing a trailer id as unit_id would
  // query the wrong key space and render a permanently-empty panel that looks correctly wired.
  | { equipment_id: string; unit_id?: never; insurance_claim_id?: never; related_driver_id?: never };

type Props = {
  operatingCompanyId: string;
  filter: Filter;
  /** Short context phrase, e.g. "this unit" / "this claim". */
  contextLabel: string;
  /** Optional test id for the section root. */
  "data-testid"?: string;
};

/**
 * Owner/Administrator-gated reverse drill-through to legal.matters
 * (DriverDetail "Legal Matters" pattern — total-connectivity).
 */
export function LegalMattersReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "legal-matters-reverse-section",
}: Props) {
  const { user } = useAuth();
  const canView = user?.role === "Owner" || user?.role === "Administrator";

  const query = useQuery({
    queryKey: ["legal-matters", "reverse", operatingCompanyId, filter],
    queryFn: () => legalMattersApi.list(operatingCompanyId, filter),
    enabled: canView && Boolean(operatingCompanyId) && Boolean(Object.values(filter)[0]),
  });

  if (!canView) return null;

  const matters = query.data?.matters ?? [];
  const openKind =
    "unit_id" in filter
      ? ("legal_matters_unit" as const)
      : "insurance_claim_id" in filter
        ? ("legal_matters_claim" as const)
        : "insurance_lawsuit_id" in filter
          ? ("legal_matters_lawsuit" as const)
          : "related_driver_id" in filter
            ? ("legal_matters_driver" as const)
            : ("legal_matters_equipment" as const);
  const openId = String(Object.values(filter)[0] ?? "");

  return (
    <div
      className="space-y-2 rounded-sm border border-gray-200 bg-white p-3"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Legal Matters</h3>
        <EntityLink kind={openKind} id={openId} label="Open Legal" className="text-xs font-semibold text-slate-700 underline" />
      </div>
      <p className="text-sm text-gray-600">
        Legal matters linked to {contextLabel} (Owner/Admin).
      </p>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {query.isError ? (
        <p className="text-sm text-red-600">Failed to load linked legal matters.</p>
      ) : null}
      {!query.isLoading && !query.isError && matters.length === 0 ? (
        <p className="text-sm text-gray-500">No linked matters.</p>
      ) : null}
      {matters.length > 0 ? (
        <ul className="space-y-2">
          {matters.map((m: Record<string, unknown>, index) => {
            const id = m.id == null ? null : String(m.id);
            return (
              <li key={id ?? `legal-matter-${index}`} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
                <EntityLinkOrTombstone
                  kind="matter"
                  id={id}
                  name={m.matter_number}
                  noun="Legal matter"
                  className="font-semibold text-slate-700"
                  data-testid="legal-matters-reverse-matter-link"
                />
                <span className="ml-2 text-gray-600">{String(m.status ?? "")}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
