/**
 * Row 80 (11-03 register) — Reports › Driver settlement report, board docs/design/v3/V3-Reports-DriverSettlements.dc.html.
 * Data: GET /api/v1/reports/driver-settlements (driver-settlements-report.service.ts — driver_finance.driver_settlements,
 * cancelled and voided excluded). Paid = COALESCE(payment_sent_at, paid_at) on the settlement — the payment-issued event.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDriverSettlementsReport, type DriverSettlementsReportRow } from "../../../api/reports";
import { EntityMultiSelect } from "../../../components/EntityMultiSelect";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ReportFilterBar } from "../../../components/reports/ReportFilterBar";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useStagedListFilters } from "../../../components/table";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { companyToday } from "../../../lib/businessDate";
import { mmmDd } from "../../../lib/formatDate";
import { formatPersonName } from "../../../lib/formatPersonName";
import { formatUsdCents } from "../../../lib/money";
import { statusOptions } from "../../../lib/statusListParams";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { ReportBoardShell, ReportKpiGrid, ReportMeasuredNote } from "./ReportBoardShell";
import { groupBy, monthKey, sumBy, weekStartIso } from "./reportBoardGroup";

type GroupBy = "settlement" | "driver" | "week" | "month";
const GROUP_OPTIONS: Array<{ id: GroupBy; label: string }> = [
  { id: "settlement", label: "Settlement" },
  { id: "driver", label: "Driver" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];
const STATUS_OPTIONS = statusOptions({ open: "Open", closed: "Closed" });

type Filters = { start: string; end: string; driverId: string; status: string[]; paid: Array<"paid" | "unpaid"> };
const PAID_OPTIONS = statusOptions({ paid: "Paid", unpaid: "Unpaid" });

type GroupRow = {
  key: string;
  label: string;
  driverId: string | null;
  rows: DriverSettlementsReportRow[];
  settlements: number;
  loads: number;
  gross: number;
  deductions: number;
  reimb: number;
  net: number;
  unpaidNet: number;
};

const money = (cents: number) => formatUsdCents(cents);

function loadsRange(r: DriverSettlementsReportRow) {
  if (!r.first_load_number) return "—";
  return r.first_load_number === r.last_load_number ? r.first_load_number : `${r.first_load_number}–${r.last_load_number}`;
}

function periodLabel(r: DriverSettlementsReportRow) {
  return `${mmmDd(r.period_start)}–${mmmDd(r.period_end)}`;
}

function isClosedUnpaid(r: DriverSettlementsReportRow) {
  return r.status === "closed" && !r.paid_at;
}

export function DriverSettlementsReportBoard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const emptyFilters: Filters = { start: `${companyToday().slice(0, 4)}-01-01`, end: companyToday(), driverId: "", status: [], paid: [] };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({ applied, empty: emptyFilters, onApply: setApplied });
  const [search, setSearch] = useState("");
  const [by, setBy] = useState<GroupBy>("settlement");
  const [drill, setDrill] = useState<{ key: string; label: string } | null>(null);

  const query = useQuery({
    queryKey: ["reports", "driver-settlements-board", companyId, { ...applied, status: applied.status.join(","), paid: applied.paid.join(",") }],
    queryFn: () =>
      getDriverSettlementsReport({
        operating_company_id: companyId,
        from: applied.start,
        to: applied.end,
        driver_id: applied.driverId || undefined,
        status: applied.status.length ? applied.status.join(",") : undefined,
        // Both or neither selected = every settlement.
        paid: applied.paid.length === 1 ? applied.paid[0] : undefined,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const rows = useMemo(() => {
    const list = query.data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.display_id, r.settlement_number, r.driver_name, r.first_load_number, r.last_load_number].some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [query.data?.rows, search]);

  const totals = useMemo(
    () => ({
      settlements: rows.length,
      drivers: new Set(rows.map((r) => r.driver_id)).size,
      gross: sumBy(rows, (r) => r.gross_cents),
      deductions: sumBy(rows, (r) => r.deductions_cents),
      reimb: sumBy(rows, (r) => r.advances_cents),
      net: sumBy(rows, (r) => r.net_cents),
      loads: sumBy(rows, (r) => r.load_count),
      closedUnpaid: rows.filter(isClosedUnpaid),
      noNumber: rows.filter((r) => r.status === "closed" && !r.settlement_number),
    }),
    [rows]
  );

  const keyOf = (r: DriverSettlementsReportRow, g: GroupBy) =>
    g === "driver" ? r.driver_id : g === "week" ? weekStartIso(r.period_end) : g === "month" ? monthKey(r.period_end) : r.settlement_id;

  const groups = useMemo<GroupRow[]>(() => {
    if (by === "settlement") return [];
    const out: GroupRow[] = [];
    for (const [key, list] of groupBy(rows, (r) => keyOf(r, by))) {
      const label =
        by === "driver"
          ? formatPersonName(list[0].driver_name)
          : by === "week"
            ? `Week of ${mmmDd(key)}`
            : `${key.slice(5, 7)}/${key.slice(0, 4)}`;
      out.push({
        key,
        label,
        driverId: by === "driver" ? key : null,
        rows: list,
        settlements: list.length,
        loads: sumBy(list, (r) => r.load_count),
        gross: sumBy(list, (r) => r.gross_cents),
        deductions: sumBy(list, (r) => r.deductions_cents),
        reimb: sumBy(list, (r) => r.advances_cents),
        net: sumBy(list, (r) => r.net_cents),
        unpaidNet: sumBy(list.filter(isClosedUnpaid), (r) => r.net_cents),
      });
    }
    return by === "driver" ? out.sort((a, b) => b.gross - a.gross) : out.sort((a, b) => b.key.localeCompare(a.key));
  }, [rows, by]);

  const detailRows = useMemo(() => (drill ? rows.filter((r) => keyOf(r, by) === drill.key) : rows), [rows, drill, by]);
  const showDetail = by === "settlement" || drill != null;

  const settlementColumns = useMemo<ParityColumn<DriverSettlementsReportRow>[]>(
    () => [
      {
        key: "display_id",
        label: "Settlement",
        sortable: true,
        render: (r) => <EntityLink kind="settlement" id={r.settlement_id} label={r.display_id ?? "Settlement"} />,
      },
      {
        key: "settlement_number",
        label: "Number",
        sortable: true,
        render: (r) => r.settlement_number ?? (r.status === "closed" ? <span className="text-[#B45309]">No number</span> : "—"),
      },
      { key: "driver_name", label: "Driver", sortable: true, render: (r) => <EntityLink kind="driver" id={r.driver_id} label={formatPersonName(r.driver_name)} /> },
      { key: "status", label: "Status", sortable: true, render: (r) => (r.status === "closed" ? "Closed" : r.status === "open" ? "Open" : r.status) },
      { key: "period_end", label: "Period", sortable: true, render: (r) => periodLabel(r) },
      {
        key: "first_load_number",
        label: "Loads",
        sortable: true,
        render: (r) =>
          r.first_load_id ? (
            <span className="inline-flex gap-1">
              <EntityLink kind="load" id={r.first_load_id} label={r.first_load_number ?? "Load"} />
              {r.last_load_id && r.last_load_id !== r.first_load_id ? (
                <>
                  <span>–</span>
                  <EntityLink kind="load" id={r.last_load_id} label={r.last_load_number ?? "Load"} />
                </>
              ) : null}
            </span>
          ) : (
            loadsRange(r)
          ),
      },
      { key: "load_count", label: "#", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => String(r.load_count) },
      { key: "gross_cents", label: "Gross", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.gross_cents) },
      { key: "deductions_cents", label: "Deductions", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => (r.deductions_cents ? money(-r.deductions_cents) : "—") },
      { key: "advances_cents", label: "Reimb.", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => (r.advances_cents ? money(r.advances_cents) : "—") },
      { key: "net_cents", label: "Net", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.net_cents) },
      { key: "paid_at", label: "Paid", sortable: true, render: (r) => (r.paid_at ? `Paid ${mmmDd(r.paid_at)}` : "Unpaid") },
      { key: "statement", label: "Statement", sortable: true, sortValue: (r) => r.settlement_id, render: (r) => <EntityLink kind="settlement" id={r.settlement_id} label="Open" /> },
    ],
    []
  );

  const groupColumns = useMemo<ParityColumn<GroupRow>[]>(
    () => [
      {
        key: "label",
        label: GROUP_OPTIONS.find((g) => g.id === by)?.label ?? "Group",
        sortable: true,
        sortValue: (g) => g.key,
        render: (g) =>
          g.driverId ? (
            <EntityLink kind="driver" id={g.driverId} label={g.label} />
          ) : (
            <button type="button" className="font-semibold text-[#1D4ED8] hover:underline" onClick={() => setDrill({ key: g.key, label: g.label })}>
              {g.label}
            </button>
          ),
      },
      {
        key: "settlements",
        label: "Settlements",
        sortable: true,
        sortValue: (g) => g.settlements,
        cellClass: "text-right",
        className: "text-right",
        render: (g) => (
          <button type="button" className="text-[#1D4ED8] hover:underline" onClick={() => setDrill({ key: g.key, label: g.label })}>
            {g.settlements}
          </button>
        ),
      },
      { key: "loads", label: "Loads", sortable: true, sortValue: (g) => g.loads, cellClass: "text-right", className: "text-right", render: (g) => String(g.loads) },
      { key: "gross", label: "Gross", sortable: true, sortValue: (g) => g.gross, cellClass: "text-right", className: "text-right", render: (g) => money(g.gross) },
      { key: "deductions", label: "Deductions", sortable: true, sortValue: (g) => g.deductions, cellClass: "text-right", className: "text-right", render: (g) => money(-g.deductions) },
      { key: "reimb", label: "Reimb.", sortable: true, sortValue: (g) => g.reimb, cellClass: "text-right", className: "text-right", render: (g) => money(g.reimb) },
      { key: "net", label: "Net", sortable: true, sortValue: (g) => g.net, cellClass: "text-right", className: "text-right", render: (g) => money(g.net) },
      { key: "unpaidNet", label: "Closed, unpaid", sortable: true, sortValue: (g) => g.unpaidNet, cellClass: "text-right", className: "text-right", render: (g) => money(g.unpaidNet) },
    ],
    [by]
  );

  const xlsx = () =>
    showDetail
      ? {
          filename: "driver-settlement-report",
          header: ["Settlement", "Number", "Driver", "Status", "Period", "Loads", "#", "Gross", "Deductions", "Reimb.", "Net", "Paid"],
          body: detailRows.map((r) => [
            r.display_id ?? "",
            r.settlement_number ?? "",
            formatPersonName(r.driver_name),
            r.status,
            periodLabel(r),
            loadsRange(r),
            r.load_count,
            r.gross_cents / 100,
            -r.deductions_cents / 100,
            r.advances_cents / 100,
            r.net_cents / 100,
            r.paid_at ? mmmDd(r.paid_at) : "Unpaid",
          ]),
        }
      : {
          filename: `driver-settlement-report-by-${by}`,
          header: [GROUP_OPTIONS.find((g) => g.id === by)?.label ?? "Group", "Settlements", "Loads", "Gross", "Deductions", "Reimb.", "Net", "Closed, unpaid"],
          body: groups.map((g) => [g.label, g.settlements, g.loads, g.gross / 100, -g.deductions / 100, g.reimb / 100, g.net / 100, g.unpaidNet / 100]),
        };

  const unpaidNet = sumBy(totals.closedUnpaid, (r) => r.net_cents);

  return (
    <ReportBoardShell
      id="driver-settlements-report"
      subtitle="every driver statement · gross, deductions, reimbursements, net, paid · source: driver_finance settlements"
      xlsx={xlsx}
    >
      <ReportFilterBar
        testIdPrefix="reports-driver-settlements"
        fromDate={staged.draft.start}
        toDate={staged.draft.end}
        onFromDateChange={(d) => staged.setDraft((p) => ({ ...p, start: d ?? "" }))}
        onToDateChange={(d) => staged.setDraft((p) => ({ ...p, end: d ?? "" }))}
        onPresetSelect={() => undefined}
        search={search}
        onSearchChange={setSearch}
        onApply={() => {
          setDrill(null);
          staged.apply();
        }}
        onCancel={staged.cancel}
        onReset={staged.reset}
        applyDisabled={!staged.dirty}
      >
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-[#4B5563]">
          <span className="font-semibold">Driver</span>
          <EntityMultiSelect
            kind="driver"
            operatingCompanyId={companyId}
            value={staged.draft.driverId || null}
            onChange={(next) => staged.setDraft((p) => ({ ...p, driverId: next ?? "" }))}
            placeholder="All drivers"
          />
        </label>
        <MultiSelectDropdown
          label="Status"
          options={STATUS_OPTIONS}
          selected={staged.draft.status}
          onChange={(next) => staged.setDraft((p) => ({ ...p, status: next }))}
          allLabel="Open · closed"
          data-testid="driver-settlements-report-status-filter"
        />
        <MultiSelectDropdown
          label="Paid"
          options={PAID_OPTIONS}
          selected={staged.draft.paid}
          onChange={(next) => staged.setDraft((p) => ({ ...p, paid: next as Array<"paid" | "unpaid"> }))}
          allLabel="Paid: all"
          data-testid="driver-settlements-report-paid-filter"
        />
      </ReportFilterBar>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[#111827]">Group by</span>
        <V3Segmented
          value={by}
          options={GROUP_OPTIONS}
          onChange={(next) => {
            setDrill(null);
            setBy(next);
          }}
          testId="driver-settlements-report-group-by"
        />
      </div>

      {query.isError ? (
        <ListErrorState title="Couldn't load the driver settlement report" {...formatQueryErrorDetail(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      <ReportKpiGrid>
        {/* ROUND 8.17 class S — every KPI opens the report table / filtered cohort (not a dead tile). */}
        <V3KpiTile
          testId="dsr-kpi-settlements"
          label="Settlements"
          value={query.data ? String(totals.settlements) : "…"}
          sub={`${totals.drivers} drivers · cancelled excluded`}
          onClick={() => {
            setDrill(null);
            setBy("settlement");
            document.querySelector('[data-testid="dsr-table"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <V3KpiTile
          testId="dsr-kpi-gross"
          label="Gross pay"
          value={query.data ? money(totals.gross) : "…"}
          onClick={() => {
            setDrill(null);
            setBy("settlement");
            document.querySelector('[data-testid="dsr-table"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <V3KpiTile
          testId="dsr-kpi-deductions"
          label="Deductions"
          value={query.data ? money(-totals.deductions) : "…"}
          sub="escrow · advances · fees"
          tone="red"
          href="/driver-finance/settlements?tab=deductions"
        />
        <V3KpiTile
          testId="dsr-kpi-reimb"
          label="Reimbursements"
          value={query.data ? money(totals.reimb) : "…"}
          href="/driver-finance/settlements?tab=payments"
        />
        <V3KpiTile
          testId="dsr-kpi-net"
          label="Net pay"
          value={query.data ? money(totals.net) : "…"}
          onClick={() => {
            setDrill(null);
            setBy("settlement");
            document.querySelector('[data-testid="dsr-table"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <V3KpiTile
          testId="dsr-kpi-closed-unpaid"
          label="Closed, not marked paid"
          value={query.data ? money(unpaidNet) : "…"}
          sub={`${totals.closedUnpaid.length} settlements`}
          tone={totals.closedUnpaid.length ? "amber" : "muted"}
          onClick={() => {
            setDrill(null);
            setBy("settlement");
            setApplied((p) => ({ ...p, status: ["closed"], paid: ["unpaid"] }));
          }}
        />
      </ReportKpiGrid>

      {drill ? (
        <div className="flex items-center gap-2 text-xs text-[#5B6576]">
          <span>
            Settlements in <strong className="text-[#111827]">{drill.label}</strong>
          </span>
          <button type="button" className="font-semibold text-[#1D4ED8] hover:underline" onClick={() => setDrill(null)}>
            ← back
          </button>
        </div>
      ) : null}

      {showDetail ? (
        <ParityTable
          rows={detailRows}
          title={`${detailRows.length} settlements · newest first`}
          columns={settlementColumns}
          rowKey={(r) => r.settlement_id}
          loading={query.isPending}
          storageKey="driver-settlements-report-board"
          tableTestId="dsr-table"
          emptyText="No settlements match these filters."
          exportFilename="driver-settlement-report"
          exportExcel
          minWidthPx={1400}
          footerCells={{
            display_id: <span className="font-semibold text-[#111827]">Totals ({detailRows.length})</span>,
            load_count: String(sumBy(detailRows, (r) => r.load_count)),
            gross_cents: money(sumBy(detailRows, (r) => r.gross_cents)),
            deductions_cents: money(-sumBy(detailRows, (r) => r.deductions_cents)),
            advances_cents: money(sumBy(detailRows, (r) => r.advances_cents)),
            net_cents: money(sumBy(detailRows, (r) => r.net_cents)),
          }}
        />
      ) : (
        <ParityTable
          rows={groups}
          title={`By ${GROUP_OPTIONS.find((g) => g.id === by)?.label.toLowerCase()}`}
          columns={groupColumns}
          rowKey={(g) => g.key}
          loading={query.isPending}
          storageKey={`driver-settlements-report-board-${by}`}
          tableTestId="dsr-table"
          emptyText="No settlements match these filters."
          exportFilename={`driver-settlement-report-by-${by}`}
          exportExcel
          footerCells={{
            label: <span className="font-semibold text-[#111827]">{groups.length} groups</span>,
            settlements: String(totals.settlements),
            loads: String(totals.loads),
            gross: money(totals.gross),
            deductions: money(-totals.deductions),
            reimb: money(totals.reimb),
            net: money(totals.net),
            unpaidNet: money(unpaidNet),
          }}
        />
      )}

      {query.data ? (
        <ReportMeasuredNote>
          {totals.closedUnpaid.length} closed settlements are not marked paid ({money(unpaidNet)}); {totals.noNumber.length} closed
          settlements have no settlement number yet. A settlement shows “Paid · date” once its payment is issued (sent to
          bank or marked paid).
        </ReportMeasuredNote>
      ) : null}
    </ReportBoardShell>
  );
}
