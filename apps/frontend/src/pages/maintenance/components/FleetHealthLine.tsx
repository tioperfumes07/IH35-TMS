// TABLE_DATE_OMIT: this table has no date column by design — one row per UNIT with its current health (odometer / location / PM interval / miles left), a current-state view; each unit's last-reported telemetry time is printed under its location.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { readFleetHealth, type FleetHealthRow } from "./fleet-health-source";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatDateTimeUS } from "../../../lib/formatDate";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import { V3Panel } from "../../../components/v3/V3Panel";
import { V3Segmented } from "../../../components/v3/V3Segmented";

/** ROUND 9.0 board 22 (docs/design/v3/Maintenance-Home.png): the road to the next PM is a solid bar in the
 *  unit's state colour (navy healthy · amber PM soon · red overdue) with a tick at the 80 % warning mark. */
const barFill = { ok: "#1F3A5F", soon: "#B45309", overdue: "#991B1B", shop: "#64748B", none: "#94A3B8" } as const;
function PmRoad({ interval, used, state }: { interval: number; used: number; state: FleetHealthRow["state"] }) {
  const pct = Math.max(0, Math.min(100, (used / interval) * 100));
  return (
    <span className="relative block h-[8px] w-full min-w-[180px] rounded-full bg-[#E5E7EB]" role="progressbar" aria-valuemin={0} aria-valuemax={interval} aria-valuenow={Math.round(used)} data-testid="fleet-health-pm-bar">
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: barFill[state] }} />
      <span aria-hidden="true" className="absolute -top-[3px] left-[80%] h-[14px] border-l border-slate-400" />
    </span>
  );
}

const labels = { ok: "Healthy", soon: "PM soon", overdue: "PM overdue", shop: "In shop", none: "No PM clock" };
const tones = { ok: "text-blue-900", soon: "text-amber-700", overdue: "text-red-800", shop: "text-slate-600", none: "text-slate-500" };
const statusTones = { ...tones, ok: "text-green-600" };

export function FleetTruck({ row, vertical = false, moving = false, alert = false, size = "sm" }: { row: Pick<FleetHealthRow, "state" | "body_style">; vertical?: boolean; moving?: boolean; alert?: boolean; size?: "sm" | "board" }) {
  return <svg aria-hidden="true" viewBox={vertical ? "60 0 180 300" : "-14 96 314 128"} className={`${vertical ? "h-full w-full" : size === "board" ? "h-[52px] w-[122px] shrink-0" : "h-9 w-23 shrink-0"} ${tones[row.state]}`}>
    {!vertical && moving ? <path d="M-12 130h16M-12 160h22M-12 190h16" stroke="#9AA8B8" strokeWidth="5" strokeLinecap="round" /> : null}
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
    {!vertical && alert ? <g><circle cx="286" cy="110" r="13" fill="currentColor" stroke="#FFFFFF" strokeWidth="3.5" /><path d="M281 115l5.5-5.5M288 105.5a2.8 2.8 0 1 0 3.5 3.5" stroke="#FFFFFF" strokeWidth="2.6" fill="none" strokeLinecap="round" /></g> : null}
  </svg>;
}

