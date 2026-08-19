import { type ReactNode } from "react";
import { entityLabel } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { insuranceClaimsApi, type InsuranceClaim } from "../../api/insurance";
import { useAuth } from "../../auth/useAuth";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

const FAULT_LABELS: Record<string, string> = {
  undetermined: "Fault undetermined",
  company: "Company at fault",
  third_party: "Third party at fault",
  shared: "Shared fault",
};

const RECOVERY_RAIL_LABELS: Record<string, string> = {
  escrow: "Recover from escrow",
  settlement: "Recover from next settlement",
  split: "Recovery split",
  ask: "Recovery not decided",
};

const REPAIR_BOOKS_LABELS: Record<string, string> = {
  expense: "Repair expensed",
  capitalize: "Repair capitalized",
  ask: "Books treatment not decided",
};

/**
 * The economics a claim carries, rendered as short chips.
 *
 * WHY THIS IS HERE (LAW OF THE LAND §10a Layer C — the reverse half): slice 2 gave the claim
 * somewhere to record fault / driver responsibility / deductible / recovery rail, and the create
 * wizard collects all of it. Without this block those decisions were write-only — an operator could
 * record "driver responsible, $2,500 deductible, recover from escrow" and then never see it again
 * from the driver, the unit, the trailer or the load. Forward persistence without a reverse surface
 * is NOT done.
 *
 * Neutral/undecided values are deliberately still shown ("Recovery not decided"), because an
 * unresolved owner-locked decision is exactly the thing a reverse view exists to surface — hiding
 * it would make an open question look like a settled one.
 */
function ClaimEconomics({ claim }: { claim: InsuranceClaim }) {
  const chips: { key: string; label: ReactNode; tone: "neutral" | "attention" }[] = [];

  if (claim.fault) {
    chips.push({
      key: "fault",
      label: FAULT_LABELS[claim.fault] ?? claim.fault,
      tone: claim.fault === "undetermined" ? "attention" : "neutral",
    });
  }
  if (claim.driver_responsible === true) {
    chips.push({ key: "driver_responsible", label: "Driver responsible", tone: "attention" });
  } else if (claim.driver_responsible === false) {
    chips.push({ key: "driver_responsible", label: "Driver not responsible", tone: "neutral" });
  }
  if (typeof claim.deductible_cents === "number" && claim.deductible_cents > 0) {
    chips.push({ key: "deductible", label: `Deductible ${formatUsdCents(claim.deductible_cents)}`, tone: "neutral" });
  }
  if (claim.recovery_rail) {
    chips.push({
      key: "recovery_rail",
      label: RECOVERY_RAIL_LABELS[claim.recovery_rail] ?? claim.recovery_rail,
      tone: claim.recovery_rail === "ask" ? "attention" : "neutral",
    });
  }
  if (claim.repair_books_treatment) {
    chips.push({
      key: "repair_books_treatment",
      label: REPAIR_BOOKS_LABELS[claim.repair_books_treatment] ?? claim.repair_books_treatment,
      tone: claim.repair_books_treatment === "ask" ? "attention" : "neutral",
    });
  }
  if (claim.trailer_id || claim.trailer_display_id) {
    chips.push({
      key: "trailer",
      label: (
        <EntityLinkOrTombstone
          kind="trailer"
          id={claim.trailer_id}
          name={claim.trailer_display_id}
          noun="Trailer"
          className="text-slate-700 hover:underline"
          data-testid="claim-economics-trailer-link"
        />
      ),
      tone: "neutral",
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1" data-testid="claim-economics-chips">
      {chips.map((chip) => (
        <span
          key={chip.key}
          data-testid={`claim-economics-${chip.key}`}
          className={
            chip.tone === "attention"
              ? "rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700"
              : "rounded-sm border border-gray-200 px-1.5 py-0.5 text-xs text-gray-600"
          }
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

type Filter =
  | { driver_id: string; unit_id?: never; load_id?: never; trailer_id?: never }
  | { unit_id: string; driver_id?: never; load_id?: never; trailer_id?: never }
  | { load_id: string; driver_id?: never; unit_id?: never; trailer_id?: never }
  | { trailer_id: string; driver_id?: never; unit_id?: never; load_id?: never };

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
  const openKind =
    "driver_id" in filter
      ? ("insurance_claims_driver" as const)
      : "unit_id" in filter
        ? ("insurance_claims_unit" as const)
        : "load_id" in filter
          ? ("insurance_claims_load" as const)
          : ("insurance_claims_trailer" as const);
  const openId = String(Object.values(filter)[0] ?? "");

  return (
    <div
      className="space-y-2 rounded-sm border border-gray-200 bg-white p-3"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Insurance Claims</h3>
        <EntityLink kind={openKind} id={openId} label="Open Claims" className="text-xs font-semibold text-slate-700 underline" />
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
              <EntityLinkOrTombstone
                kind="claim"
                id={claim.id}
                name={entityLabel(claim.claim_number, claim.id, "Claim")}
                noun="Claim"
                className="font-semibold text-slate-700"
              />
              <span className="ml-2 text-gray-600">{claim.status}</span>
              <ClaimEconomics claim={claim} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
