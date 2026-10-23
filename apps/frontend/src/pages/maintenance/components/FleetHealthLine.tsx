import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Truck } from "lucide-react";
import { readFleetHealth, type FleetHealthRow } from "./fleet-health-source";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatDateTimeUS } from "../../../lib/formatDate";

const labels = { ok: "Healthy", soon: "PM soon", overdue: "PM overdue", shop: "In shop", none: "No PM clock" };

export function FleetHealthLine({ companyId }: { companyId: string }) {
  const [filter, setFilter] = useState("all");
  const health = useQuery({ queryKey: ["maintenance", "fleet-health", companyId], queryFn: () => readFleetHealth(companyId), enabled: Boolean(companyId), staleTime: 60_000, refetchInterval: 180_000 });
  const columns: ParityColumn<FleetHealthRow>[] = [
    { key: "unit_number", label: "Unit", render: (row) => <div className="flex items-center gap-2"><Truck aria-hidden="true" className="h-6 w-8 shrink-0 text-slate-500" /><div><EntityLink kind="unit" id={row.unit_id} label={row.unit_number} /><div className="text-xs text-slate-500">{[row.make, row.model, row.year].filter(Boolean).join(" · ")}</div></div></div> },
    { key: "odometer_mi", label: "Odometer", render: (row) => row.odometer_mi == null ? "Unavailable" : `${Number(row.odometer_mi).toLocaleString("en-US")} mi` },
    { key: "formatted_location", label: "Location", render: (row) => <div>{row.formatted_location || [row.telemetry_city, row.telemetry_state].filter(Boolean).join(", ") || "Location unavailable"}<div className="text-xs text-slate-500">{row.telemetry_at ? `Last reported ${formatDateTimeUS(row.telemetry_at)}` : "No telemetry timestamp"}</div></div> },
    { key: "pm_interval", label: "Road to next PM", render: (row) => row.pm_schedule_id
      ? <Link to={`/maintenance/pm-schedule?schedule_id=${encodeURIComponent(row.pm_schedule_id)}`} aria-label={`${row.unit_number}: PM schedule`}>{row.pm_interval && row.miles_left != null && row.odometer_mi != null ? <progress className="h-2 w-full accent-slate-600" max={row.pm_interval} value={Math.max(0, Math.min(row.pm_interval, row.pm_interval - row.miles_left))} /> : "PM reading unavailable"}</Link>
      : <Link to={`/maintenance/pm-schedule?unit_id=${encodeURIComponent(row.unit_id)}&create=1`}>Start PM clock →</Link> },
    { key: "miles_left", label: "Miles", render: (row) => row.miles_left == null || row.odometer_mi == null ? "—" : `${Math.abs(row.miles_left).toLocaleString("en-US")} ${row.miles_left < 0 ? "over" : "to go"}` },
    { key: "state", label: "Status", render: (row) => (row.odometer_mi == null || row.miles_left == null || !row.pm_interval) && !["shop", "none"].includes(row.state) ? "PM reading unavailable" : labels[row.state] },
  ];
  const rows = (health.data?.units ?? []).filter((row) => filter === "all" || (filter === "soon" && ["soon", "overdue"].includes(row.state)) || row.state === filter);
  return <section className="min-w-0 rounded-sm border border-slate-200 bg-white" data-testid="maintenance-fleet-health-line">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
      <h2 className="text-xs font-bold">Fleet health line — road to the next PM</h2>
      <div className="flex flex-wrap items-center gap-2">{[["all", "All"], ["soon", "PM soon"], ["none", "No clock"]].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className="rounded-sm border border-slate-200 px-2 py-1 text-xs aria-pressed:bg-slate-100">{label}</button>)}<Link className="text-xs" to="/maintenance/fleet-table">View all →</Link></div>
    </div>
    {health.isError ? <ListErrorState title="Couldn't load fleet health" status={0} message={health.error instanceof Error ? health.error.message : undefined} onRetry={() => void health.refetch()} />
      : <ParityTable rows={rows} columns={columns} rowKey={(row) => row.unit_id} loading={health.isPending} storageKey="maintenance-home-fleet-health" emptyText="No units match this filter." />}
    <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">Recorded fleet health and PM schedules. Missing readings are unavailable, never sample values.</p>
  </section>;
}
