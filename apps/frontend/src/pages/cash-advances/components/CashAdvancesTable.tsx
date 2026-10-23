import { useMemo } from "react";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { entityLabel } from "../../../lib/entity-label";
import { formatUsdTable } from "../../../lib/money";
import { formatDisplayName } from "../../../components/v3/formatDisplayName";

type CashAdvanceRow = Record<string, unknown>;

type Props = {
  rows: Array<CashAdvanceRow>;
  onOpenDetail: (row: CashAdvanceRow) => void;
  onMarkDisbursed: (row: CashAdvanceRow) => void;
  /** SETL-S02 — show spinner while parent useListState is loading. */
  isLoading?: boolean;
};

/** ROUND 443.254 N8 — readable labels instead of raw enums. */
function labelEnum(raw: unknown, fallback = "—"): string {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  const map: Record<string, string> = {
    pending_approval: "Pending approval",
    approved: "Approved",
    disbursed: "Disbursed",
    failed: "Failed",
    reversed: "Reversed",
    outstanding: "Outstanding",
    paid_off: "Paid off",
    other: "Other",
    historical_backfill: "Historical backfill",
    cash: "Cash",
    check: "Check",
    ach: "ACH",
    wire: "Wire",
    fuel_card: "Fuel card",
    zelle: "Zelle",
    venmo: "Venmo",
  };
  if (map[s.toLowerCase()]) return map[s.toLowerCase()];
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusPill(status: string) {
  if (status === "pending_approval") return "bg-[#F7F8FA] text-[#1F2A44]";
  if (status === "approved") return "bg-[#F7F8FA] text-[#1F2A44]";
  if (status === "disbursed") return "bg-[#F7F8FA] text-[#1F2A44]";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "reversed") return "bg-gray-100 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

export function CashAdvancesTable({ rows, onOpenDetail, onMarkDisbursed, isLoading = false }: Props) {
  const columns = useMemo<ParityColumn<CashAdvanceRow>[]>(
    () => [
      {
        key: "display_id",
        label: "Display ID",
        sortable: true,
        sortValue: (row) => String(row.display_id ?? row.id ?? ""),
        render: (row) => (
          <EntityLink
            kind="cash_advance"
            id={String(row.id)}
            label={entityLabel(row.display_id != null ? String(row.display_id) : null, String(row.id), "Advance")}
            data-testid="cash-advance-roster-record-link"
          />
        ),
      },
      {
        key: "driver_id",
        label: "Driver",
        sortable: true,
        sortValue: (row) => formatDisplayName(String(row.driver_full_name ?? "")),
        render: (row) => {
          const name = formatDisplayName(
            row.driver_full_name ? String(row.driver_full_name) : null,
          );
          return (
            <EntityLink
              kind="driver"
              id={row.driver_id ? String(row.driver_id) : null}
              label={entityLabel(name || null, row.driver_id ? String(row.driver_id) : null, "Driver")}
              onClick={(event) => event.stopPropagation()}
            />
          );
        },
      },
      {
        key: "amount",
        label: "Amount",
        sortable: true,
        sortValue: (row) => Number(row.amount ?? 0),
        render: (row) => formatUsdTable(Number(row.amount ?? 0)),
      },
      {
        key: "purpose",
        label: "Purpose",
        sortable: true,
        sortValue: (row) => labelEnum(row.purpose),
        render: (row) => labelEnum(row.purpose),
      },
      {
        key: "disbursement_method",
        label: "Method",
        sortable: true,
        sortValue: (row) => labelEnum(row.disbursement_method),
        render: (row) => labelEnum(row.disbursement_method),
      },
      {
        key: "disbursement_status",
        label: "Disbursement Status",
        sortable: true,
        sortValue: (row) => labelEnum(row.disbursement_status, "Pending approval"),
        render: (row) => {
          const status = String(row.disbursement_status ?? "pending_approval");
          return (
            <span className={`rounded-full px-2 py-0.5 ${statusPill(status)}`}>{labelEnum(status)}</span>
          );
        },
      },
      {
        key: "outstanding_balance",
        label: "Outstanding",
        sortable: true,
        sortValue: (row) => Number(row.outstanding_balance ?? 0),
        render: (row) => formatUsdTable(Number(row.outstanding_balance ?? 0)),
      },
      {
        key: "created_at",
        label: "Created",
        sortable: true,
        sortValue: (row) => String(row.created_at ?? ""),
        render: (row) => String(row.created_at ?? "").slice(0, 10) || "—",
      },
      {
        key: "action",
        label: "Action",
        render: (row) => {
          const status = String(row.disbursement_status ?? "pending_approval");
          return (
            <div className="flex gap-2">
              <button type="button" className="text-[#1F2A44] underline" onClick={() => onOpenDetail(row)}>
                View Detail
              </button>
              {status !== "disbursed" && status !== "reversed" ? (
                <button type="button" className="text-[#1F2A44] underline" onClick={() => onMarkDisbursed(row)}>
                  Mark Disbursed
                </button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [onOpenDetail, onMarkDisbursed],
  );

  return (
    // SETL-F3544: ParityTable owns Search+Range+gear; raw HTML table skipped the surface bar.
    <div data-testid="cash-advances-empty">
      <ParityTable<CashAdvanceRow>
        title="Cash advances"
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id)}
        loading={isLoading}
        emptyText="No cash advances found — none created for this entity yet (or no rows match the current filter)."
        storageKey="cash-advances-roster"
        exportFilename="cash-advances"
        tableTestId="cash-advances-table"
        gearButtonTestId="cash-advances-column-gear"
      />
    </div>
  );
}
