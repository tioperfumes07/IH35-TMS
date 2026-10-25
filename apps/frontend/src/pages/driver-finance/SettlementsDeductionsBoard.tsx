/**
 * ROUND 443.326 — Settlements-Deductions full V3 board (not chromeOnly shell).
 * kpiStrip + MoneyListToolbar + ParityTable in this surface file.
 * Engines unchanged: listSettlements, listSettlementDeductions, getActiveLiabilities,
 * getLiabilitiesKpis, listAutoDeductionPolicies.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  listSettlementDeductions,
  listSettlements,
  type SettlementListRow,
} from "../../api/driverFinance";
import { getActiveLiabilities, getLiabilitiesKpis } from "../../api/liabilities";
import { Button } from "../../components/Button";
import { EntityLink } from "../../components/shared/EntityLink";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { BoardSection } from "../../components/v3/BoardSection";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { V3 } from "../../design/v3-tokens";
import { listAutoDeductionPolicies, type AutoDeductionPolicy } from "../../hooks/useAutoDeductionPolicies";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdTable } from "../../lib/money";
import { CreateSettlementDeductionDrawer } from "../drivers/components/CreateSettlementDeductionDrawer";
import { deductionsWeekSub, S443326 } from "./settlementsV3BoardStrings";

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function thisWeekDeductions(
  rows: SettlementListRow[] | undefined,
  now: Date,
): { dollars: number | null; settlementCount: number | null } {
  if (!rows) return { dollars: null, settlementCount: null };
  const start = startOfWeekSunday(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  let dollars = 0;
  let settlementCount = 0;
  for (const s of rows) {
    if (s.status === "cancelled") continue;
    const pe = new Date(s.period_end);
    if (Number.isNaN(pe.getTime())) continue;
    if (pe.getTime() >= start.getTime() && pe.getTime() < end.getTime()) {
      dollars += Number(s.deductions_total ?? 0);
      settlementCount += 1;
    }
  }
  return { dollars, settlementCount };
}

function deductionsBoardBucket(type: string): "escrow" | "advances" | "fines" | "damages" | "other" {
  const t = (type || "").toLowerCase();
  if (t.includes("escrow") || t.includes("bond") || t.includes("abandon")) return "escrow";
  if (t.includes("advance") || t.includes("zelle") || t.includes("cash_adv") || t.includes("wire") || t.includes("ach_fee")) {
    return "advances";
  }
  if (t === "damage" || t.includes("damage")) return "damages";
  if (t.includes("fine") || t.includes("citation") || t.includes("violation") || t.includes("toll") || t.includes("penalty")) {
    return "fines";
  }
  return "other";
}

function amount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const display = (v: string | number | null) => (v === null || v === undefined ? "—" : String(v));

const TYPE_ROWS = [
  { id: "escrow" as const, label: S443326.deductions.typeEscrow },
  { id: "advances" as const, label: S443326.deductions.typeAdvances },
  { id: "fines" as const, label: S443326.deductions.typeFines },
  { id: "damages" as const, label: S443326.deductions.typeDamages },
] as const;

type ScheduleRow = AutoDeductionPolicy & { remaining_cents: number };

/** Board body only — chrome is SettlementsModuleShell / SettlementsSubNavWrapper (443.326). */
export function SettlementsDeductionsBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const root = "/driver-finance/deductions";
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  const settlementsQuery = useQuery({
    queryKey: ["driver-finance", "settlements", companyId, "deductions-v3-kpi"],
    queryFn: () => listSettlements(companyId),
    enabled: Boolean(companyId),
  });
  const deductionsListQuery = useQuery({
    queryKey: ["driver-finance", "settlement-deductions", companyId, "deductions-v3-by-type"],
    queryFn: () => listSettlementDeductions(companyId, { limit: 500 }),
    enabled: Boolean(companyId),
  });
  const liabilitiesListQuery = useQuery({
    queryKey: ["liabilities", "active", companyId, "deductions-v3-kpi"],
    queryFn: () => getActiveLiabilities(companyId),
    enabled: Boolean(companyId),
  });
  const liabilitiesKpisQuery = useQuery({
    queryKey: ["liabilities", "kpis", companyId, "deductions-v3-kpi"],
    queryFn: () => getLiabilitiesKpis(companyId),
    enabled: Boolean(companyId),
  });
  const policiesQuery = useQuery({
    queryKey: ["auto-deduction-policies", companyId, "active", "deductions-v3-kpi"],
    queryFn: () => listAutoDeductionPolicies(companyId, { status: "active" }),
    enabled: Boolean(companyId),
  });

  const week = useMemo(
    () =>
      settlementsQuery.isError
        ? { dollars: null, settlementCount: null }
        : thisWeekDeductions(settlementsQuery.data?.settlements, new Date()),
    [settlementsQuery.data?.settlements, settlementsQuery.isError],
  );

  const byType = useMemo(() => {
    const empty = {
      escrow: { drivers: new Set<string>(), amount: 0 },
      advances: { drivers: new Set<string>(), amount: 0 },
      fines: { drivers: new Set<string>(), amount: 0 },
      damages: { drivers: new Set<string>(), amount: 0 },
    };
    if (deductionsListQuery.isError || settlementsQuery.isError) return empty;
    const now = new Date();
    const start = startOfWeekSunday(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const settlements = settlementsQuery.data?.settlements ?? [];
    const rows = deductionsListQuery.data?.deductions ?? [];
    for (const d of rows) {
      const st = String(d.status || "").toLowerCase();
      if (st === "voided" || st === "cancelled") continue;
      const created = new Date(d.created_at);
      let inWeek =
        !Number.isNaN(created.getTime()) &&
        created.getTime() >= start.getTime() &&
        created.getTime() < end.getTime();
      if (d.applied_to_settlement_id) {
        const match = settlements.find((s) => s.id === d.applied_to_settlement_id);
        if (match) {
          const pe = new Date(match.period_end);
          inWeek =
            !Number.isNaN(pe.getTime()) &&
            pe.getTime() >= start.getTime() &&
            pe.getTime() < end.getTime();
        }
      }
      if (!inWeek) continue;
      const bucket = deductionsBoardBucket(d.deduction_type);
      if (bucket === "other") continue;
      empty[bucket].drivers.add(d.driver_id);
      empty[bucket].amount += Number(d.amount_cents ?? 0) / 100;
    }
    return empty;
  }, [deductionsListQuery.isError, deductionsListQuery.data, settlementsQuery.isError, settlementsQuery.data]);

  const scheduleRows = useMemo((): ScheduleRow[] => {
    if (policiesQuery.isError) return [];
    const rows = policiesQuery.data?.rows ?? [];
    return [...rows]
      .filter((r) => r.status === "active")
      .map((r) => {
        const owed = Number(r.total_owed_cents ?? 0);
        const deducted = Number(r.deducted_so_far_cents ?? 0);
        return { ...r, remaining_cents: Math.max(0, owed - deducted) };
      })
      .sort(
        (a, b) =>
          (a.driver_name || a.driver_id).localeCompare(b.driver_name || b.driver_id) ||
          a.deduction_type.localeCompare(b.deduction_type),
      );
  }, [policiesQuery.isError, policiesQuery.data]);

  const filteredSchedule = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scheduleRows;
    return scheduleRows.filter((r) => {
      const typeLabel = r.deduction_type_display_name?.trim() || r.deduction_type;
      return `${r.driver_name ?? ""} ${typeLabel}`.toLowerCase().includes(q);
    });
  }, [scheduleRows, search]);

  const openLiabilities = liabilitiesListQuery.isError
    ? null
    : liabilitiesListQuery.data
      ? liabilitiesListQuery.data.liabilities.length
      : null;
  const driversWithDebt = liabilitiesKpisQuery.isError
    ? null
    : amount(liabilitiesKpisQuery.data?.drivers_with_debt);
  const scheduled = policiesQuery.isError
    ? null
    : policiesQuery.data
      ? policiesQuery.data.rows.length
      : null;

  const weekMoney = week.dollars === null ? null : formatUsdTable(week.dollars);
  const byTypeFailed = deductionsListQuery.isError;

  const scheduleColumns = useMemo<ParityColumn<ScheduleRow>[]>(
    () => {
      const c = S443326.deductions;
      return [
      {
        key: "driver",
        label: c.colDriver,
        sortable: true,
        sortValue: (r) => r.driver_name || r.driver_id,
        render: (r) => (
          <EntityLink
            kind="driver"
            id={r.driver_id}
            label={entityLabel(r.driver_name, r.driver_id, c.entityDriver)}
          />
        ),
      },
      {
        key: "type",
        label: c.colType,
        sortable: true,
        sortValue: (r) => r.deduction_type_display_name?.trim() || r.deduction_type,
        render: (r) => r.deduction_type_display_name?.trim() || r.deduction_type,
      },
      {
        key: "per",
        label: c.colPerSettlement,
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.max_per_settlement_cents ?? 0,
        render: (r) => (
          <MoneyCell
            cents={r.max_per_settlement_cents ?? 0}
            drill={{ entity: { kind: "driver", id: r.driver_id } }}
          />
        ),
      },
      {
        key: "remaining",
        label: c.colRemaining,
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.remaining_cents,
        render: (r) => (
          <MoneyCell
            cents={r.remaining_cents}
            drill={{ entity: { kind: "driver", id: r.driver_id } }}
          />
        ),
      },
      {
        key: "next",
        label: c.colNext,
        sortable: true,
        sortValue: (r) => (r.remaining_cents > 0 ? 1 : 0),
        render: (r) => (r.remaining_cents > 0 ? c.nextSettlement : "—"),
      },
    ];
    },
    [],
  );

  const thStyle = {
    textAlign: "left" as const,
    fontSize: 11,
    fontWeight: 700,
    color: V3.muted,
    padding: "7px 12px",
    borderBottom: `1px solid ${V3.border}`,
    background: V3.page,
    whiteSpace: "nowrap" as const,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
  };
  const tdStyle = {
    padding: "7px 12px",
    borderBottom: `1px solid ${V3.borderSoft}`,
    fontSize: 12,
    color: V3.ink,
    whiteSpace: "nowrap" as const,
    fontFamily: V3.font,
    fontVariantNumeric: "tabular-nums" as const,
  };

  return (
    <div
      className="space-y-3"
      data-testid="settlements-deductions-board"
      data-settlements-deductions-rebuild="1"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
          gap: 8,
          fontFamily: V3.font,
        }}
        data-testid="settlements-deductions-kpi-strip"
        data-settlements-deductions-v3-kpis="1"
      >
        <V3KpiTile
          label={S443326.deductions.kpiWeek}
          value={display(weekMoney)}
          sub={
            week.settlementCount === null
              ? undefined
              : deductionsWeekSub(week.settlementCount)
          }
          testId="settlements-deductions-kpi-week"
          onClick={() => navigate("/driver-finance/settlements")}
        />
        <V3KpiTile
          label={S443326.deductions.kpiOpenLiab}
          value={display(openLiabilities === null ? null : Math.round(openLiabilities))}
          testId="settlements-deductions-kpi-open-liab"
          onClick={() => navigate("/driver-finance/liabilities")}
        />
        <V3KpiTile
          label={S443326.deductions.kpiDriversDebt}
          value={display(driversWithDebt === null ? null : Math.round(driversWithDebt))}
          testId="settlements-deductions-kpi-drivers-debt"
          onClick={() => navigate("/driver-finance/liabilities")}
        />
        <V3KpiTile
          label={S443326.deductions.kpiScheduled}
          value={display(scheduled === null ? null : Math.round(scheduled))}
          testId="settlements-deductions-kpi-scheduled"
          onClick={() => navigate(root)}
        />
      </div>

      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={S443326.deductions.searchPlaceholder}
        searchTestId="settlements-deductions-search-input"
        onClearAll={() => setSearch("")}
        activeFilterCount={0}
        testIdPrefix="settlements-deductions"
      >
        <Button
          type="button"
          size="sm"
          data-testid="settlements-deductions-schedule-new"
          onClick={() => setCreateOpen(true)}
          style={{
            height: 28,
            padding: "0 12px",
            fontSize: 12,
            fontWeight: 600,
            background: V3.shell,
            color: "#fff",
            borderRadius: 2,
          }}
        >
          {S443326.deductions.newDeduction}
        </Button>
      </MoneyListToolbar>

      {!companyId ? (
        <p className="text-xs text-red-600">{S443326.deductions.selectCompany}</p>
      ) : null}

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}
        data-testid="settlements-deductions-board-body"
        data-settlements-deductions-board-2col="1"
      >
        <BoardSection
          title={S443326.deductions.sectionByType}
          testId="settlements-deductions-by-type-panel"
          onViewAll={() => navigate("/driver-finance/settlements")}
        >
          <div style={{ overflowX: "auto" }} data-testid="settlements-deductions-by-type-body">
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: V3.font }}>
              <thead>
                <tr>
                  <th style={thStyle}>{S443326.deductions.thType}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{S443326.deductions.thDrivers}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{S443326.deductions.thAmount}</th>
                </tr>
              </thead>
              <tbody>
                {TYPE_ROWS.map((row) => {
                  const bucket = byType[row.id];
                  const loaded = !byTypeFailed;
                  return (
                    <tr key={row.id} data-testid={`settlements-deductions-by-type-${row.id}`}>
                      <td style={tdStyle}>{row.label}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: loaded ? V3.ink : V3.muted }}>
                        {loaded ? bucket.drivers.size : "—"}
                      </td>
                      <td
                        style={{ ...tdStyle, textAlign: "right", color: loaded ? V3.ink : V3.muted }}
                        className="text-right tabular-nums"
                      >
                        {loaded ? (
                          <Link className="underline" to={root} style={{ color: "inherit" }}>
                            {formatUsdTable(bucket.amount)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr data-testid="settlements-deductions-by-type-total">
                  <td
                    style={{
                      ...tdStyle,
                      fontWeight: 700,
                      borderTop: `1px solid ${V3.border}`,
                      background: V3.page,
                      borderBottom: "none",
                    }}
                  >
                    {S443326.deductions.rowTotal}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: 700,
                      borderTop: `1px solid ${V3.border}`,
                      background: V3.page,
                      borderBottom: "none",
                    }}
                  />
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: 700,
                      borderTop: `1px solid ${V3.border}`,
                      background: V3.page,
                      borderBottom: "none",
                    }}
                    className="text-right tabular-nums"
                  >
                    {weekMoney != null ? (
                      <Link className="underline" to={root} style={{ color: "inherit", fontWeight: 700 }}>
                        {display(weekMoney)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </BoardSection>

        <BoardSection
          title={S443326.deductions.sectionSchedule}
          testId="settlements-deductions-schedule-panel"
          onViewAll={() => navigate(root)}
          footer={S443326.deductions.scheduleFooter}
        >
          <ParityTable<ScheduleRow>
            columns={scheduleColumns}
            rows={filteredSchedule}
            rowKey={(r) => r.id}
            loading={policiesQuery.isLoading}
            emptyText={S443326.deductions.emptySchedule}
            storageKey="settlements-deductions-schedule"
            tableTestId="settlements-deductions-schedule-table"
            hidePager
            pageSize={Math.max(1, filteredSchedule.length || 1)}
          />
        </BoardSection>
      </div>

      {companyId ? (
        <CreateSettlementDeductionDrawer
          open={createOpen}
          operatingCompanyId={companyId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlement-deductions"] });
            void queryClient.invalidateQueries({ queryKey: ["auto-deduction-policies", companyId] });
          }}
        />
      ) : null}
    </div>
  );
}