export function FleetHealthLine({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // ROUND 8.17 class R — cohort filter lives in the URL (`fh`), restored on PM Back via `ret`.
  const filter = searchParams.get("fh") || "all";
  const setFilter = (next: string) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!next || next === "all") p.delete("fh");
        else p.set("fh", next);
        return p;
      },
      { replace: true },
    );
  };
  const origin = useMemo(() => currentOriginHref(pathname, search), [pathname, search]);
  const pmHref = (href: string) => withReturnContext(href, origin);
  const health = useQuery({ queryKey: ["maintenance", "fleet-health", companyId], queryFn: () => readFleetHealth(companyId), enabled: Boolean(companyId), staleTime: 60_000, refetchInterval: 180_000 });
  // LEAD 443.281 row 108: say WHAT is missing — a clock with no last-PM odometer (the truck's reading is there) vs no odometer.
  const statusCell = (row: FleetHealthRow) => {
    if (row.pm_baseline_absent && row.pm_schedule_id && row.state !== "shop") {
      return <Link to={pmHref(`/maintenance/pm-schedule?schedule_id=${encodeURIComponent(row.pm_schedule_id)}`)} data-testid="fleet-health-no-last-pm">{t("maintenance.fleetHealth.noLastPm")}</Link>;
    }
    if (row.odometer_mi == null && !["shop", "none"].includes(row.state)) return t("maintenance.fleetHealth.odometerUnavailable");
    if ((row.miles_left == null || !row.pm_interval) && !["shop", "none"].includes(row.state)) return t("maintenance.fleetHealth.pmReadingUnavailable");
    return <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`h-2 w-2 rounded-full bg-current ${statusTones[row.state]}`} />{labels[row.state]}</span>;
  };
  const columns: ParityColumn<FleetHealthRow>[] = [
    { key: "unit_number", label: "Unit", minWidth: 260, render: (row) => <div className="flex min-w-0 items-center gap-2"><FleetTruck row={row} /><div className="min-w-0"><EntityLink kind="unit" id={row.unit_id} label={row.unit_number} /><div className="truncate text-xs text-slate-500">{[row.make, row.model, row.year].filter(Boolean).join(" · ") || "—"}</div></div></div> },
    { key: "odometer_mi", label: "Odometer", render: (row) => row.odometer_mi == null ? "Unavailable" : <EntityLink kind="unit" id={row.unit_id} label={`${Math.round(Number(row.odometer_mi)).toLocaleString("en-US")} mi`} /> },
    { key: "formatted_location", label: "Location", render: (row) => <div>{row.formatted_location || [row.telemetry_city, row.telemetry_state].filter(Boolean).join(", ") || "Location unavailable"}<div className="text-xs text-slate-500">{row.telemetry_at ? `Last reported ${formatDateTimeUS(row.telemetry_at)}` : "No telemetry timestamp"}</div></div> },
    { key: "pm_interval", label: "Road to next PM", render: (row) => row.pm_schedule_id
      ? <Link to={pmHref(`/maintenance/pm-schedule?schedule_id=${encodeURIComponent(row.pm_schedule_id)}`)} aria-label={`${row.unit_number}: PM schedule`}>{row.pm_interval && row.miles_left != null && row.odometer_mi != null ? <PmRoad interval={row.pm_interval} used={Math.max(0, Math.min(row.pm_interval, row.pm_interval - row.miles_left))} state={row.state} /> : "PM reading unavailable"}</Link>
      : <Link to={pmHref(`/maintenance/pm-schedule?unit_id=${encodeURIComponent(row.unit_id)}&create=1`)}>Start PM clock →</Link> },
    { key: "miles_left", label: "Miles", render: (row) => row.miles_left == null || row.odometer_mi == null || !row.pm_schedule_id ? "—" : <Link to={pmHref(`/maintenance/pm-schedule?schedule_id=${encodeURIComponent(row.pm_schedule_id)}`)}>{Math.abs(row.miles_left).toLocaleString("en-US")} {row.miles_left < 0 ? "over" : "to go"}</Link> },
    { key: "state", label: "Status", sortable: true, sortValue: (row) => row.state, render: (row) => statusCell(row) },
  ];
  const rows = (health.data?.units ?? []).filter((row) => {
      if (filter === "all") return true;
      if (filter === "moving") return row.speed_mph != null && Number(row.speed_mph) > 3;
      if (filter === "soon") return ["soon", "overdue"].includes(row.state);
      return row.state === filter;
    });
  // ROUND 9.0 board 22: chips + View all sit in the panel header (design), the table is a bare panel table.
  const chips = [
    { id: "all", label: health.data ? `All ${health.data.kpi.total}` : "All" },
    { id: "moving", label: "Moving" },
    { id: "soon", label: "PM soon" },
    { id: "none", label: "No clock" },
  ] as const;
  return <V3Panel title="Fleet health line — road to the next PM" testId="maintenance-fleet-health-line"
    headerRight={<span className="flex items-center gap-3" data-testid="fleet-health-filters">
      <V3Segmented value={filter as (typeof chips)[number]["id"]} options={[...chips]} onChange={setFilter} testId="fleet-health-chips" />
      <Link className="text-section-header font-semibold text-[#1D4ED8]" to={pmHref("/maintenance/fleet-table?view=health")}>View all →</Link>
    </span>}
    footer="Recorded fleet health and PM schedules. Missing readings are unavailable, never sample values.">
    {health.isError ? <ListErrorState title="Couldn't load fleet health" status={0} message={health.error instanceof Error ? health.error.message : undefined} onRetry={() => void health.refetch()} />
      : <div className="max-h-[420px] overflow-auto" data-testid="fleet-health-table-scroll"><ParityTable appearance="board" panel rows={rows} columns={columns} rowKey={(row) => row.unit_id} loading={health.isPending} storageKey="maintenance-home-fleet-health" emptyText="No units match this filter." /></div>}
  </V3Panel>;
}
