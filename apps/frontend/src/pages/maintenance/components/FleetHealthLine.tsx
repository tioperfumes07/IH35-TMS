import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { readFleetHealth, type FleetHealthRow } from "./fleet-health-source";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatDateTimeUS } from "../../../lib/formatDate";
import { V3Panel } from "../../../components/v3/V3Panel";

const labels = { ok: "Healthy", soon: "PM soon", overdue: "PM overdue", shop: "In shop", none: "No PM clock" };
const tones = { ok: "text-blue-900", soon: "text-amber-700", overdue: "text-red-800", shop: "text-slate-600", none: "text-slate-500" };
const statusTones = { ...tones, ok: "text-green-600" };

export function FleetTruck({ row, vertical = false }: { row: Pick<FleetHealthRow, "state" | "body_style">; vertical?: boolean }) {
  return <svg aria-hidden="true" viewBox={vertical ? "60 0 180 300" : "-14 96 314 128"} className={`${vertical ? "h-full w-full" : "h-9 w-23 shrink-0"} ${tones[row.state]}`}>
    <g transform={vertical ? undefined : "rotate(-90 150 160)"}>
      <g className="fill-slate-800"><rect x="128" y="18" width="7" height="186" rx="2" /><rect x="165" y="18" width="7" height="186" rx="2" /><rect x="128" y="40" width="44" height="5" /><rect x="128" y="82" width="44" height="5" /></g>
      <g className="fill-slate-900"><rect x="100" y="28" width="28" height="28" rx="5" /><rect x="172" y="28" width="28" height="28" rx="5" /><rect x="100" y="70" width="28" height="28" rx="5" /><rect x="172" y="70" width="28" height="28" rx="5" /><rect x="104" y="232" width="13" height="30" rx="4" /><rect x="183" y="232" width="13" height="30" rx="4" /></g>
      <path d="M114 30v24M114 72v24M186 30v24M186 72v24" className="stroke-slate-600" strokeWidth="2" />
      <g className="fill-slate-700"><rect x="102" y="18" width="22" height="6" rx="2" /><rect x="176" y="18" width="22" height="6" rx="2" /><rect x="98" y="198" width="15" height="7" rx="2" /><rect x="187" y="198" width="15" height="7" rx="2" /></g>
      <circle cx="150" cy="64" r="20" className="fill-slate-500 stroke-slate-600" strokeWidth="3" /><path d="M150 44v14" className="stroke-slate-700" strokeWidth="5" />
      <g className="fill-slate-300 stroke-slate-400" strokeWidth="1.5"><rect x="96" y="150" width="16" height="48" rx="8" /><rect x="188" y="150" width="16" height="48" rx="8" /><path d="M98 160h12M98 186h12M190 160h12M190 186h12" /></g>
      <rect x="111" y="104" width="78" height="58" rx="12" fill="currentColor" /><rect x="119" y="110" width="62" height="40" rx="8" className="fill-white" opacity=".14" />
      <rect x="113" y="160" width="74" height="40" rx="6" fill="currentColor" /><rect x="132" y="168" width="36" height="12" rx="3" className="fill-white" opacity=".2" />
      <path d="M116 200h68l-4 14h-60z" className="fill-sky-200" />
      <path d={row.body_style === "classic" ? "M120 214h60v74h-60z" : row.body_style === "sloped" ? "M120 214h60l-6 74h-48z" : "M120 214h60l-3 64c-1 7-6 10-12 10h-30c-6 0-11-3-12-10z"} fill="currentColor" />
      <path d="M150 218v66" className="stroke-white" strokeOpacity=".25" strokeWidth="2" /><rect x="128" y="286" width="44" height="7" rx="3" className="fill-slate-300" /><g className="fill-amber-200"><rect x="124" y="276" width="10" height="5" rx="2" /><rect x="166" y="276" width="10" height="5" rx="2" /></g>
    </g>
  </svg>;
}

