// Board 43 — docs/design/v3/maintenance-vehicle-graphics/Main.dc.html "Fleet Health Line": every truck on its
// road to the next PM. Full page (Maintenance › Fleet Table ?view=health); the Maintenance Home panel (Board 22)
// keeps its own compact table and links here with "View all →".
// TABLE_DATE_OMIT: one row per UNIT with its current health; each unit's last-reported telemetry time is in the location title.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { readFleetHealth, type FleetHealthRow } from "./fleet-health-source";
import { FleetTruck } from "./FleetHealthLine";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatDateTimeUS } from "../../../lib/formatDate";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";

const labels = { ok: "Healthy", soon: "PM soon", overdue: "PM overdue", shop: "In shop", none: "No PM clock" };
/** Board 43 (maintenance-vehicle-graphics/Main.dc.html) per-state road / left-label / status-pill colours. */
const TONE = {
  ok: { road: "#1F3A5F", left: "#33415A", bg: "#E3ECF8", fg: "#14213D" },
  soon: { road: "#C76A0A", left: "#C76A0A", bg: "#FDEBD3", fg: "#8A4B06" },
  overdue: { road: "#C0262D", left: "#C0262D", bg: "#FBE1E1", fg: "#8E1B20" },
  shop: { road: "#64748B", left: "#33415A", bg: "#E3E8EF", fg: "#33415A" },
  none: { road: "#94A3B8", left: "#5B6B7E", bg: "#EEF1F5", fg: "#5B6B7E" },
} as const;
/** Board grid: UNIT 70 · TRACTOR 150 · MAKE·MODEL 150 · ROAD 1fr · NEXT PM 96 · LOCATION 190 · STATUS 112. */
const GRID = "grid grid-cols-[70px_150px_150px_minmax(0,1fr)_96px_190px_112px] items-center px-4";
const PLAN_PCT = 80;
const isMoving = (row: FleetHealthRow) => row.speed_mph != null && Number(row.speed_mph) > 3;
const FILTERS = ["all", "moving", "soon", "none"] as const;

