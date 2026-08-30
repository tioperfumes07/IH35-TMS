import { useMemo } from "react";
import type { RecommendedStop } from "../../../api/fuelPlanner";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Props = {
  stops: RecommendedStop[];
};

type StopRow = RecommendedStop & {
  __seq: number;
  __rowKey: string;
};

function stateMile(stop: RecommendedStop): string {
  const state = String(stop.station_state ?? stop.state ?? "").trim() || "—";
  const mile = stop.mile_marker == null ? "—" : Number(stop.mile_marker).toFixed(0);
  return `${state} / ${mile}`;
}

function gallonsLabel(stop: RecommendedStop): string {
  const gallons = stop.gallons_added ?? stop.gallons;
  return gallons == null ? "—" : Number(gallons).toFixed(1);
}

function whyThisStop(stop: RecommendedStop): string {
  return String(stop.reasoning_json?.why_this_stop ?? stop.reasoning_json?.reason ?? "No reasoning");
}

function hosNote(stop: RecommendedStop): string {
  return String(stop.hos_note ?? stop.reasoning_json?.hos ?? "—");
}

const COLUMNS: Array<ParityColumn<StopRow>> = [
  {
    key: "__seq",
    label: "#",
    sortable: true,
    sortValue: (row) => row.__seq,
    render: (row) => row.__seq,
  },
  {
    key: "station_name",
    label: "Station",
    sortable: true,
    sortValue: (row) => row.station_name ?? "",
    render: (row) => (
      <span className={row.is_skipped ? "text-red-700 line-through" : undefined}>{row.station_name ?? "—"}</span>
    ),
  },
  {
    key: "state_mile",
    label: "State/Mile",
    sortable: true,
    sortValue: (row) => stateMile(row),
    render: (row) => stateMile(row),
  },
  {
    key: "price_per_gallon",
    label: "$/gal",
    sortable: true,
    sortValue: (row) => Number(row.price_per_gallon ?? 0),
    render: (row) => `$${Number(row.price_per_gallon ?? 0).toFixed(2)}`,
  },
  {
    key: "gallons",
    label: "Gallons",
    sortable: true,
    sortValue: (row) => row.gallons_added ?? row.gallons ?? Number.POSITIVE_INFINITY,
    render: (row) => gallonsLabel(row),
  },
  {
    key: "why_this_stop",
    label: "Why This Stop",
    sortable: true,
    sortValue: (row) => whyThisStop(row),
    render: (row) => whyThisStop(row),
  },
  {
    key: "hos",
    label: "HOS",
    sortable: true,
    sortValue: (row) => hosNote(row),
    render: (row) => hosNote(row),
  },
];

export function StopReasoningTable({ stops }: Props) {
  const rows = useMemo<StopRow[]>(
    () =>
      stops.map((stop, idx) => ({
        ...stop,
        __seq: idx + 1,
        __rowKey: stop.id || `stop-${idx}`,
      })),
    [stops]
  );

  return (
    <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white" data-testid="fuel-stop-reasoning-table">
      <ParityTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.__rowKey}
        storageKey="fuel-stop-reasoning"
        emptyText="No recommended stops yet."
        density="compact"
        rowClassName={(row) => (row.is_skipped ? "bg-red-50" : "")}
      />
    </div>
  );
}
