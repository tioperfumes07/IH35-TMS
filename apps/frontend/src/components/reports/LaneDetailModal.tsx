import { entityLabel } from "../../lib/entity-label";
import { useMemo } from "react";
import type { LaneProfitabilityLane, LaneProfitabilityLoadDetail } from "../../api/reports";
import { formatDateUS } from "../../lib/formatDate";
import { Modal } from "../Modal";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLink } from "../shared/EntityLink";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function pct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

type Props = {
  open: boolean;
  lane: LaneProfitabilityLane | null;
  loads: LaneProfitabilityLoadDetail[];
  loading: boolean;
  onClose: () => void;
};

const LOAD_COLUMNS: Array<ParityColumn<LaneProfitabilityLoadDetail>> = [
  {
    key: "load_number",
    label: "Load",
    sortable: true,
    render: (load) => (
      <EntityLink kind="load" id={load.load_id} label={entityLabel(load.load_number, load.load_id, "Load")} />
    ),
  },
  {
    key: "created_at",
    label: "Date",
    sortable: true,
    sortValue: (load) => new Date(load.created_at).getTime(),
    render: (load) => formatDateUS(load.created_at),
  },
  {
    key: "revenue_cents",
    label: "Revenue",
    sortable: true,
    render: (load) => money(load.revenue_cents),
  },
  {
    key: "driver_pay_cents",
    label: "Driver pay",
    sortable: true,
    render: (load) => money(load.driver_pay_cents),
  },
  {
    key: "fuel_cost_cents",
    label: "Fuel",
    sortable: true,
    render: (load) => money(load.fuel_cost_cents),
  },
  {
    key: "maintenance_cost_cents",
    label: "Maint.",
    sortable: true,
    render: (load) => money(load.maintenance_cost_cents),
  },
  {
    key: "gross_profit_cents",
    label: "Profit",
    sortable: true,
    render: (load) => money(load.gross_profit_cents),
  },
  {
    key: "miles",
    label: "Miles",
    sortable: true,
    render: (load) => load.miles,
  },
  {
    key: "margin_pct",
    label: "Margin",
    sortable: true,
    sortValue: (load) => load.margin_pct ?? Number.NEGATIVE_INFINITY,
    render: (load) => pct(load.margin_pct),
  },
];

export function LaneDetailModal({ open, lane, loads, loading, onClose }: Props) {
  const columns = useMemo(() => LOAD_COLUMNS, []);

  if (!open || !lane) return null;

  const corridor = `${lane.origin_city}, ${lane.origin_state} → ${lane.destination_city}, ${lane.destination_state}`;

  return (
    <Modal open={open} title="Lane drill-down" onClose={onClose}>
      <p className="mb-3 text-xs text-gray-600">{corridor}</p>
      <ParityTable
        storageKey="reports-lane-detail-loads"
        tableTestId="lane-detail-loads"
        columns={columns}
        rows={loads}
        rowKey={(load) => load.load_id}
        loading={loading}
        emptyText="No loads in this lane for the selected period."
        initialPageSize={25}
        pageSizeOptions={[10, 25, 50]}
      />
    </Modal>
  );
}
