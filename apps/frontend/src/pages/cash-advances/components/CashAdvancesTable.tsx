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
    direct_bank_transfer: "Bank transfer",
    comdata: "Comdata",
    comchek: "Comchek",
    in_person_check: "Check",
  };
  if (map[s.toLowerCase()]) return map[s.toLowerCase()];
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPaid(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * ROUND 443.274-C — board Advances columns
 * (Advance · Driver · Paid · Method · Amount · Outstanding · Recover on).
 * ParityTable + Mark Disbursed engine kept (drawer + Action).
 */
export function CashAdvancesTable({ rows, onOpenDetail, onMarkDisbursed, isLoading = false }: Props) {
  const columns = useMemo<ParityColumn<CashAdvanceRow>[]>(
    () => [
      {
        key: "display_id",
        label: "Advance",
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
        key: "disbursed_at",
        label: "Paid",
        sortable: true,
        sortValue: (row) => String(row.disbursed_at ?? row.created_at ?? ""),
        render: (row) => formatPaid(row.disbursed_at ?? row.created_at),
      },
      {
        key: "disbursement_method",
        label: "Method",
        sortable: true,
        sortValue: (row) => labelEnum(row.disbursement_method),
        render: (row) => labelEnum(row.disbursement_method),
      },
      {
        key: "amount",
        label: "Amount",
        sortable: true,
        sortValue: (row) => Number(row.amount ?? 0),
        render: (row) => formatUsdTable(Number(row.amount ?? 0)),
      },
      {
        key: "outstanding_balance",
        label: "Outstanding",
        render: (row) => formatUsdTable(Number(row.outstanding_balance ?? 0)),
        sortable: true,
        sortValue: (row) => Number(row.outstanding_balance ?? 0),
      },
      {
        key: "recover_on",
        label: "Recover on",
        sortable: true,
        sortValue: (row) => String(row.load_display_id ?? row.load_id ?? ""),
        render: (row) => {
          const loadLabel = row.load_display_id != null ? String(row.load_display_id) : null;
          if (!row.load_id && !loadLabel) return "—";
          return (
            <EntityLink
              kind="load"
              id={row.load_id ? String(row.load_id) : null}
              label={entityLabel(loadLabel, row.load_id ? String(row.load_id) : null, "Load")}
              onClick={(event) => event.stopPropagation()}
            />
          );
        },
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
