/**
 * LEAD 443.243 — "Fuel questions" list (Fuel module tab + Load Costs surface).
 * ROUND 443.258-B (D016 D017): ParityTable = gear column chooser + sortable headers.
 * ROUND 443.326 — KPI + MoneyListToolbar + ParityTable (no V3Panel). listFuelAssignmentQuestions unchanged.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listFuelAssignmentQuestions,
  type FuelAssignmentQuestion,
} from "../../../api/fuelAssignmentQuestions";
import { FuelAssignmentPopup } from "./FuelAssignmentPopup";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../../lib/api-error-message";
import { QBO_MONEY_CELL_CLASS } from "../../../design/qbo-parity";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../../components/table/MoneyListToolbar";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { FuelBoardSection } from "../FuelBoardSection";
import { formatMoneyCents } from "../../../lib/formatMoney";
import { formatDate } from "../../../lib/formatDate";
import { CappedListNotice } from "../../../components/CappedListNotice";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

type Props = {
  operatingCompanyId: string;
  /** Optional load filter (Load Costs drawer / board). */
  loadId?: string;
};

// CLS-SILENT-CAP: the list fetches one page; CappedListNotice says so (with the server total) when there are more.
const FUEL_QUESTIONS_PAGE = 100;

function kpiValue(n: number | undefined, loading: boolean): string {
  if (loading) return "…";
  if (n == null) return "—";
  return String(n);
}

