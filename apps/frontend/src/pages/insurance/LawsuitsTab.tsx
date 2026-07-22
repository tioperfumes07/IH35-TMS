import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listInsuranceLawsuits, type InsuranceLawsuit, type InsuranceLawsuitStatus } from "../../api/insurance";
import { EntityLink } from "../../components/shared/EntityLink";
import { Button } from "../../components/Button";
import { LawsuitCreateModal } from "../../components/insurance/LawsuitCreateModal";
import { DataPanel } from "../../components/layout/DataPanel";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { useListState } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { LegalMattersReverseSection } from "../../components/legal/LegalMattersReverseSection";

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
  return formatUsdCents(cents);
}

export function LawsuitsTab({ operatingCompanyId, claimId }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = operatingCompanyId ?? selectedCompanyId ?? "";
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const deepLinkLawsuitId = searchParams.get("lawsuit_id");
  const [selectedLawsuitId, setSelectedLawsuitId] = useState<string | null>(deepLinkLawsuitId);

  // Law §9 reverse drill-through: EntityLink kind="lawsuit" navigates here with ?lawsuit_id=
  // (e.g. from LegalMatterDetailPage's insurance_lawsuit_id). Select + highlight the row and
  // resolve its claim so the legal-matters reverse section below reflects the deep-linked lawsuit.
  useEffect(() => {
    if (deepLinkLawsuitId) setSelectedLawsuitId(deepLinkLawsuitId);
  }, [deepLinkLawsuitId]);

  const query = useQuery({
    queryKey: ["insurance-lawsuits", companyId || "none", claimId ?? "all"],
    queryFn: () =>
      listInsuranceLawsuits({
        operating_company_id: companyId,
        claim_id: claimId,
      }).then((result) => result.lawsuits),
    enabled: Boolean(companyId),
  });

  // Empty message renders only once the lawsuits query settles (no first-fetch flash).
  const listState = useListState(query, (query.data ?? []).length === 0);

  if (!companyId) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to view lawsuits.
      </div>
    );
  }

  const rows = query.data ?? [];
  const selectedLawsuit = rows.find((r) => r.id === selectedLawsuitId) ?? null;
  // Prefer explicit claimId prop (filtered tab), else the selected lawsuit's claim.
  const legalClaimId = claimId || selectedLawsuit?.claim_id || null;

  const columns = useMemo<ParityColumn<InsuranceLawsuit>[]>(
    () => [
      {
        key: "case_number",
        label: "Case #",
        sortable: true,
        render: (lawsuit) => (
          <button
            type="button"
            className="font-medium text-slate-700 underline"
            onClick={() => setSelectedLawsuitId(lawsuit.id)}
          >
            {lawsuit.case_number}
          </button>
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (lawsuit) => <StatusBadge variant={lawsuitStatusVariant(lawsuit.status)}>{lawsuit.status}</StatusBadge>,
      },
      {
        key: "claim_id",
        label: "Claim",
        render: (lawsuit) =>
          lawsuit.claim_id ? (
            <EntityLink kind="claim" id={lawsuit.claim_id} label={lawsuit.claim_id.slice(0, 8)} />
          ) : (
            "-"
          ),
      },
      { key: "court_name", label: "Court", sortable: true },
      { key: "filed_date", label: "Filed", sortable: true, render: (lawsuit) => formatDateUS(lawsuit.filed_date) },
      { key: "demand_cents", label: "Demand", sortable: true, render: (lawsuit) => formatMoney(lawsuit.demand_cents) },
      { key: "settlement_cents", label: "Settlement", sortable: true, render: (lawsuit) => formatMoney(lawsuit.settlement_cents) },
    ],
    [],
  );

  return (
    <DataPanel title="Lawsuits">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-600">
          Statuses: {LAWSUIT_STATUS_FILTERS.filter((option) => option.value).map((option) => option.label).join(", ")}
        </span>
        <Button type="button" size="sm" onClick={() => setCreateOpen((prev) => !prev)}>
          {createOpen ? "Cancel" : "+ Create lawsuit"}
        </Button>
      </div>

      {legalClaimId ? (
        <div className="mb-3">
          <LegalMattersReverseSection
            operatingCompanyId={companyId}
            filter={{ insurance_claim_id: legalClaimId }}
            contextLabel="this lawsuit's claim"
            data-testid="insurance-lawsuit-legal-matters"
          />
        </div>
      ) : selectedLawsuitId ? (
        <p className="mb-3 text-xs text-gray-500">Selected lawsuit has no linked claim — cannot reverse-link legal matters.</p>
      ) : null}

      {query.isError ? (
        <div className="rounded-sm border border-red-200 bg-red-50 p-2 text-sm text-red-700">Failed to load lawsuits.</div>
      ) : null}

      <ParityTable
        rows={rows}
        columns={columns}
        rowKey={(lawsuit) => lawsuit.id}
        loading={listState.isLoading}
        storageKey="insurance-lawsuits"
        emptyText="No lawsuits found."
        rowClassName={(lawsuit) => (selectedLawsuitId === lawsuit.id ? "bg-slate-100" : "")}
      />
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
