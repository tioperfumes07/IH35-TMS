/**
 * DeductionsSection — settlement deduction lines per the reference design
 * (docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-2026-09-05.html).
 *
 * Columns: Number, Load #, Date, Type, Description, Amount, Posting account, Hold/Resume action.
 * Section header: "Deductions" with subtitle
 * "escrow $25.00 per load only where printed · admin fee GAS · advances".
 * "+ Add deduction" button in the header (disabled when settlement is locked).
 *
 * Keeps the existing Hold/Resume functionality (HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID).
 */
import { Button } from "../../../components/Button";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { mmmDd } from "../../../lib/formatDate";

export type DeductionRow = {
  id: string;
  /** SEQ-NUMBER: the `S-<settlement>-<n>` line spine, assigned by SettlementDetailPage across every
   *  line-item table on the page in render order. Falls back to the raw row id only if unset. */
  seq_label?: string;
  description: string;
  /** S.1b — line_date (COALESCE of created_at), load_number, deduction_type, and posting
   *  account fields from the driver_settlement_deductions + catalogs.accounts joins. */
  line_date?: string | null;
  load_number?: string | null;
  load_id?: string | null;
  deduction_type?: string | null;
  posting_account_number?: string | null;
  posting_account_name?: string | null;
  balance_left: number;
  this_period_amount: number;
  is_held?: boolean;
  held_by_user?: string | null;
  held_by_user_id?: string | null;
  pending_ack?: boolean;
  /**
   * HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID: the real driver_finance.driver_settlement_deductions
   * id this line was generated from, resolved server-side via source_table/source_reference_id.
   * null when the line predates that linkage or was composed by a manual/legacy settlement path
   * with no backing deduction record — Hold is not offered in that case (there is nothing real to
   * hold), rather than sending this settlement-LINE id to a PATCH that can never find it.
   */
  source_deduction_id?: string | null;
};

type Props = {
  rows: DeductionRow[];
  onHold: (row: DeductionRow) => void;
  onResume?: (row: DeductionRow) => void;
  isOpen?: boolean;
  // SET-01 — the button rendered below always existed; it had no handler at all (a dead control).
  onAdd?: () => void;
  // SET-01 part 2 — per-line edit. Offered only for editable rows (see EDITABLE_TYPES); the backend
  // is the real gate (pending + manual-only + open settlement) and rejects anything else.
  onEdit?: (row: DeductionRow) => void;
};

// SET-01 part 2 — the four typed, GL-bound kinds a saved line can be edited into (matches the
// create/edit route's schema). Non-manual/system rows (advance recovery, escrow-pending, etc.)
// carry other types and are not offered an Edit control here.
const EDITABLE_DEDUCTION_TYPES = new Set(["wire_fee", "ach_fee", "company_vehicle_fuel", "escrow_contribution"]);

const COLUMNS: Array<ParityColumn<DeductionRow>> = [
  {
    key: "seq_label",
    label: "Number",
    render: (row) => row.seq_label ?? row.id ?? "—",
  },
  {
    key: "load_number",
    label: "Load #",
    sortable: true,
    sortValue: (row) => row.load_number ?? "",
    render: (row) => row.load_id ? <EntityLink kind="load" id={row.load_id} label={row.load_number ?? "—"} /> : (row.load_number ?? "—"),
  },
  {
    key: "line_date",
    label: "Date",
    sortable: true,
    sortValue: (row) => row.line_date ?? "",
    render: (row) => {
      const d = mmmDd(row.line_date);
      return d || "—";
    },
  },
  {
    key: "deduction_type",
    label: "Type",
    sortable: true,
    sortValue: (row) => row.deduction_type ?? "",
    render: (row) => row.deduction_type ?? "—",
  },
  { key: "description", label: "Description" },
  {
    key: "this_period_amount",
    label: "Amount",
    render: (row) => (
      <span className={row.is_held ? "line-through" : ""}>
        −${Number(row.pending_ack ? 0 : row.this_period_amount).toFixed(2)}
      </span>
    ),
  },
  {
    key: "posting_account_name",
    label: "Posting account",
    sortable: true,
    sortValue: (row) => row.posting_account_name ?? "",
    render: (row) => {
      if (!row.posting_account_number && !row.posting_account_name) return "—";
      const parts = [row.posting_account_number, row.posting_account_name].filter(Boolean);
      return parts.join(" ") || "—";
    },
  },
  {
    key: "_actions",
    label: "",
    sortable: false,
    render: (row) =>
      row.is_held ? (
        <Button size="sm" variant="secondary" onClick={() => undefined} disabled={!row.source_deduction_id}>
          Held
        </Button>
      ) : row.source_deduction_id ? (
        <Button size="sm" variant="secondary" onClick={() => undefined}>
          Hold
        </Button>
      ) : (
        <span className="text-slate-400" title="No linked deduction record to hold">
          —
        </span>
      ),
  },
];

export function DeductionsSection({ rows, onHold, onResume, isOpen, onAdd, onEdit }: Props) {
  const subtotal = rows.reduce((sum, row) => sum + Number(row.pending_ack ? 0 : row.this_period_amount || 0), 0);

  // Build columns with working hold/resume/edit handlers — ParityColumn render is a pure function
  // of the row, so we close over the callbacks here rather than at module scope.
  const columns: Array<ParityColumn<DeductionRow>> = COLUMNS.map((col) => {
    if (col.key !== "_actions") return col;
    return {
      ...col,
      render: (row: DeductionRow) => {
        // SET-01 part 2 — Edit is offered for an editable (open settlement, manual-typed, not held,
        // real backing deduction) line. The PATCH route is the real gate; this only decides the
        // affordance.
        const canEdit =
          Boolean(onEdit) &&
          isOpen === true &&
          !row.is_held &&
          Boolean(row.source_deduction_id) &&
          EDITABLE_DEDUCTION_TYPES.has(String(row.deduction_type ?? ""));
        return (
          <div className="flex justify-end gap-1">
            {canEdit ? (
              <Button size="sm" variant="secondary" onClick={() => onEdit?.(row)} data-testid="deduction-row-edit">
                Edit
              </Button>
            ) : null}
            {row.is_held ? (
              <Button size="sm" variant="secondary" onClick={() => onResume?.(row)} disabled={!onResume}>
                Resume
              </Button>
            ) : row.source_deduction_id ? (
              <Button size="sm" variant="secondary" onClick={() => onHold(row)}>
                Hold
              </Button>
            ) : !canEdit ? (
              <span className="text-slate-400" title="No linked deduction record to hold">
                —
              </span>
            ) : null}
          </div>
        );
      },
    };
  });

  return (
    <section className="rounded-sm border border-gray-200 bg-white">
      <header className="flex items-center border-b border-gray-200 px-2.5 py-1.5">
        <h2 className="m-0 text-xs font-bold uppercase tracking-wide text-slate-600">Deductions</h2>
        <span className="ml-2 text-xs text-slate-500">escrow $25.00 per load only where printed · admin fee GAS · advances</span>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="secondary"
            disabled={!isOpen || !onAdd}
            title={!isOpen ? "Settlement locked" : undefined}
            onClick={onAdd}
            data-testid="deductions-section-add"
          >
            + Add deduction
          </Button>
        </div>
      </header>
      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        storageKey="driver-finance-deductions-section"
        tableTestId="deductions-section-table"
        emptyText="No deductions."
        embedded
        hidePager
      />
      <div className="mt-1 px-2.5 py-1 text-xs font-semibold">Applied deductions this period: −${subtotal.toFixed(2)}</div>
    </section>
  );
}