export function FuelQuestionsPanel({ operatingCompanyId, loadId }: Props) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<FuelAssignmentQuestion | null>(null);
  const [search, setSearch] = useState("");

  const listQuery = useQuery({
    queryKey: ["fuel", "assignment-questions", operatingCompanyId, "open", loadId ?? ""],
    queryFn: () =>
      listFuelAssignmentQuestions(operatingCompanyId, {
        status: "open",
        loadId,
        limit: FUEL_QUESTIONS_PAGE,
      }),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 60_000,
  });

  const allRows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return allRows;
    return allRows.filter((r) => {
      const hay = [
        r.station,
        r.card_unit_number,
        r.proposed_unit_number,
        r.proposed_load_number,
        r.proposed_settlement_ref,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allRows, q]);

  const columns = useMemo<Array<ParityColumn<FuelAssignmentQuestion>>>(
    () => [
      {
        key: "fill_moment_ct",
        label: "Fill (Central)",
        sortable: true,
        sortValue: (r) => r.fill_moment_ct ?? "",
        className: "whitespace-nowrap",
        render: (r) => (r.fill_moment_ct ? formatDate(r.fill_moment_ct) || r.fill_moment_ct : "—"),
      },
      {
        key: "station",
        label: "Station",
        sortable: true,
        sortValue: (r) => r.station ?? "",
        render: (r) => (
          <EntityLink kind="fuel_transaction" id={r.fuel_transaction_id} label={r.station?.trim() || "Fuel fill"} onClick={(e) => e.stopPropagation()} />
        ),
      },
      {
        key: "gallons",
        label: "Gallons",
        sortable: true,
        sortValue: (r) => (r.gallons != null ? Number(r.gallons) : Number.POSITIVE_INFINITY),
        render: (r) => r.gallons ?? "—",
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        sortValue: (r) => (r.amount_cents != null ? Number(r.amount_cents) : Number.POSITIVE_INFINITY),
        className: QBO_MONEY_CELL_CLASS,
        render: (r) =>
          r.amount_cents == null || r.amount_cents === ""
            ? "—"
            : formatMoneyCents(r.amount_cents),
      },
      {
        key: "card_unit_number",
        label: "Card truck",
        sortable: true,
        sortValue: (r) => r.card_unit_number ?? "",
        // LEAD 443.266-B: every truck / load / fill on the question drills to its record (fuel.panel.fuel_questions
        // connectivity); a cell without an id renders its text, never a fabricated link.
        render: (r) => (
          <span className="font-semibold">
            {r.card_unit_id ? (
              <EntityLink kind="unit" id={r.card_unit_id} label={entityLabel(r.card_unit_number, r.card_unit_id, "Unit")} onClick={(e) => e.stopPropagation()} />
            ) : (r.card_unit_number ?? "—")}
          </span>
        ),
      },
      {
        key: "proposed_unit_number",
        label: "Proposed truck",
        sortable: true,
        sortValue: (r) => r.proposed_unit_number ?? "",
        render: (r) => (
          <span>
            {r.proposed_unit_id ? (
              <EntityLink kind="unit" id={r.proposed_unit_id} label={entityLabel(r.proposed_unit_number, r.proposed_unit_id, "Unit")} onClick={(e) => e.stopPropagation()} />
            ) : (r.proposed_unit_number ?? "—")}
          </span>
        ),
      },
      {
        key: "proposed_load_number",
        label: "Proposed load",
        sortable: true,
        sortValue: (r) => r.proposed_load_number ?? "",
        render: (r) => (
          <span className="font-semibold">
            {r.proposed_load_id ? (
              <EntityLink kind="load" id={r.proposed_load_id} label={entityLabel(r.proposed_load_number, r.proposed_load_id, "Load")} onClick={(e) => e.stopPropagation()} />
            ) : (r.proposed_load_number ?? "—")}
          </span>
        ),
      },
      {
        key: "proposed_settlement_ref",
        label: "Settlement",
        sortable: true,
        sortValue: (r) => r.proposed_settlement_ref ?? "",
        render: (r) => r.proposed_settlement_ref ?? "—",
      },
      {
        key: "actions",
        label: "Review",
        sortable: false,
        hideable: false,
        render: (r) => (
          <button
            type="button"
            className="rounded-sm border border-[#14314F] bg-[#14314F] px-2 text-xs font-semibold text-white"
            style={{ height: 28 }}
            data-testid={`fuel-question-open-${r.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setActive(r);
            }}
          >
            Review
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3" data-testid="fuel-questions-panel">
      {/* ROUND 443.250 Fuel Questions V3 — Open / This page / Page size from listFuelAssignmentQuestions. */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="fuel-questions-v3-kpi-strip"
        data-fuel-questions-v3-kpis="1"
      >
        <V3KpiTile
          label="Open questions"
          value={kpiValue(listQuery.isPending ? undefined : total, listQuery.isPending)}
          sub={loadId ? "open for this load" : "fills not 100% certain"}
          tone={total > 0 ? "red" : "green"}
          testId="fuel-questions-kpi-open"
        />
        <V3KpiTile
          label="This page"
          value={kpiValue(listQuery.isPending ? undefined : rows.length, listQuery.isPending)}
          sub="rows on this request"
          testId="fuel-questions-kpi-page"
        />
        <V3KpiTile
          label="Page size"
          value={String(FUEL_QUESTIONS_PAGE)}
          sub="rows per request"
          testId="fuel-questions-kpi-page-size"
        />
      </div>

      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search station, truck, load…"
        onClearAll={() => setSearch("")}
        activeFilterCount={0}
        testIdPrefix="fuel-questions"
      >
        <span />
      </MoneyListToolbar>

      <FuelBoardSection
        title="Fuel questions"
        subtitle="When a fill is not 100% certain, it lands here for truck + load attribution"
        testId="fuel-questions-v3-panel"
      >
        {listQuery.isError ? (
          <ListErrorBanner message={userFacingApiError(listQuery.error, "Could not load fuel questions")} />
        ) : null}

        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          loading={listQuery.isLoading}
          storageKey="fuel-assignment-questions"
          emptyText="No open fuel assignment questions. When a fill is not 100% certain, it appears here."
          tableTestId="fuel-questions-table"
          density="compact"
          suppressToolbarSearch
        />
        <CappedListNotice
          shown={rows.length}
          limit={FUEL_QUESTIONS_PAGE}
          total={listQuery.data?.total}
          hint="Answer these first — the rest appear as they clear."
        />
      </FuelBoardSection>

      <FuelAssignmentPopup
        open={active != null}
        operatingCompanyId={operatingCompanyId}
        question={active}
        onClose={() => setActive(null)}
        onAnswered={() => {
          setActive(null);
          void queryClient.invalidateQueries({ queryKey: ["fuel", "assignment-questions"] });
        }}
      />
    </div>
  );
}
