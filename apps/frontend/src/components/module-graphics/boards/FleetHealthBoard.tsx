import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listUnits } from "../../../api/mdata";
import { listMaintPmDue, getMaintenanceRmStatus, type MaintPmDueRow } from "../../../api/maintenance";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell, ModSectionHead } from "../ModBoardShell";
import { TractorTopView } from "../TractorTopView";
import { bodyStyleFromMakeModel } from "../bodyStyle";
import { formatNumber } from "../format";
import { getFleetHealth, type FleetHealthUnit } from "../api";

type Props = { companyId: string };

type RowState = "ok" | "soon" | "overdue" | "shop" | "no_clock";

const STATE_CAB: Record<RowState, string> = {
  ok: "#1F8A4C",
  soon: "#C76A0A",
  overdue: "#C0262D",
  shop: "#2456C7",
  no_clock: "#5B6B7E",
};

const STATE_LABEL: Record<RowState, string> = {
  ok: "OK",
  soon: "Soon",
  overdue: "Overdue",
  shop: "In shop",
  no_clock: "Enter last PM",
};

function stateFromPm(row: MaintPmDueRow | undefined, inShop: boolean): RowState {
  if (inShop) return "shop";
  if (!row || (row.miles_remaining == null && row.days_remaining == null && !row.next_due_date)) {
    return "no_clock";
  }
  if (row.is_due) return "overdue";
  if (row.days_remaining != null && row.days_remaining <= 14) return "soon";
  if (row.miles_remaining != null && row.miles_remaining <= 2000) return "soon";
  return "ok";
}

/**
 * ROUND 443.245 — Fleet Health Line (LEAD-MAINT-DESIGN-Main).
 * Prefers GET /maintenance/fleet-health; falls back to units + PM due + R&M status.
 */
