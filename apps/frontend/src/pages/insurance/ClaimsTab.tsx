import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  getInsuranceClaimGraph,
  listInsuranceClaims,
  type InsuranceClaim,
  type InsuranceClaimStatus,
} from "../../api/insurance";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { Button } from "../../components/Button";
import { ClaimCreateModal } from "../../components/insurance/ClaimCreateModal";
import { DataPanel } from "../../components/layout/DataPanel";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { useListState } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { LegalMattersReverseSection } from "../../components/legal/LegalMattersReverseSection";
import { ExpensesReverseSection } from "../../components/accounting/ExpensesReverseSection";
import { BillsReverseSection } from "../../components/accounting/BillsReverseSection";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkClaimId = searchParams.get("claim_id");
  const reverseDriverId = searchParams.get("driver_id")?.trim() || "";
  const reverseUnitId = searchParams.get("unit_id")?.trim() || "";
  const reverseLoadId = searchParams.get("load_id")?.trim() || "";
  const reverseTrailerId = searchParams.get("trailer_id")?.trim() || "";
  const [createOpen, setCreateOpen] = useState(false);
  const [highlightedClaimId, setHighlightedClaimId] = useState<string | null>(deepLinkClaimId);
  // LST-F5163E + LST-F5192: visible list filters must write URL params.
  const [driverFilter, setDriverFilterState] = useState(reverseDriverId);
  const [unitFilter, setUnitFilterState] = useState(reverseUnitId);
  const [loadFilter, setLoadFilterState] = useState(reverseLoadId);
  const [trailerFilter, setTrailerFilterState] = useState(reverseTrailerId);

  useEffect(() => {
    if (deepLinkClaimId) setHighlightedClaimId(deepLinkClaimId);
  }, [deepLinkClaimId]);
  useEffect(() => {
    setDriverFilterState(reverseDriverId);
  }, [reverseDriverId]);
  useEffect(() => {
    setUnitFilterState(reverseUnitId);
  }, [reverseUnitId]);
  useEffect(() => {
    setLoadFilterState(reverseLoadId);
  }, [reverseLoadId]);
  useEffect(() => {
    setTrailerFilterState(reverseTrailerId);
  }, [reverseTrailerId]);

  function applyEntityFilters(next: { driver: string; unit: string; load: string; trailer: string }) {
    setDriverFilterState(next.driver);
    setUnitFilterState(next.unit);
    setLoadFilterState(next.load);
    setTrailerFilterState(next.trailer);
    const p = new URLSearchParams(searchParams);
    for (const [key, value] of [
      ["driver_id", next.driver],
      ["unit_id", next.unit],
      ["load_id", next.load],
      ["trailer_id", next.trailer],
    ] as const) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    setSearchParams(p, { replace: true });
  }
  const stagedFilters = useStagedListFilters({
    applied: { driver: driverFilter, unit: unitFilter, load: loadFilter, trailer: trailerFilter },
    empty: { driver: "", unit: "", load: "", trailer: "" },
    onApply: applyEntityFilters,
  });

  const query = useQuery({
    queryKey: [
      "insurance-claims",
      companyId || "none",
      policyId ?? "all",
      assetId ?? "all",
      driverFilter,
      unitFilter,
      loadFilter,
      trailerFilter,
    ],
    queryFn: () =>
      listInsuranceClaims({
        operating_company_id: companyId,
        policy_id: policyId,
        asset_id: assetId,
        driver_id: driverFilter.trim() || reverseDriverId || undefined,
        unit_id: unitFilter.trim() || reverseUnitId || undefined,
        load_id: loadFilter.trim() || reverseLoadId || undefined,
        trailer_id: trailerFilter.trim() || reverseTrailerId || undefined,
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

  const rows = query.data ?? [];
  const graph = graphQuery.data;

  const columns = useMemo<ParityColumn<InsuranceClaim>[]>(
    () => [
      {
        key: "claim_number",
        label: "Claim #",
        sortable: true,
        render: (claim) => (
          <EntityLink
            kind="claim"
            id={claim.id}
            label={entityLabel(claim.claim_number, claim.id, "Claim")}
            className="font-medium text-slate-700 underline"
          />
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
          <EntityLinkOrTombstone kind="insurance_policy" id={claim.policy_id} name={claim.policy_display_id} noun="Policy" />
        ),
      },
      {
        key: "unit_id",
        label: "Unit",
        render: (claim) => (
          <EntityLinkOrTombstone kind="unit" id={claim.unit_id} name={claim.unit_display_id} noun="Unit" />
        ),
      },
      {
        key: "trailer_id",
        label: "Trailer",
        render: (claim) => (
          <EntityLinkOrTombstone kind="trailer" id={claim.trailer_id} name={claim.trailer_display_id} noun="Trailer" />
        ),
      },
      {
        key: "driver_id",
        label: "Driver",
        render: (claim) => (
          <EntityLinkOrTombstone kind="driver" id={claim.driver_id} name={claim.driver_display_name} noun="Driver" />
        ),
      },
      {
        key: "load_id",
        label: "Load",
        render: (claim) => (
          <EntityLinkOrTombstone kind="load" id={claim.load_id} name={claim.load_display_id} noun="Load" />
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

  // INS-F01 — React error #310, "rendered fewer hooks than expected". This guard used to sit ABOVE
  // the `columns` useMemo. On a direct URL load or a refresh of /insurance?tab=claims the company
  // context is not resolved on the first render, so companyId was "" and the component returned
  // early having run 7 hooks; the next render (context resolved) ran 8. React compares hook counts
  // between renders of the same component, so the mount crashed the whole tab — reachable only by
  // deep link or refresh, which is why it survived normal tab-clicking.
  //
  // The guard is CORRECT and stays — rendering a claims grid with no entity would be worse. It just
  // has to run after every hook. Hooks are unconditional above; only the RENDER is conditional.
  if (!companyId) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to view claims.
      </div>
    );
  }

  const highlightedClaim = rows.find((r) => r.id === highlightedClaimId) ?? null;
  const forwardAccidentAt =
    graph?.reverse.accidents.find((a) => a.id === graph.claim.accident_report_id)?.accident_at ?? null;

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
            Claim graph{" "}
            <span className="font-semibold">
              {entityLabel(highlightedClaim?.claim_number, highlightedClaimId, "Claim")}
            </span>
            {highlightedClaim ? " — highlighted below." : " — not in current list."}
          </p>
          {graphQuery.isLoading ? <p>Loading reverse links…</p> : null}
          {graphQuery.isError ? (
            <div className="bg-red-50 p-2 text-sm text-red-700">
              Failed to load claim graph.
            </div>
          ) : null}
          {!graphQuery.isError && graph ? (
            <div className="grid gap-1 md:grid-cols-2">
              <div>
                <strong>Forward:</strong>{" "}
                <EntityLinkOrTombstone kind="driver" id={graph.claim.driver_id} name={graph.claim.driver_display_name} noun="Driver" />
                {" · "}
                <EntityLinkOrTombstone kind="load" id={graph.claim.load_id} name={graph.claim.load_display_id} noun="Load" />
                {" · "}
                <EntityLinkOrTombstone kind="unit" id={graph.claim.unit_id} name={graph.claim.unit_display_id} noun="Unit" />
                {" · "}
                <EntityLinkOrTombstone kind="trailer" id={graph.claim.trailer_id} name={graph.claim.trailer_display_id} noun="Trailer" />
                {graph.claim.accident_report_id ? (
                  <>
                    {" · "}
                    <EntityLink
                      kind="accident"
                      id={graph.claim.accident_report_id}
                      label={entityLabel(
                        forwardAccidentAt ? `Accident · ${formatDateUS(forwardAccidentAt)}` : null,
                        graph.claim.accident_report_id,
                        "Accident",
                      )}
                      className="text-slate-700 underline"
                      data-testid={`claim-forward-accident-${graph.claim.accident_report_id}`}
                    />
                  </>
                ) : null}
              </div>
              <div>
                <strong>Reverse:</strong>{" "}
                {graph.reverse.lawsuits.map((l) => (
                  <EntityLink
                    key={l.id}
                    kind="lawsuit"
                    id={l.id}
                    label={entityLabel(l.case_number, l.id, "Case")}
                    className="mr-2 text-slate-700 underline"
                  />
                ))}
                {graph.reverse.matters.map((m) => (
                  <EntityLink key={m.id} kind="matter" id={m.id} label={entityLabel(m.matter_number, m.id, "Legal matter")} className="mr-2 text-slate-700 underline" />
                ))}
                {graph.reverse.accidents.map((a) => (
                  <EntityLink
                    key={a.id}
                    kind="accident"
                    id={a.id}
                    label={entityLabel(
                      a.accident_at ? `Accident · ${formatDateUS(a.accident_at)}` : null,
                      a.id,
                      "Accident",
                    )}
                    className="mr-2 text-slate-700 underline"
                    data-testid={`claim-reverse-accident-${a.id}`}
                  />
                ))}
                {/* C-03: bare list Links omit ?incident_id= — destination opens nothing.
                    EntityLink kinds resolve to list + ?incident_id= (SafetyIncidentsClusterSurface honors). */}
                {graph.reverse.incidents.map((i) => (
                  <EntityLink
                    key={i.id}
                    kind={
                      i.incident_type === "trailer_interchange"
                        ? "trailer_interchange"
                        : i.incident_type === "cargo_claim"
                          ? "cargo_claim"
                          : "damage_report"
                    }
                    id={i.id}
                    label={entityLabel(i.incident_type ? `Incident ${i.incident_type}` : null, i.id, "Incident")}
                    className="mr-2 text-slate-700 underline"
                    data-testid={`claim-reverse-incident-${i.id}`}
                  />
                ))}
                {(graph.reverse.bills ?? []).map((b) => (
                  <EntityLink
                    key={b.id}
                    kind="bill"
                    id={b.id}
                    label={visibleDocumentLabel(b.bill_number, b.id, "Bill")}
                    className="mr-2 text-slate-700 underline"
                    data-testid={`claim-reverse-bill-${b.id}`}
                  />
                ))}
                {(graph.reverse.expenses ?? []).map((e) => (
                  <EntityLink
                    key={e.id}
                    kind="expense"
                    id={e.id}
                    label={entityLabel(
                      e.transaction_date ? `Expense · ${formatDateUS(e.transaction_date)}` : null,
                      e.id,
                      "Expense",
                    )}
                    className="mr-2 text-slate-700 underline"
                    data-testid={`claim-reverse-expense-${e.id}`}
                  />
                ))}
                {(graph.reverse.work_orders ?? []).map((wo) => (
                  <EntityLink
                    key={wo.id}
                    kind="work_order"
                    id={wo.id}
                    label={entityLabel(wo.display_id, wo.id, "Work order")}
                    className="mr-2 text-slate-700 underline"
                    data-testid={`claim-reverse-wo-${wo.id}`}
                  />
                ))}
                {/* INS-F6883 — the graph endpoint has always returned damage_continuity_chains
                    (backend + type both carried it), but this panel never rendered it, so a real
                    linked chain was invisible here even though the other 7 families showed. No
                    dedicated continuity-chain detail page/EntityLink kind exists yet anywhere in
                    the app (grep-confirmed) — render the real resolution status as plain text
                    rather than fabricate a link to a page that doesn't exist. */}
                {graph.reverse.damage_continuity_chains.map((chain) => (
                  <span
                    key={chain.id}
                    className="mr-2 text-slate-700"
                    data-testid={`claim-reverse-continuity-chain-${chain.id}`}
                  >
                    Continuity chain · {chain.final_resolution_status ?? "in progress"}
                  </span>
                ))}
                {graph.reverse.accidents.length === 0 &&
                graph.reverse.lawsuits.length === 0 &&
                graph.reverse.matters.length === 0 &&
                graph.reverse.incidents.length === 0 &&
                graph.reverse.damage_continuity_chains.length === 0 &&
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
        <div className="mb-3 space-y-3">
          <LegalMattersReverseSection
            operatingCompanyId={companyId}
            filter={{ insurance_claim_id: highlightedClaimId }}
            contextLabel="this claim"
            data-testid="insurance-claim-legal-matters"
          />
          <ExpensesReverseSection
            operatingCompanyId={companyId}
            filter={{ insurance_claim_id: highlightedClaimId }}
            contextLabel="this claim"
            data-testid="insurance-claim-expenses-reverse"
          />
          <BillsReverseSection
            operatingCompanyId={companyId}
            filter={{ insurance_claim_id: highlightedClaimId }}
            contextLabel="this claim"
            data-testid="insurance-claim-bills-reverse"
          />
        </div>
      ) : null}

      {query.isError ? (
        <ListErrorState
          status={0}
          message={userFacingApiError(query.error, "Failed to load claims.")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable
        rows={rows}
        columns={columns}
        rowKey={(claim) => claim.id}
        loading={listState.isLoading}
        storageKey="insurance-claims"
        emptyText="No claims found."
        rowClassName={(claim) => (highlightedClaimId === claim.id ? "bg-slate-100" : "")}
        filterBar={
          <CollapsedListFilters
            activeFilterCount={[driverFilter, unitFilter, loadFilter, trailerFilter].filter(Boolean).length}
            onApply={stagedFilters.apply}
            onReset={stagedFilters.reset}
            onCancel={stagedFilters.cancel}
            applyDisabled={!stagedFilters.dirty}
            testIdPrefix="insurance-claims"
          >
          <div className="flex flex-wrap items-end gap-3" data-testid="insurance-claims-filters">
            <label className="text-[11px] text-slate-600">
              Driver
              <EntityPicker
                kind="driver"
                operatingCompanyId={companyId}
                value={stagedFilters.draft.driver || null}
                onChange={(next) => stagedFilters.setDraft((draft) => ({ ...draft, driver: next ?? "" }))}
                allowCreate={false}
                placeholder="All drivers"
                className="mt-1"
                dataTestId="insurance-claims-filter-driver"
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Unit
              <EntityPicker
                kind="unit"
                operatingCompanyId={companyId}
                value={stagedFilters.draft.unit || null}
                onChange={(next) => stagedFilters.setDraft((draft) => ({ ...draft, unit: next ?? "" }))}
                allowCreate={false}
                placeholder="All units"
                className="mt-1"
                dataTestId="insurance-claims-filter-unit"
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Load
              <EntityPicker
                kind="load"
                operatingCompanyId={companyId}
                value={stagedFilters.draft.load || null}
                onChange={(next) => stagedFilters.setDraft((draft) => ({ ...draft, load: next ?? "" }))}
                allowCreate={false}
                placeholder="All loads"
                className="mt-1"
                dataTestId="insurance-claims-filter-load"
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Trailer
              <EntityPicker
                kind="trailer"
                operatingCompanyId={companyId}
                value={stagedFilters.draft.trailer || null}
                onChange={(next) => stagedFilters.setDraft((draft) => ({ ...draft, trailer: next ?? "" }))}
                allowCreate={false}
                placeholder="All trailers"
                className="mt-1"
                dataTestId="insurance-claims-trailer-filter"
              />
            </label>
          </div>
          </CollapsedListFilters>
        }
        />
      )}
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
