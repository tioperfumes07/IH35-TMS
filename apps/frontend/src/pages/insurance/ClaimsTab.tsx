import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listInsuranceClaims, type InsuranceClaim, type InsuranceClaimStatus } from "../../api/insurance";
import { EntityLink } from "../../components/shared/EntityLink";
import { Button } from "../../components/Button";
import { ClaimCreateModal } from "../../components/insurance/ClaimCreateModal";
import { DataPanel } from "../../components/layout/DataPanel";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { useListState } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

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
  return formatUsdCents(cents);
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

  // Empty message renders only once the claims query settles (no first-fetch flash).
  const listState = useListState(query, (query.data ?? []).length === 0);

  if (!companyId) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to view claims.
      </div>
    );
  }

  const rows = query.data ?? [];

  const columns = useMemo<ParityColumn<InsuranceClaim>[]>(
    () => [
      { key: "claim_number", label: "Claim #", sortable: true, render: (claim) => <span className="font-medium text-gray-800">{claim.claim_number}</span> },
      { key: "status", label: "Status", sortable: true, render: (claim) => <StatusBadge variant={claimStatusVariant(claim.status)}>{claim.status}</StatusBadge> },
      {
        key: "policy_id",
        label: "Policy",
        render: (claim) => (
          <Link className="text-slate-700 underline" to={`/safety/insurance?policy_id=${claim.policy_id}`}>
            {claim.policy_id.slice(0, 8)}
          </Link>
        ),
      },
      { key: "asset_id", label: "Asset", render: (claim) => <EntityLink kind="unit" id={claim.asset_id ?? undefined} label={claim.asset_id ? claim.asset_id.slice(0, 8) : undefined} /> },
      { key: "accident_date", label: "Accident", sortable: true, render: (claim) => formatDateUS(claim.accident_date) },
      { key: "amount_claimed_cents", label: "Claimed", sortable: true, render: (claim) => formatMoney(claim.amount_claimed_cents) },
      { key: "amount_paid_cents", label: "Paid", sortable: true, render: (claim) => formatMoney(claim.amount_paid_cents) },
    ],
    [],
  );

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

      {query.isError ? <div className="rounded-sm border border-red-200 bg-red-50 p-2 text-sm text-red-700">Failed to load claims.</div> : null}

      <ParityTable
        rows={rows}
        columns={columns}
        rowKey={(claim) => claim.id}
        loading={listState.isLoading}
        storageKey="insurance-claims"
        emptyText="No claims found."
      />
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
