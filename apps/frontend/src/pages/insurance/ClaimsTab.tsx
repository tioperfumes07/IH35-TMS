import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  getInsuranceClaimGraph,
  listInsuranceClaims,
  type InsuranceClaim,
  type InsuranceClaimStatus,
} from "../../api/insurance";
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
import { LegalMattersReverseSection } from "../../components/legal/LegalMattersReverseSection";

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

const CLAIM_FAULT_LABELS: Record<string, string> = {
  undetermined: "Undetermined",
  company: "Company",
  third_party: "Third party",
  shared: "Shared",
};

const CLAIM_RECOVERY_RAIL_LABELS: Record<string, string> = {
  escrow: "Escrow",
  settlement: "Next settlement",
  split: "Split",
  ask: "Not decided",
};

export function ClaimsTab({ operatingCompanyId, policyId, assetId }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = operatingCompanyId ?? selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();
  const deepLinkClaimId = searchParams.get("claim_id");
  const [createOpen, setCreateOpen] = useState(false);
  const [highlightedClaimId, setHighlightedClaimId] = useState<string | null>(deepLinkClaimId);

  useEffect(() => {
    if (deepLinkClaimId) setHighlightedClaimId(deepLinkClaimId);
  }, [deepLinkClaimId]);

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

  const graphQuery = useQuery({
    queryKey: ["insurance-claim-graph", companyId, highlightedClaimId],
    queryFn: () => getInsuranceClaimGraph(highlightedClaimId!, companyId),
    enabled: Boolean(companyId && highlightedClaimId),
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
  const graph = graphQuery.data;

  const columns = useMemo<ParityColumn<InsuranceClaim>[]>(
    () => [
      {
        key: "claim_number",
        label: "Claim #",
        sortable: true,
        render: (claim) => (
          <button
            type="button"
            className="font-medium text-slate-700 underline"
            onClick={() => setHighlightedClaimId(claim.id)}
          >
            {claim.claim_number}
          </button>
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (claim) => <StatusBadge variant={claimStatusVariant(claim.status)}>{claim.status}</StatusBadge>,
      },
      {
        key: "policy_id",
        label: "Policy",
        render: (claim) => (
          <Link className="text-slate-700 underline" to={`/safety/insurance/policies/${claim.policy_id}`}>
            {claim.policy_id.slice(0, 8)}
          </Link>
        ),
      },
      {
        key: "unit_id",
        label: "Unit",
        render: (claim) => (
          <EntityLink
            kind="unit"
            id={claim.unit_id ?? undefined}
            label={claim.unit_id ? claim.unit_id.slice(0, 8) : undefined}
          />
        ),
      },
      {
        key: "driver_id",
        label: "Driver",
        render: (claim) => (
          <EntityLink
            kind="driver"
            id={claim.driver_id ?? undefined}
            label={claim.driver_id ? claim.driver_id.slice(0, 8) : undefined}
          />
        ),
      },
      {
        key: "load_id",
        label: "Load",
        render: (claim) => (
          <EntityLink
            kind="load"
            id={claim.load_id ?? undefined}
            label={claim.load_id ? claim.load_id.slice(0, 8) : undefined}
          />
        ),
      },
      {
        key: "accident_date",
        label: "Accident",
        sortable: true,
        render: (claim) => formatDateUS(claim.accident_date),
      },
      {
        key: "amount_claimed_cents",
        label: "Claimed",
        sortable: true,
        render: (claim) => formatMoney(claim.amount_claimed_cents),
      },
      {
        key: "amount_paid_cents",
        label: "Paid",
        sortable: true,
        render: (claim) => formatMoney(claim.amount_paid_cents),
      },
      // Slice-2 economics on the grid. Without these the wizard collected fault / responsibility /
      // deductible / recovery rail and no list ever showed them back — the write-only half of the
      // Law §10a reverse requirement. "Ask" is rendered, not hidden: an undecided owner-locked rail
      // is precisely what an operator needs to spot from the list.
      {
        key: "fault",
        label: "Fault",
        sortable: true,
        render: (claim) => CLAIM_FAULT_LABELS[claim.fault ?? "undetermined"] ?? claim.fault ?? "—",
      },
      {
        key: "driver_responsible",
        label: "Driver resp.",
        sortable: true,
        render: (claim) =>
          claim.driver_responsible === true ? "Yes" : claim.driver_responsible === false ? "No" : "Not assessed",
      },
      {
        key: "deductible_cents",
        label: "Deductible",
        sortable: true,
        render: (claim) => (claim.deductible_cents ? formatMoney(claim.deductible_cents) : "—"),
      },
      {
        key: "recovery_rail",
        label: "Recovery",
        sortable: true,
        render: (claim) => CLAIM_RECOVERY_RAIL_LABELS[claim.recovery_rail ?? "ask"] ?? claim.recovery_rail ?? "—",
      },
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
          {createOpen ? "Cancel" : "+ Create claim"}
        </Button>
      </div>

      {highlightedClaimId ? (
        <div className="mb-3 space-y-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p>
            Claim graph <span className="font-mono font-semibold">{highlightedClaimId.slice(0, 8)}</span>
            {rows.some((r) => r.id === highlightedClaimId) ? " — highlighted below." : " — not in current list."}
          </p>
          {graphQuery.isLoading ? <p>Loading reverse links…</p> : null}
          {graph ? (
            <div className="grid gap-1 md:grid-cols-2">
              <div>
                <strong>Forward:</strong>{" "}
                <EntityLink kind="driver" id={graph.claim.driver_id} label={graph.claim.driver_id ? "Driver" : undefined} />
                {" · "}
                <EntityLink kind="load" id={graph.claim.load_id} label={graph.claim.load_id ? "Load" : undefined} />
                {" · "}
                <EntityLink kind="unit" id={graph.claim.unit_id} label={graph.claim.unit_id ? "Unit" : undefined} />
                {graph.claim.accident_report_id ? (
                  <>
                    {" · "}
                    <Link className="text-slate-700 underline" to={`/safety/accidents`}>
                      Accident {graph.claim.accident_report_id.slice(0, 8)}
                    </Link>
                  </>
                ) : null}
              </div>
              <div>
                <strong>Reverse:</strong>{" "}
                {graph.reverse.lawsuits.map((l) => (
                  <span key={l.id} className="mr-2">
                    Lawsuit {l.case_number}
                  </span>
                ))}
                {graph.reverse.matters.map((m) => (
                  <EntityLink key={m.id} kind="matter" id={m.id} label={m.matter_number} className="mr-2 text-slate-700 underline" />
                ))}
                {graph.reverse.accidents.map((a) => (
                  <Link
                    key={a.id}
                    className="mr-2 text-slate-700 underline"
                    to="/safety/accidents"
                    data-testid={`claim-reverse-accident-${a.id}`}
                  >
                    Accident {a.id.slice(0, 8)}
                  </Link>
                ))}
                {graph.reverse.incidents.map((i) => (
                  <Link
                    key={i.id}
                    className="mr-2 text-slate-700 underline"
                    to={
                      i.incident_type === "trailer_interchange"
                        ? "/safety/trailer-interchanges"
                        : i.incident_type === "cargo_claim"
                          ? "/safety/cargo-claims"
                          : "/safety/damage-reports"
                    }
                    data-testid={`claim-reverse-incident-${i.id}`}
                  >
                    Incident {i.incident_type ?? i.id.slice(0, 8)}
                  </Link>
                ))}
                {(graph.reverse.bills ?? []).map((b) => (
                  <EntityLink
                    key={b.id}
                    kind="bill"
                    id={b.id}
                    label={b.bill_number ?? `Bill ${b.id.slice(0, 8)}`}
                    className="mr-2 text-slate-700 underline"
                    data-testid={`claim-reverse-bill-${b.id}`}
                  />
                ))}
                {(graph.reverse.expenses ?? []).map((e) => (
                  <EntityLink
                    key={e.id}
                    kind="expense"
                    id={e.id}
                    label={`Expense ${e.id.slice(0, 8)}`}
                    className="mr-2 text-slate-700 underline"
                    data-testid={`claim-reverse-expense-${e.id}`}
                  />
                ))}
                {(graph.reverse.work_orders ?? []).map((wo) => (
                  <EntityLink
                    key={wo.id}
                    kind="work_order"
                    id={wo.id}
                    label={wo.display_id ?? `WO ${wo.id.slice(0, 8)}`}
                    className="mr-2 text-slate-700 underline"
                    data-testid={`claim-reverse-wo-${wo.id}`}
                  />
                ))}
                {graph.reverse.accidents.length === 0 &&
                graph.reverse.lawsuits.length === 0 &&
                graph.reverse.matters.length === 0 &&
                graph.reverse.incidents.length === 0 &&
                (graph.reverse.bills ?? []).length === 0 &&
                (graph.reverse.expenses ?? []).length === 0 &&
                (graph.reverse.work_orders ?? []).length === 0
                  ? "none linked yet"
                  : null}
              </div>
              <p className="md:col-span-2 text-[11px] text-slate-500" data-testid="claim-graph-money-gaps">
                {graph.gaps.bill || graph.gaps.expense || graph.gaps.work_order
                  ? `Money FK gaps: ${[graph.gaps.bill, graph.gaps.expense, graph.gaps.work_order].filter(Boolean).join(" · ")}`
                  : "Bill / expense / WO insurance_claim_id columns present — reverse lists above when density > 0."}
                {" · "}Settlement: {graph.gaps.settlement_deduction}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {highlightedClaimId ? (
        <div className="mb-3">
          <LegalMattersReverseSection
            operatingCompanyId={companyId}
            filter={{ insurance_claim_id: highlightedClaimId }}
            contextLabel="this claim"
            data-testid="insurance-claim-legal-matters"
          />
        </div>
      ) : null}

      {query.isError ? (
        <div className="rounded-sm border border-red-200 bg-red-50 p-2 text-sm text-red-700">Failed to load claims.</div>
      ) : null}

      <ParityTable
        rows={rows}
        columns={columns}
        rowKey={(claim) => claim.id}
        loading={listState.isLoading}
        storageKey="insurance-claims"
        emptyText="No claims found."
        rowClassName={(claim) => (highlightedClaimId === claim.id ? "bg-slate-100" : "")}
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
