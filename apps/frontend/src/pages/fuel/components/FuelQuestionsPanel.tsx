/**
 * LEAD 443.243 — "Fuel questions" list (Fuel module tab + Load Costs surface).
 * ROUND 443.258-B (D016 D017): ParityTable = gear column chooser + sortable headers.
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
import { formatMoneyCents } from "../../../lib/formatMoney";
import { formatDate } from "../../../lib/formatDate";
import { CappedListNotice } from "../../../components/CappedListNotice";

type Props = {
  operatingCompanyId: string;
  /** Optional load filter (Load Costs drawer / board). */
  loadId?: string;
};

// CLS-SILENT-CAP: the list fetches one page; CappedListNotice says so (with the server total) when there are more.
const FUEL_QUESTIONS_PAGE = 100;

export function FuelQuestionsPanel({ operatingCompanyId, loadId }: Props) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<FuelAssignmentQuestion | null>(null);

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

  const rows = listQuery.data?.rows ?? [];

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
        render: (r) => r.station ?? "—",
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
        render: (r) => <span className="font-semibold">{r.card_unit_number ?? "—"}</span>,
      },
      {
        key: "proposed_unit_number",
        label: "Proposed truck",
        sortable: true,
        sortValue: (r) => r.proposed_unit_number ?? "",
        render: (r) => r.proposed_unit_number ?? "—",
      },
      {
        key: "proposed_load_number",
        label: "Proposed load",
        sortable: true,
        sortValue: (r) => r.proposed_load_number ?? "",
        render: (r) => <span className="font-semibold">{r.proposed_load_number ?? "—"}</span>,
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
      {listQuery.isError ? (
        <ListErrorBanner message={userFacingApiError(listQuery.error, "Could not load fuel questions")} />
      ) : null}

      <ParityTable
        title="Fuel questions"
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={listQuery.isLoading}
        storageKey="fuel-assignment-questions"
        emptyText="No open fuel assignment questions. When a fill is not 100% certain, it appears here."
        tableTestId="fuel-questions-table"
        density="compact"
      />
      <CappedListNotice
        shown={rows.length}
        limit={FUEL_QUESTIONS_PAGE}
        total={listQuery.data?.total}
        hint="Answer these first — the rest appear as they clear."
      />

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
