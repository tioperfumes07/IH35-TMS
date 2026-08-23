import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { insuranceTypeLabel } from "../../lib/insurance-type-label";

export type InsurancePolicySummary = {
  number?: string;
  carrier?: string | null;
  expiration?: string | null;
  /** Integer cents from unit aggregate API — null when no policy_unit allocation exists. */
  monthly_premium?: number | null;
};

export type LinkedInsurancePolicy = InsurancePolicySummary & {
  policy_id: string;
  coverage_type?: string | null;
  status?: string | null;
};

export type UnitInsuranceSummary = {
  us_policy?: InsurancePolicySummary | null;
  mx_policy?: InsurancePolicySummary | null;
  /** Real FK-linked policies (insurance.policy_unit) — insurance.policy has no US/MX jurisdiction
   *  column, so these are labelled by coverage type, not folded into us_policy/mx_policy. */
  linked_policies?: LinkedInsurancePolicy[];
  linked_policies_unavailable?: boolean;
};

function fmtDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return formatDateUS(value as string) || "—";
}

function fmtPremium(cents: unknown): string {
  if (cents === null || cents === undefined) return "—";
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return formatUsdCents(n);
}

function PolicyCard({ label, policy }: { label: string; policy: InsurancePolicySummary & { policy_id?: string } }) {
  const testKey = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="rounded-sm border border-gray-200 p-3" data-testid={`vp-insurance-${testKey}`}>
      <div className="text-xs font-semibold text-gray-700">{label}</div>
      <dl className="mt-2 grid gap-1 text-xs text-gray-600">
        <div className="flex justify-between gap-2">
          <dt>Policy #</dt>
          <dd>
            {policy.policy_id ? (
              <EntityLinkOrTombstone kind="insurance_policy" id={policy.policy_id} name={policy.number} noun="Policy" />
            ) : (
              String(policy.number ?? "—")
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Carrier</dt>
          <dd>{String(policy.carrier ?? "—")}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Expiration</dt>
          <dd>{fmtDate(policy.expiration)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Monthly premium</dt>
          <dd data-testid="vp-insurance-monthly-premium">{fmtPremium(policy.monthly_premium)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function InsuranceSummarySection({ insuranceSummary, unitId }: { insuranceSummary: UnitInsuranceSummary | undefined; unitId?: string }) {
  const us = insuranceSummary?.us_policy ?? null;
  const mx = insuranceSummary?.mx_policy ?? null;
  const linked = insuranceSummary?.linked_policies ?? [];
  const linkedUnavailable = insuranceSummary?.linked_policies_unavailable === true;

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4" data-testid="vp-insurance-summary">
      <h3 className="text-sm font-semibold text-gray-800">Insurance summary</h3>
      {unitId ? (
        <EntityLink
          kind="insurance_coverage_gaps"
          id={unitId}
          label="Check this unit’s coverage requirements →"
          className="mt-1 inline-block text-xs text-slate-700 hover:underline"
        />
      ) : null}
      {linkedUnavailable ? (
        <p className="mt-2 text-xs font-medium text-red-700">Linked insurance policies could not be loaded.</p>
      ) : !us && !mx && linked.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No US or MX policy on file for this unit.</p>
      ) : (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {us ? <PolicyCard label="US policy" policy={us} /> : null}
          {mx ? <PolicyCard label="MX policy" policy={mx} /> : null}
          {linked.map((policy, idx) => (
            <PolicyCard
              key={`${policy.number ?? "policy"}-${idx}`}
              label={`${insuranceTypeLabel(policy.coverage_type, null)}${policy.status && policy.status !== "active" ? ` (${policy.status})` : ""}`}
              policy={policy}
            />
          ))}
        </div>
      )}
    </section>
  );
}
