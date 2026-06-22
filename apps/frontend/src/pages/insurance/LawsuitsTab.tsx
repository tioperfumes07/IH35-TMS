import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listInsuranceLawsuits, type InsuranceLawsuit, type InsuranceLawsuitStatus } from "../../api/insurance";
import { Button } from "../../components/Button";
import { LawsuitCreateModal } from "../../components/insurance/LawsuitCreateModal";
import { DataPanel } from "../../components/layout/DataPanel";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";

type Props = {
  operatingCompanyId?: string;
  claimId?: string;
};

const LAWSUIT_STATUS_FILTERS: Array<{ value: "" | InsuranceLawsuitStatus; label: string }> = [
  { value: "", label: "All" },
  { value: "filed", label: "Filed" },
  { value: "active", label: "Active" },
  { value: "settled", label: "Settled" },
  { value: "dismissed", label: "Dismissed" },
  { value: "judgment", label: "Judgment" },
];

function lawsuitStatusVariant(status: InsuranceLawsuitStatus): "neutral" | "warn" | "positive" | "crit" {
  if (status === "settled") return "positive";
  if (status === "active" || status === "filed") return "warn";
  if (status === "dismissed") return "neutral";
  return "crit";
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function LawsuitsTab({ operatingCompanyId, claimId }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = operatingCompanyId ?? selectedCompanyId ?? "";
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["insurance-lawsuits", companyId || "none", claimId ?? "all"],
    queryFn: () =>
      listInsuranceLawsuits({
        operating_company_id: companyId,
        claim_id: claimId,
      }).then((result) => result.lawsuits),
    enabled: Boolean(companyId),
  });

  if (!companyId) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to view lawsuits.
      </div>
    );
  }

  const rows = query.data ?? [];

  return (
    <DataPanel title="Lawsuits">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-600">
          Statuses: {LAWSUIT_STATUS_FILTERS.filter((option) => option.value).map((option) => option.label).join(", ")}
        </span>
        <Button type="button" size="sm" onClick={() => setCreateOpen((prev) => !prev)}>
          {createOpen ? "Cancel" : "+ Lawsuit"}
        </Button>
      </div>

      {query.isLoading ? <div className="text-sm text-gray-500">Loading lawsuits...</div> : null}
      {query.isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">Failed to load lawsuits.</div>
      ) : null}
      {!query.isLoading && rows.length === 0 ? <div className="text-sm text-gray-600">No lawsuits found.</div> : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-1.5 font-semibold">Case #</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
                <th className="px-2 py-1.5 font-semibold">Claim</th>
                <th className="px-2 py-1.5 font-semibold">Court</th>
                <th className="px-2 py-1.5 font-semibold">Filed</th>
                <th className="px-2 py-1.5 font-semibold">Demand</th>
                <th className="px-2 py-1.5 font-semibold">Settlement</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lawsuit) => (
                <LawsuitRow key={lawsuit.id} lawsuit={lawsuit} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <LawsuitCreateModal
        open={createOpen}
        operatingCompanyId={companyId}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await queryClient.invalidateQueries({ queryKey: ["insurance-lawsuits", companyId] });
          await queryClient.invalidateQueries({ queryKey: ["insurance", "landing", "lawsuits", companyId] });
        }}
      />
    </DataPanel>
  );
}

function LawsuitRow({ lawsuit }: { lawsuit: InsuranceLawsuit }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-2 py-1.5 font-medium text-gray-800">{lawsuit.case_number}</td>
      <td className="px-2 py-1.5">
        <StatusBadge variant={lawsuitStatusVariant(lawsuit.status)}>{lawsuit.status}</StatusBadge>
      </td>
      <td className="px-2 py-1.5 text-gray-700">
        {lawsuit.claim_id ? (
          <Link className="text-slate-700 underline" to={`/safety/insurance?claim_id=${lawsuit.claim_id}`}>
            {lawsuit.claim_id.slice(0, 8)}
          </Link>
        ) : (
          "-"
        )}
      </td>
      <td className="px-2 py-1.5 text-gray-700">{lawsuit.court_name}</td>
      <td className="px-2 py-1.5 text-gray-700">{lawsuit.filed_date}</td>
      <td className="px-2 py-1.5 text-gray-700">{formatMoney(lawsuit.demand_cents)}</td>
      <td className="px-2 py-1.5 text-gray-700">{formatMoney(lawsuit.settlement_cents)}</td>
    </tr>
  );
}
