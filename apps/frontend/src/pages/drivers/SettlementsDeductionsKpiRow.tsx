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
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { BoardSection } from "../../components/v3/BoardSection";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { V3 } from "../../design/v3-tokens";
import { listAutoDeductionPolicies } from "../../hooks/useAutoDeductionPolicies";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdTable } from "../../lib/money";
import { CreateSettlementDeductionDrawer } from "./components/CreateSettlementDeductionDrawer";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

/** A missing or non-numeric amount is UNKNOWN (null → "—"), never a confident 0. */
function amountOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * ROUND 443.274-C — Settlements-Deductions board
 * (Settlements-Deductions.dc.html).
 *
 * KPIs: Deductions this week · Open liabilities · Drivers w/ debt · Scheduled deductions.
 * Body: By type · this week (Escrow / Advances / Fines / Damages) beside Schedule
 * (Driver · Type · Per settlement · Remaining · Next). Engines unchanged:
 * listSettlements week sum, listSettlementDeductions (same bucket rules as Settlements
 * home), getActiveLiabilities, getLiabilitiesKpis, listAutoDeductionPolicies.
 */

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
  let dollars: number | null = 0;
  let settlementCount = 0;
  for (const s of rows) {
    if (s.status === "cancelled") continue;
    const pe = new Date(s.period_end);
    if (Number.isNaN(pe.getTime())) continue;
    if (pe.getTime() >= start.getTime() && pe.getTime() < end.getTime()) {
      const d = amountOrNull(s.deductions_total);
      // One settlement whose total is unknown makes the week's total unknown — not understated.
      dollars = d == null || dollars == null ? null : dollars + d;
      settlementCount += 1;
    }
  }
  return { dollars, settlementCount };
}

/** Board buckets — Damages is its own row (Settlements home folds damage into Fines). */
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
  { id: "escrow" as const, label: "Escrow" },
  { id: "advances" as const, label: "Advances" },
  { id: "fines" as const, label: "Fines" },
  { id: "damages" as const, label: "Damages" },
] as const;

type Props = {
  /** Settlements module mount keeps KPI drills under /driver-finance. */
  basePath?: string;
};

