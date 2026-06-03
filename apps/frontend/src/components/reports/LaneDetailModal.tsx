import type { LaneProfitabilityLane, LaneProfitabilityLoadDetail } from "../../api/reports";
import { Modal } from "../Modal";

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

export function LaneDetailModal({ open, lane, loads, loading, onClose }: Props) {
  if (!open || !lane) return null;

  const corridor = `${lane.origin_city}, ${lane.origin_state} → ${lane.destination_city}, ${lane.destination_state}`;

  return (
    <Modal open={open} title="Lane drill-down" onClose={onClose}>
      <p className="mb-3 text-sm text-gray-600">{corridor}</p>
      {loading ? <p className="text-sm text-gray-600">Loading loads…</p> : null}
      {!loading && loads.length === 0 ? <p className="text-sm text-gray-600">No loads in this lane for the selected period.</p> : null}
      {!loading && loads.length > 0 ? (
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Load</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Revenue</th>
              <th className="px-3 py-2">Driver pay</th>
              <th className="px-3 py-2">Fuel</th>
              <th className="px-3 py-2">Maint.</th>
              <th className="px-3 py-2">Profit</th>
              <th className="px-3 py-2">Miles</th>
              <th className="px-3 py-2">Margin</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((load) => (
              <tr key={load.load_id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{load.load_number ?? load.load_id.slice(0, 8)}</td>
                <td className="px-3 py-2">{load.created_at.slice(0, 10)}</td>
                <td className="px-3 py-2">{money(load.revenue_cents)}</td>
                <td className="px-3 py-2">{money(load.driver_pay_cents)}</td>
                <td className="px-3 py-2">{money(load.fuel_cost_cents)}</td>
                <td className="px-3 py-2">{money(load.maintenance_cost_cents)}</td>
                <td className="px-3 py-2">{money(load.gross_profit_cents)}</td>
                <td className="px-3 py-2">{load.miles}</td>
                <td className="px-3 py-2">{pct(load.margin_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Modal>
  );
}