export function FleetHealthLine({ companyId }: { companyId: string }) {
  const [filter, setFilter] = useState("all");
  const health = useQuery({ queryKey: ["maintenance", "fleet-health", companyId], queryFn: () => readFleetHealth(companyId), enabled: Boolean(companyId), staleTime: 60_000, refetchInterval: 180_000 });
  const columns: ParityColumn<FleetHealthRow>[] = [
    { key: "unit_number", label: "Unit", render: (row) => <div className="flex min-w-0 flex-col items-start gap-1"><EntityLink kind="unit" id={row.unit_id} label={row.unit_number} /><FleetTruck row={row} /><div className="break-words text-xs text-slate-500">{[row.make, row.model, row.year].filter(Boolean).join(" · ")}</div></div> },
    { key: "odometer_mi", label: "Odometer", render: (row) => row.odometer_mi == null ? "Unavailable" : <EntityLink kind="unit" id={row.unit_id} label={`${Number(row.odometer_mi).toLocaleString("en-US")} mi`} /> },
    { key: "formatted_location", label: "Location", render: (row) => <div>{row.formatted_location || [row.telemetry_city, row.telemetry_state].filter(Boolean).join(", ") || "Location unavailable"}<div className="text-xs text-slate-500">{row.telemetry_at ? `Last reported ${formatDateTimeUS(row.telemetry_at)}` : "No telemetry timestamp"}</div></div> },
    { key: "pm_interval", label: "Road to next PM", render: (row) => row.pm_schedule_id
      ? <Link to={`/maintenance/pm-schedule?schedule_id=${encodeURIComponent(row.pm_schedule_id)}`} aria-label={`${row.unit_number}: PM schedule`}>{row.pm_interval && row.miles_left != null && row.odometer_mi != null ? <span className={`relative block ${tones[row.state]}`}><progress className="h-2 w-full" style={{ accentColor: "currentColor" }} max={row.pm_interval} value={Math.max(0, Math.min(row.pm_interval, row.pm_interval - row.miles_left))} /><span aria-hidden="true" className="absolute left-[80%] top-0 h-3 border-l border-slate-400" /></span> : "PM reading unavailable"}</Link>
      : <Link to={`/maintenance/pm-schedule?unit_id=${encodeURIComponent(row.unit_id)}&create=1`}>Start PM clock →</Link> },
    { key: "miles_left", label: "Miles", render: (row) => row.miles_left == null || row.odometer_mi == null || !row.pm_schedule_id ? "—" : <Link to={`/maintenance/pm-schedule?schedule_id=${encodeURIComponent(row.pm_schedule_id)}`}>{Math.abs(row.miles_left).toLocaleString("en-US")} {row.miles_left < 0 ? "over" : "to go"}</Link> },
    { key: "state", label: "Status", render: (row) => (row.odometer_mi == null || row.miles_left == null || !row.pm_interval) && !["shop", "none"].includes(row.state) ? "PM reading unavailable" : <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`h-2 w-2 rounded-full bg-current ${statusTones[row.state]}`} />{labels[row.state]}</span> },
  ];
  const rows = (health.data?.units ?? []).filter((row) => filter === "all" || (filter === "soon" && ["soon", "overdue"].includes(row.state)) || row.state === filter);
  return <V3Panel title="Fleet health line — road to the next PM" testId="maintenance-fleet-health-line" footer="Recorded fleet health and PM schedules. Missing readings are unavailable, never sample values.">
    <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2">{[["all", health.data ? `All ${health.data.kpi.total}` : "All"], ["soon", "PM soon"], ["none", "No clock"]].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className="rounded-sm border border-slate-200 px-2 py-1 text-xs aria-pressed:bg-slate-100">{label}</button>)}<Link className="text-xs" to="/maintenance/fleet-table">View all →</Link></div>
    {health.isError ? <ListErrorState title="Couldn't load fleet health" status={0} message={health.error instanceof Error ? health.error.message : undefined} onRetry={() => void health.refetch()} />
      : <ParityTable rows={rows} columns={columns} rowKey={(row) => row.unit_id} loading={health.isPending} storageKey="maintenance-home-fleet-health" emptyText="No units match this filter." />}
  </V3Panel>;
}