export function SettlementsDeductionsKpiRow({ basePath = "/driver-finance/deductions" }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [createOpen, setCreateOpen] = useState(false);

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
      escrow: { drivers: new Set<string>(), amount: 0 as number | null },
      advances: { drivers: new Set<string>(), amount: 0 as number | null },
      fines: { drivers: new Set<string>(), amount: 0 as number | null },
      damages: { drivers: new Set<string>(), amount: 0 as number | null },
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
      let inWeek = !Number.isNaN(created.getTime()) && created.getTime() >= start.getTime() && created.getTime() < end.getTime();
      if (d.applied_to_settlement_id) {
        const match = settlements.find((s) => s.id === d.applied_to_settlement_id);
        if (match) {
          const pe = new Date(match.period_end);
          inWeek = !Number.isNaN(pe.getTime()) && pe.getTime() >= start.getTime() && pe.getTime() < end.getTime();
        }
      }
      if (!inWeek) continue;
      const bucket = deductionsBoardBucket(d.deduction_type);
      if (bucket === "other") continue;
      empty[bucket].drivers.add(d.driver_id);
      const cents = amountOrNull(d.amount_cents);
      // An unknown line amount makes the bucket total unknown (null → "—"), never silently smaller.
      const prev = empty[bucket].amount;
      empty[bucket].amount = cents == null || prev == null ? null : prev + cents / 100;
    }
    return empty;
  }, [deductionsListQuery.isError, deductionsListQuery.data, settlementsQuery.isError, settlementsQuery.data]);

  const scheduleRows = useMemo(() => {
    if (policiesQuery.isError) return [];
    const rows = policiesQuery.data?.rows ?? [];
    return [...rows]
      .filter((r) => r.status === "active")
      .sort((a, b) =>
        (a.driver_name || a.driver_id).localeCompare(b.driver_name || b.driver_id) ||
        a.deduction_type.localeCompare(b.deduction_type),
      );
  }, [policiesQuery.isError, policiesQuery.data]);

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

  const root = basePath.replace(/\/+$/, "") || "/driver-finance/deductions";

  const remainingOf = (row: (typeof scheduleRows)[number]): number | null => {
    const owed = amountOrNull(row.total_owed_cents);
    const deducted = amountOrNull(row.deducted_so_far_cents);
    return owed == null || deducted == null ? null : Math.max(0, owed - deducted);
  };
  const scheduleColumns: ParityColumn<(typeof scheduleRows)[number]>[] = [
    {
      key: "driver",
      label: "Driver",
      sortable: true,
      sortValue: (row) => row.driver_name || row.driver_id,
      render: (row) => (
        <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
      ),
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      sortValue: (row) => row.deduction_type_display_name?.trim() || row.deduction_type,
      render: (row) => row.deduction_type_display_name?.trim() || row.deduction_type,
    },
    {
      key: "per",
      label: "Per settlement",
      sortable: true,
      kind: "money",
      sortValue: (row) => amountOrNull(row.max_per_settlement_cents) ?? -1,
      render: (row) => (
        <MoneyCell cents={amountOrNull(row.max_per_settlement_cents)} drill={{ entity: { kind: "driver", id: row.driver_id } }} />
      ),
    },
    {
      key: "remaining",
      label: "Remaining",
      sortable: true,
      kind: "money",
      sortValue: (row) => remainingOf(row) ?? -1,
      render: (row) => <MoneyCell cents={remainingOf(row)} drill={{ entity: { kind: "driver", id: row.driver_id } }} />,
    },
    {
      key: "next",
      label: "Next",
      sortable: true,
      sortValue: (row) => ((remainingOf(row) ?? 0) > 0 ? 1 : 0),
      render: (row) => {
        const remaining = remainingOf(row);
        return remaining != null && remaining > 0 ? "Next settlement" : "—";
      },
    },
    // Gear column (Rule 07 additive; owner 2026-10-25 "columns can be added or removed in the gear filter") —
    // the date the schedule was set up (auto_deduction_policies.created_at). Hidden by default, one click to show.
    {
      key: "created_at",
      label: "Started",
      sortable: true,
      defaultHidden: true,
      sortValue: (row) => row.created_at ?? "",
      render: (row) => (row.created_at ? formatDateUS(row.created_at) : "—"),
    },
  ];
  const weekMoney = week.dollars === null ? null : formatUsdTable(week.dollars);
  const byTypeFailed = deductionsListQuery.isError;

  return (
    <div className="space-y-3" data-testid="settlements-deductions-v3-chrome">
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
          label="Deductions this week"
          value={display(weekMoney)}
          sub={
            week.settlementCount === null
              ? undefined
              : `${week.settlementCount} settlement${week.settlementCount === 1 ? "" : "s"}`
          }
          testId="settlements-deductions-kpi-week"
          onClick={() => navigate("/driver-finance/settlements")}
        />
        <V3KpiTile
          label="Open liabilities"
          value={display(openLiabilities === null ? null : Math.round(openLiabilities))}
          testId="settlements-deductions-kpi-open-liab"
          onClick={() => navigate("/driver-finance/liabilities")}
        />
        <V3KpiTile
          label="Drivers w/ debt"
          value={display(driversWithDebt === null ? null : Math.round(driversWithDebt))}
          testId="settlements-deductions-kpi-drivers-debt"
          onClick={() => navigate("/driver-finance/liabilities")}
        />
        <V3KpiTile
          label="Scheduled deductions"
          value={display(scheduled === null ? null : Math.round(scheduled))}
          testId="settlements-deductions-kpi-scheduled"
          onClick={() => navigate(root)}
        />
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}
        data-testid="settlements-deductions-board-body"
        data-settlements-deductions-board-2col="1"
      >
        <BoardSection
          title="By type · this week"
          testId="settlements-deductions-by-type-panel"
          onViewAll={() => navigate("/driver-finance/settlements")}
        >
          <div style={{ overflowX: "auto" }} data-testid="settlements-deductions-by-type-body">
            <ParityTable<(typeof TYPE_ROWS)[number]>
              tableTestId="settlements-deductions-by-type-table"
              appearance="board"
              hidePager
              density="compact"
              suppressToolbarSearch
              suppressToolbarRange
              rows={[...TYPE_ROWS]}
              rowKey={(row) => row.id}
              rowTestId={(row) => `settlements-deductions-by-type-${row.id}`}
              emptyText="—"
              columns={[
                { key: "type", label: "Type", sortable: true, sortValue: (row) => row.label, render: (row) => row.label },
                {
                  key: "drivers",
                  label: "Drivers",
                  sortable: true,
                  kind: "number",
                  sortValue: (row) => (byTypeFailed ? -1 : byType[row.id].drivers.size),
                  // 443.282 — loaded zeros show $0.00 / 0, not "—" (em-dash is error/unload only).
                  render: (row) =>
                    byTypeFailed ? <span style={{ color: V3.muted }}>—</span> : byType[row.id].drivers.size,
                },
                {
                  key: "amount",
                  label: "Amount",
                  sortable: true,
                  kind: "money",
                  sortValue: (row) => (byTypeFailed ? -1 : (byType[row.id].amount ?? -1)),
                  render: (row) => {
                    if (byTypeFailed) return <span style={{ color: V3.muted }}>—</span>;
                    const amt = byType[row.id].amount;
                    return (
                      <Link className="underline" to={root} style={{ color: "inherit" }}>
                        {amt == null ? "—" : formatUsdTable(amt)}
                      </Link>
                    );
                  },
                },
              ]}
              footerCells={{
                type: (
                  <span data-testid="settlements-deductions-by-type-total" style={{ fontWeight: 700 }}>
                    Total
                  </span>
                ),
                amount: (
                  <span className="text-right tabular-nums" style={{ fontWeight: 700 }}>
                    {weekMoney != null ? (
                      <Link className="underline" to={root} style={{ color: "inherit", fontWeight: 700 }}>
                        {display(weekMoney)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </span>
                ),
              }}
            />
          </div>
        </BoardSection>

        <BoardSection
          title="Schedule"
          testId="settlements-deductions-schedule-panel"
          onViewAll={() => navigate(root)}
          headerRight={
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
              + New deduction
            </Button>
          }
          footer="Every deduction links to its liability, settlement line and journal entry."
        >
          <div style={{ overflowX: "auto" }} data-testid="settlements-deductions-schedule-body">
            <ParityTable<(typeof scheduleRows)[number]>
              tableTestId="settlements-deductions-schedule-table"
              appearance="board"
              hidePager
              density="compact"
              suppressToolbarSearch
              suppressToolbarRange
              rows={policiesQuery.isError ? [] : scheduleRows}
              rowKey={(row) => row.id}
              rowTestId={(row) => `settlements-deductions-schedule-row-${row.id}`}
              loading={policiesQuery.isLoading}
              emptyText={
                policiesQuery.isError ? "Schedule failed to load — retry from the policies list below." : "No active deduction schedules."
              }
              columns={scheduleColumns}
            />
          </div>
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
