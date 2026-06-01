import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listInsuranceClaims, type InsuranceClaim, type InsuranceClaimStatus } from "../../api/insurance";
import { Button } from "../../components/Button";
import { ClaimCreateModal } from "../../components/insurance/ClaimCreateModal";
import { DataPanel } from "../../components/layout/DataPanel";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";

type Props = {
  operatingCompanyId?: string;
  policyId?: string;
  assetId?: string;
};

const CLAIM_STATUS_FILTERS: Array<{ value: "" | InsuranceClaimStatus; label: string }> = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "paid", label: "Paid" },
  { value: "closed", label: "Closed" },
];

function claimStatusVariant(status: InsuranceClaimStatus): "neutral" | "warn" | "positive" | "crit" {
  if (status === "approved" || status === "paid") return "positive";
  if (status === "investigating") return "warn";
  if (status === "denied") return "crit";
  return "neutral";
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ClaimsTab({ operatingCompanyId, policyId, assetId }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = operatingCompanyId ?? selectedCompanyId ?? "";
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["insurance-claims", companyId || "none", policyId ?? "all", assetId ?? "all"],
    queryFn: () =>
      listInsuranceClaims({
        operating_company_id: companyId,
        policy_id: policyId,
        asset_id: assetId,
      }).then((result) => result.claims),
    enabled: Boolean(companyId),
  });

  if (!companyId) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to view claims.
      </div>
    );
  }

  const rows = query.data ?? [];

  return (
    <DataPanel title="Claims">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-600">
          Statuses: {CLAIM_STATUS_FILTERS.filter((option) => option.value).map((option) => option.label).join(", ")}
        </span>
        <Button type="button" size="sm" onClick={() => setCreateOpen((prev) => !prev)}>
          {createOpen ? "Cancel" : "+ Claim"}
        </Button>
      </div>

      {query.isLoading ? <div className="text-sm text-gray-500">Loading claims...</div> : null}
      {query.isError ? <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">Failed to load claims.</div> : null}
      {!query.isLoading && rows.length === 0 ? <div className="text-sm text-gray-600">No claims found.</div> : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-1.5 font-semibold">Claim #</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
                <th className="px-2 py-1.5 font-semibold">Policy</th>
                <th className="px-2 py-1.5 font-semibold">Asset</th>
                <th className="px-2 py-1.5 font-semibold">Accident</th>
                <th className="px-2 py-1.5 font-semibold">Claimed</th>
                <th className="px-2 py-1.5 font-semibold">Paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((claim) => (
                <ClaimRow key={claim.id} claim={claim} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ClaimCreateModal
        open={createOpen}
        operatingCompanyId={companyId}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await queryClient.invalidateQueries({ queryKey: ["insurance-claims", companyId] });
          await queryClient.invalidateQueries({ queryKey: ["insurance", "landing", "claims", companyId] });
        }}
      />
    </DataPanel>
  );
}

function ClaimRow({ claim }: { claim: InsuranceClaim }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-2 py-1.5 font-medium text-gray-800">{claim.claim_number}</td>
      <td className="px-2 py-1.5">
        <StatusBadge variant={claimStatusVariant(claim.status)}>{claim.status}</StatusBadge>
      </td>
      <td className="px-2 py-1.5 text-gray-700">
        <Link className="text-blue-700 underline" to={`/safety/insurance?policy_id=${claim.policy_id}`}>
          {claim.policy_id.slice(0, 8)}
        </Link>
      </td>
      <td className="px-2 py-1.5 text-gray-700">
        {claim.asset_id ? (
          <Link className="text-blue-700 underline" to={`/fleet/units/${claim.asset_id}`}>
            {claim.asset_id.slice(0, 8)}
          </Link>
        ) : (
          "-"
        )}
      </td>
      <td className="px-2 py-1.5 text-gray-700">{claim.accident_date}</td>
      <td className="px-2 py-1.5 text-gray-700">{formatMoney(claim.amount_claimed_cents)}</td>
      <td className="px-2 py-1.5 text-gray-700">{formatMoney(claim.amount_paid_cents)}</td>
    </tr>
  );
}