export function FleetHealthBoard({ companyId }: Props) {
  const apiQ = useQuery({
    queryKey: ["mod-graphics", "fleet-health", companyId],
    queryFn: () => getFleetHealth(companyId),
    enabled: Boolean(companyId),
    retry: false,
  });

  const unitsQ = useQuery({
    queryKey: ["mod-graphics", "fleet-units", companyId],
    queryFn: () => listUnits({ operating_company_id: companyId, status: "InService", limit: 500 }),
    enabled: Boolean(companyId) && apiQ.data == null && !apiQ.isLoading,
    retry: false,
  });
  const pmQ = useQuery({
    queryKey: ["mod-graphics", "fleet-pm", companyId],
    queryFn: () => listMaintPmDue(companyId, { includeNotDue: true }),
    enabled: Boolean(companyId) && apiQ.data == null && !apiQ.isLoading,
    retry: false,
  });
  const rmQ = useQuery({
    queryKey: ["mod-graphics", "fleet-rm", companyId],
    queryFn: () => getMaintenanceRmStatus(companyId, { limit: 200 }),
    enabled: Boolean(companyId) && apiQ.data == null && !apiQ.isLoading,
    retry: false,
  });

  const rows = useMemo((): FleetHealthUnit[] => {
    if (apiQ.data?.units?.length) return apiQ.data.units;

    const shopIds = new Set<string>();
    for (const wo of [
      ...(rmQ.data?.in_house ?? []),
      ...(rmQ.data?.external ?? []),
      ...(rmQ.data?.roadside ?? []),
    ]) {
      const uid = (wo as { unit_id?: string }).unit_id;
      if (uid) shopIds.add(uid);
    }

    const pmByAsset = new Map<string, MaintPmDueRow>();
    for (const r of pmQ.data?.rows ?? []) {
      const prev = pmByAsset.get(r.asset_id);
      if (!prev || (r.miles_remaining ?? 999999) < (prev.miles_remaining ?? 999999)) {
        pmByAsset.set(r.asset_id, r);
      }
    }

    const units = (unitsQ.data?.units ?? []).filter((u) => {
      const t = String((u as { type?: string }).type ?? "").toLowerCase();
      return t === "truck" || t === "tractor" || !t;
    });

    return units.map((u) => {
      const id = String((u as { id: string }).id);
      const make = (u as { make?: string | null }).make;
      const model = (u as { model?: string | null }).model;
      const pm = pmByAsset.get(id);
      const state = stateFromPm(pm, shopIds.has(id));
      return {
        unit_id: id,
        unit_number: String((u as { unit_number?: string }).unit_number ?? "—"),
        make,
        model,
        year: (u as { year?: number | null }).year,
        body_style: bodyStyleFromMakeModel(make, model),
        odometer_mi: pm?.current_odometer_mi ?? null,
        captured_at: pm?.odometer_reading_at ?? null,
        location: null,
        moving: false,
        since_last_pm_mi: null,
        miles_left: pm?.miles_remaining ?? null,
        next_pm_date: pm?.next_due_date ?? null,
        state,
        open_wo_id: null,
        open_wo_status: null,
        fault_count: null,
        driver_name: null,
        load_number: null,
      };
    });
  }, [apiQ.data, unitsQ.data, pmQ.data, rmQ.data]);

  const kpis = useMemo(() => {
    if (apiQ.data?.kpis) return apiQ.data.kpis;
    const c = { ok: 0, soon: 0, overdue: 0, shop: 0, no_clock: 0 };
    for (const r of rows) {
      const s = (r.state ?? "no_clock") as RowState;
      c[s] += 1;
    }
    return c;
  }, [apiQ.data, rows]);

  const loading = apiQ.isLoading || (apiQ.data == null && (unitsQ.isLoading || pmQ.isLoading));
  const errored = apiQ.isError && unitsQ.isError;

  return (
    <ModBoardShell
      eyebrow="Maintenance · USMCA · live"
      title="Fleet Health Line"
      subtitle="Every in-service truck — PM clock, location, shop state"
      testId="fleet-health-board"
    >
      <div className="mod-board__kpi-grid">
        <ClickableStat
          label="OK"
          value={formatNumber(kpis.ok ?? 0)}
          to="/maintenance/fleet-table?status=in-service"
          testId="fleet-health-kpi-ok"
        />
        <ClickableStat
          label="Soon ≤14d"
          value={formatNumber(kpis.soon ?? 0)}
          to="/maintenance/pm-due"
          testId="fleet-health-kpi-soon"
        />
        <ClickableStat
          label="Overdue"
          value={formatNumber(kpis.overdue ?? 0)}
          to="/maintenance/pm-due?filter=overdue"
          testId="fleet-health-kpi-overdue"
        />
        <ClickableStat
          label="In shop"
          value={formatNumber(kpis.shop ?? 0)}
          to="/maintenance/fleet-table?status=in-shop"
          testId="fleet-health-kpi-shop"
        />
      </div>

      <ModSectionHead title="Trucks" viewAllTo="/maintenance/fleet-table" />

      {errored ? (
        <p className="mod-board__sub">Fleet health could not be loaded.</p>
      ) : loading ? (
        <p className="mod-board__sub">Loading fleet…</p>
      ) : rows.length === 0 ? (
        <p className="mod-board__sub" data-testid="fleet-health-empty">
          No in-service trucks for this company. Start a PM clock when the first unit is ready.
        </p>
      ) : (
        <div className="space-y-1" data-testid="fleet-health-rows">
          {rows.map((r) => {
            const state = (r.state ?? "no_clock") as RowState;
            const body = r.body_style ?? bodyStyleFromMakeModel(r.make, r.model);
            const planMi = 20000;
            const pmMi = 25000;
            const since = r.since_last_pm_mi;
            const fillPct =
              since != null && Number.isFinite(since) ? Math.min(100, Math.max(0, (since / pmMi) * 100)) : 0;
            return (
              <Link
                key={r.unit_id}
                to={`/fleet/units/${r.unit_id}`}
                className="flex items-center gap-2 rounded-sm border border-[var(--mod-border)] bg-[var(--mod-wash)] px-2 py-1.5 no-underline text-inherit hover:border-[var(--mod-navy)]"
                data-mod-click-through="1"
                data-testid={`fleet-health-row-${r.unit_number}`}
                style={{ minHeight: 56 }}
              >
                <TractorTopView
                  bodyStyle={body}
                  cabColor={STATE_CAB[state]}
                  moving={Boolean(r.moving)}
                  alert={state === "overdue" || state === "soon"}
                  size={72}
                  unitLabel={r.unit_number}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-[family-name:var(--mod-font-cond)] text-[14px] font-semibold text-[var(--mod-navy)]">
                      {r.unit_number}
                    </span>
                    <span className="truncate text-[12px] text-[var(--mod-muted)]">
                      {[r.year, r.make, r.model].filter(Boolean).join(" ")}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-sm bg-[#D5DBE3]">
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${fillPct}%`,
                        background:
                          state === "overdue" ? "var(--mod-red)" : state === "soon" ? "var(--mod-amber)" : "var(--mod-green)",
                      }}
                      title={
                        since != null
                          ? `${formatNumber(since)} mi since PM · plan ${formatNumber(planMi)} · PM ${formatNumber(pmMi)}`
                          : "No PM clock"
                      }
                    />
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-[var(--mod-muted)]">
                    <span>
                      {r.miles_left != null ? `${formatNumber(r.miles_left)} mi left` : "— mi left"}
                    </span>
                    <span>{r.next_pm_date ? `Next PM ${r.next_pm_date}` : "Next PM —"}</span>
                    <span>{r.location ?? "Location —"}</span>
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase"
                  style={{
                    color: STATE_CAB[state],
                    background: "#fff",
                    border: `1px solid ${STATE_CAB[state]}`,
                  }}
                >
                  {STATE_LABEL[state]}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </ModBoardShell>
  );
}