export function FleetHealthLineBoard({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = (FILTERS as readonly string[]).includes(searchParams.get("fh") ?? "") ? (searchParams.get("fh") as (typeof FILTERS)[number]) : "all";
  const setFilter = (next: string) => setSearchParams((prev) => { const p = new URLSearchParams(prev); if (next === "all") p.delete("fh"); else p.set("fh", next); return p; }, { replace: true });
  const origin = useMemo(() => currentOriginHref(pathname, search), [pathname, search]);
  const pmHref = (href: string) => withReturnContext(href, origin);
  const health = useQuery({ queryKey: ["maintenance", "fleet-health", companyId], queryFn: () => readFleetHealth(companyId), enabled: Boolean(companyId), staleTime: 60_000, refetchInterval: 180_000 });
  const missingCell = (row: FleetHealthRow) => {
    if (row.pm_baseline_absent && row.pm_schedule_id && row.state !== "shop") {
      return <Link to={pmHref(`/maintenance/pm-schedule?schedule_id=${encodeURIComponent(row.pm_schedule_id)}`)} data-testid="fleet-health-no-last-pm">{t("maintenance.fleetHealth.noLastPm")}</Link>;
    }
    if (row.odometer_mi == null && !["shop", "none"].includes(row.state)) return t("maintenance.fleetHealth.odometerUnavailable");
    if ((row.miles_left == null || !row.pm_interval) && !["shop", "none"].includes(row.state)) return t("maintenance.fleetHealth.pmReadingUnavailable");
    return null;
  };
  const all = health.data?.units ?? [];
  const rows = all.filter((row) => filter === "all" ? true : filter === "moving" ? isMoving(row) : filter === "soon" ? ["soon", "overdue"].includes(row.state) : row.state === filter);
  const tiles = [
    { id: "all", n: health.data?.kpi.total, label: "TRUCKS", color: "#14213D" },
    { id: "moving", n: all.filter(isMoving).length, label: "MOVING", color: "#2456C7" },
    { id: "soon", n: all.filter((r) => r.state === "soon" || r.state === "overdue").length, label: "PM SOON", color: "#C76A0A" },
    { id: "none", n: all.filter((r) => r.state === "none").length, label: "NO CLOCK", color: "#5B6B7E" },
  ] as const;
  return <section className="min-w-0 space-y-3 rounded-[14px] bg-[#E9EDF2] p-4" aria-label="Fleet Health Line" data-testid="fleet-health-line-board">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-3.5">
        <h1 className="m-0 text-page-title font-extrabold leading-none text-[#14213D]">Fleet Health Line</h1>
        <span className="text-xs text-[#4A5A70]">Each truck on its road to the next PM · live Samsara odometer · recorded PM interval per truck</span>
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="fleet-health-board-tiles">
        {tiles.map((tile) => <button key={tile.id} type="button" aria-pressed={filter === tile.id} onClick={() => setFilter(tile.id)}
          className={`inline-flex h-9 items-center gap-2 rounded-[9px] bg-white px-3 shadow-[0_1px_0_#D5DCE5] ${filter === tile.id ? "ring-2 ring-[#14213D]" : ""}`}>
          <span className="text-xs font-extrabold" style={{ color: tile.color }}>{health.data ? tile.n : "—"}</span>
          <span className="text-section-header font-bold tracking-[.08em] text-[#33415A]">{tile.label}</span>
        </button>)}
        <Link to={pmHref("/maintenance/work-orders/new")} className="inline-flex h-9 items-center rounded-[9px] bg-[#14213D] px-4 text-xs font-semibold text-white">New work order</Link>
      </div>
    </header>
    {health.isError ? <ListErrorState title="Couldn't load fleet health" status={0} message={health.error instanceof Error ? health.error.message : undefined} onRetry={() => void health.refetch()} />
      : <div className="overflow-x-auto rounded-[14px] bg-white shadow-[0_1px_0_#D5DCE5]">
        <div className="min-w-[1200px]" role="table" aria-label="Fleet health line">
          <div role="row" className={`${GRID} sticky top-0 z-[1] border-b border-[#E3E8EF] bg-white py-2 text-section-header font-bold tracking-[.12em] text-[#5B6B7E]`}>
            <div role="columnheader">UNIT</div><div role="columnheader">TRACTOR</div><div role="columnheader">MAKE · MODEL</div>
            <div role="columnheader">ROAD TO NEXT PM · 0 — {PLAN_PCT}% PLAN — INTERVAL</div><div role="columnheader">NEXT PM</div>
            <div role="columnheader">LOCATION</div><div role="columnheader">STATUS</div>
          </div>
          {health.isPending ? <p role="status" className="px-4 py-3 text-xs text-[#5B6B7E]">Loading fleet health…</p>
            : rows.length === 0 ? <p className="px-4 py-3 text-xs text-[#5B6B7E]">No units match this filter.</p>
            : rows.map((row) => {
              const tone = TONE[row.state];
              const missing = missingCell(row);
              const hasRoad = Boolean(row.pm_schedule_id && row.pm_interval && row.miles_left != null && row.odometer_mi != null);
              const used = hasRoad ? Math.max(0, Math.min(row.pm_interval!, row.pm_interval! - row.miles_left!)) : 0;
              const schedHref = row.pm_schedule_id ? pmHref(`/maintenance/pm-schedule?schedule_id=${encodeURIComponent(row.pm_schedule_id)}`) : pmHref(`/maintenance/pm-schedule?unit_id=${encodeURIComponent(row.unit_id)}&create=1`);
              const loc = row.formatted_location || [row.telemetry_city, row.telemetry_state].filter(Boolean).join(", ") || "Location unavailable";
              return <div role="row" key={row.unit_id} className={`${GRID} h-14 border-b border-[#F0F3F7]`} data-testid={`fleet-health-row-${row.unit_id}`}>
                <div role="cell" className="text-xs font-extrabold"><EntityLink kind="unit" id={row.unit_id} label={row.unit_number} /></div>
                <div role="cell"><FleetTruck row={row} size="board" moving={isMoving(row)} alert={row.state === "soon" || row.state === "overdue"} /></div>
                <div role="cell" className="flex min-w-0 flex-col gap-px">
                  <span className="truncate text-xs font-bold text-[#14213D]">{[row.make, row.model, row.year].filter(Boolean).join(" · ") || "—"}</span>
                  <span className="font-mono text-xs text-[#5B6B7E]">{row.odometer_mi == null ? "Odometer unavailable" : <EntityLink kind="unit" id={row.unit_id} label={`${Math.round(Number(row.odometer_mi)).toLocaleString("en-US")} mi`} />}</span>
                </div>
                <div role="cell" className="flex min-w-0 flex-col gap-0.5 pr-[22px]">
                  {hasRoad ? <>
                    <Link to={schedHref} aria-label={`${row.unit_number}: PM schedule`} className="block">
                      <span className="block" role="progressbar" aria-valuemin={0} aria-valuemax={row.pm_interval!} aria-valuenow={Math.round(used)} data-testid="fleet-health-pm-bar"><svg width="100%" height="16" viewBox="0 0 600 16" preserveAspectRatio="none" aria-hidden="true">
                        <rect x="0" y="4" width="600" height="8" rx="4" fill="#DCE2EA" />
                        <rect x="0" y="4" width={(used / row.pm_interval!) * 600} height="8" rx="4" fill={tone.road} />
                        <rect x={PLAN_PCT * 6 - 1} y="1" width="2.5" height="14" fill="#C76A0A" />
                        <rect x="596" y="0" width="4" height="16" fill="#C0262D" />
                      </svg></span>
                    </Link>
                    <div className="flex justify-between gap-2 text-xs text-[#4A5A70]">
                      <span>{Math.round(used).toLocaleString("en-US")} mi since PM · {row.pm_interval!.toLocaleString("en-US")} interval</span>
                      <Link to={schedHref} className="font-bold" style={{ color: tone.left }}>{Math.abs(row.miles_left!).toLocaleString("en-US")} {row.miles_left! < 0 ? "over" : "to go"}</Link>
                    </div>
                  </> : <span className="text-xs text-[#4A5A70]">{missing ?? (row.pm_schedule_id ? t("maintenance.fleetHealth.pmReadingUnavailable") : <Link to={schedHref}>Start PM clock →</Link>)}</span>}
                </div>
                <div role="cell" className="text-xs font-extrabold" style={{ color: tone.left }}>{hasRoad ? `${Math.round(Number(row.odometer_mi) + row.miles_left!).toLocaleString("en-US")}` : "—"}</div>
                <div role="cell" className="min-w-0 truncate text-xs text-[#33415A]" title={row.telemetry_at ? `Last reported ${formatDateTimeUS(row.telemetry_at)}` : "No telemetry timestamp"}>{loc}</div>
                <div role="cell"><span className="inline-flex items-center gap-[5px] justify-self-start rounded-full px-[9px] py-[3px] text-xs font-bold" style={{ background: tone.bg, color: tone.fg }}><span aria-hidden="true" className="h-[7px] w-[7px] rounded" style={{ background: tone.road }} />{labels[row.state]}</span></div>
              </div>;
            })}
        </div>
      </div>}
    <p className="m-0 text-xs font-semibold text-[#5B6B7E]">Live unit records, Samsara odometers and locations, and recorded PM schedules. A truck with no last-PM odometer shows that fact — never a sample position.</p>
  </section>;
}
