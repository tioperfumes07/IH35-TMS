import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { listSettlements, getOpenDriverBills, type OpenDriverBill } from "../../api/driverFinance";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SettlementDetailPage } from "./SettlementDetailPage";
import { SettlementDisputesTab } from "./components/SettlementDisputesTab";
import { SettlementsTable } from "./components/SettlementsTable";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { DataPanel } from "../../components/layout/DataPanel";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

type FocusFilter = "debt" | "pending_acks" | "held" | null;

function parseFocus(raw: string | null): FocusFilter {
  if (raw === "debt" || raw === "pending_acks" || raw === "held") return raw;
  return null;
}

export function SettlementsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = selectedCompanyId ?? "";
  const activeTab = searchParams.get("tab") === "disputes" ? "disputes" : "settlements";
  const selectedSettlementId = searchParams.get("settlement_id");
  // Driver profile "Full settlements" → /settlements?driver_id= (PreserveSearchNavigate keeps param).
  const filterDriverId = searchParams.get("driver_id");
  const selectedPaymentState = searchParams.get("payment_state") as
    | "unpaid"
    | "queued"
    | "sent_to_bank"
    | "cleared"
    | "bounced"
    | "manual_paid"
    | null;
  // B-A3: KPI focus filter — same predicates as the KPI counts (not a guess-route).
  const focusFilter = parseFocus(searchParams.get("focus"));

  const listQuery = useQuery({
    queryKey: ["driver-finance", "settlements", companyId, selectedPaymentState ?? ""],
    queryFn: () => listSettlements(companyId, { payment_state: selectedPaymentState ?? undefined }),
    enabled: Boolean(companyId),
  });
  // FAIL-SETL-KPI-PERIOD — KPI tiles must count the full entity-scoped list, not the payment_state-filtered
  // slice. Filtering the table must not shrink YTD / This Period / debt counts.
  const kpiBaseQuery = useQuery({
    queryKey: ["driver-finance", "settlements-kpi-base", companyId],
    queryFn: () => listSettlements(companyId),
    enabled: Boolean(companyId),
  });
  const openBillsQuery = useQuery({
    queryKey: ["driver-finance", "open-driver-bills", companyId],
    queryFn: () => getOpenDriverBills(companyId),
    enabled: Boolean(companyId),
  });

  const settlements = (listQuery.data?.settlements ?? []).filter((s) =>
    filterDriverId ? s.driver_id === filterDriverId : true,
  );
  const kpiSettlements = (kpiBaseQuery.data?.settlements ?? []).filter((s) =>
    filterDriverId ? s.driver_id === filterDriverId : true,
  );
  const openBillsSummary = openBillsQuery.data?.open_driver_bills ?? { total_count: 0, total_gross_cents: 0, items: [] as OpenDriverBill[] };
  const now = new Date();
  const ytdYear = now.getFullYear();
  const periodStartOfWeek = (() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - d.getDay()); // Sunday start — matches Tasks planner This Week
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const isInThisPeriod = (s: (typeof kpiSettlements)[number]) => {
    const end = new Date(s.period_end);
    if (Number.isNaN(end.getTime())) return false;
    return end.getTime() >= periodStartOfWeek.getTime();
  };
  const isYtd = (s: (typeof kpiSettlements)[number]) => {
    const end = new Date(s.period_end);
    return !Number.isNaN(end.getTime()) && end.getFullYear() === ytdYear;
  };
  // CLS-MONEY-KPI-FAKE-ZERO-ON-FAILURE: kpiSettlements defaults to [] the moment kpiBaseQuery
  // errors, so every count below silently computed to a real-looking 0 instead of surfacing the
  // failure the ListErrorBanner (below) already knows about. Same for open_driver_bills against
  // openBillsQuery. "—" makes the failure visible on the tile itself, not just in a banner it sits
  // next to.
  const kpis: Record<string, number | string> = {
    total_unpaid: kpiBaseQuery.isError ? "—" : kpiSettlements.filter((s) => s.status !== "paid").length,
    this_period: kpiBaseQuery.isError ? "—" : kpiSettlements.filter(isInThisPeriod).length,
    drivers_with_debt: kpiBaseQuery.isError
      ? "—"
      : kpiSettlements.filter((s) => typeof s.live_debt_flag === "number" && s.live_debt_flag > 0).length,
    pending_acks: kpiBaseQuery.isError ? "—" : kpiSettlements.filter((s) => s.has_pending_acks).length,
    held_deductions: kpiBaseQuery.isError ? "—" : kpiSettlements.filter((s) => s.status === "held").length,
    ytd_settlements: kpiBaseQuery.isError ? "—" : kpiSettlements.filter(isYtd).length,
    open_driver_bills: openBillsQuery.isError ? "—" : openBillsSummary.total_count,
  };
  const focusedSettlements = useMemo(() => {
    if (focusFilter === "debt") {
      return settlements.filter((s) => typeof s.live_debt_flag === "number" && s.live_debt_flag > 0);
    }
    if (focusFilter === "pending_acks") {
      return settlements.filter((s) => s.has_pending_acks);
    }
    if (focusFilter === "held") {
      return settlements.filter((s) => s.status === "held");
    }
    return settlements;
  }, [settlements, focusFilter]);

  const setFocus = (next: FocusFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("focus", next);
    else params.delete("focus");
    setSearchParams(params);
  };
  const paymentPipeline = {
    unpaid: kpiSettlements.filter((s) => (s.payment_state ?? "unpaid") === "unpaid").length,
    queued: kpiSettlements.filter((s) => s.payment_state === "queued").length,
    sent_to_bank: kpiSettlements.filter((s) => s.payment_state === "sent_to_bank").length,
    cleared: kpiSettlements.filter((s) => s.payment_state === "cleared").length,
    bounced: kpiSettlements.filter((s) => s.payment_state === "bounced").length,
    manual_paid: kpiSettlements.filter((s) => s.payment_state === "manual_paid").length,
  };

  if (selectedSettlementId && activeTab === "settlements") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">Detail View</div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("settlement_id");
              setSearchParams(next);
            }}
          >
            Back to List
          </Button>
        </div>
        <SettlementDetailPage />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Driver Settlements" subtitle="List + detail settlement workflow" />

      <NavyPageSubNav
        items={[
          { label: "Drivers",           to: "/drivers" },
          { label: "Profiles",           to: "/drivers/profiles" },
          { label: "Pre-Settlements",    to: "/drivers/pre-settlements" },
          { label: "Settlements",        to: "/driver-finance/settlements" },
          { label: "Settlement Close",   to: "/driver-finance/settlement-close" },
          { label: "Cash Advance Requests", to: "/driver-finance/cash-advance-requests" },
          { label: "Cash Advances",      to: "/cash-advances" },
          { label: "Liabilities",        to: "/liabilities" },
          { label: "Escrow",             to: "/accounting/escrow" },
          { label: "Pay Rate Templates", to: "/drivers/pay-rate-templates" },
          { label: "Deductions",         to: "/drivers/deductions" },
        ]}
      />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={activeTab === "settlements" ? "primary" : "secondary"}
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.delete("tab");
            next.delete("settlement_id");
            setSearchParams(next);
          }}
        >
          Settlements
        </Button>
        <Button
          size="sm"
          variant={activeTab === "disputes" ? "primary" : "secondary"}
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.set("tab", "disputes");
            next.delete("settlement_id");
            setSearchParams(next);
          }}
        >
          Settlement Disputes
        </Button>
      </div>

      {activeTab === "settlements" ? (
        <>
      {/* B-A3: Total Unpaid / This Period / YTD → payment_state routes; Debt / Pending Acks / Held →
          ?focus= predicates matching the KPI counts on this same list (real data, not guess-routes).
          SETL-OPEN-BILLS: Open Driver Bills is a distinct KPI — unsettled driver pay that is not yet
          represented in any settlement, surfaced so the page never looks "stuck at $0". */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        <KpiCard label="Total Unpaid" value={kpis.total_unpaid} to="/driver-finance/settlements?payment_state=unpaid" />
        <KpiCard label="This Period" value={kpis.this_period} to="/driver-finance/settlements" />
        <KpiCard
          label="Drivers w/ Debt"
          value={kpis.drivers_with_debt}
          active={focusFilter === "debt"}
          onClick={() => setFocus(focusFilter === "debt" ? null : "debt")}
        />
        <KpiCard
          label="Pending Acks"
          value={kpis.pending_acks}
          active={focusFilter === "pending_acks"}
          onClick={() => setFocus(focusFilter === "pending_acks" ? null : "pending_acks")}
        />
        <KpiCard
          label="Held Deductions"
          value={kpis.held_deductions}
          active={focusFilter === "held"}
          onClick={() => setFocus(focusFilter === "held" ? null : "held")}
        />
        <KpiCard label="YTD Settlements" value={kpis.ytd_settlements} to="/driver-finance/settlements" />
        <KpiCard label="Open Driver Bills" value={kpis.open_driver_bills} disabled disabledReason="Use the open-bills panel below to drill into unsettled driver pay" />
      </div>
      <div className="rounded-sm border border-gray-200 bg-white p-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Pipeline</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={selectedPaymentState === null ? "primary" : "secondary"}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("payment_state");
              setSearchParams(next);
            }}
          >
            All
          </Button>
          <Button size="sm" variant={selectedPaymentState === "unpaid" ? "primary" : "secondary"} onClick={() => setFilter("unpaid", searchParams, setSearchParams)}>
            Unpaid ({paymentPipeline.unpaid})
          </Button>
          <Button size="sm" variant={selectedPaymentState === "queued" ? "primary" : "secondary"} onClick={() => setFilter("queued", searchParams, setSearchParams)}>
            Queued ({paymentPipeline.queued})
          </Button>
          <Button size="sm" variant={selectedPaymentState === "sent_to_bank" ? "primary" : "secondary"} onClick={() => setFilter("sent_to_bank", searchParams, setSearchParams)}>
            Sent ({paymentPipeline.sent_to_bank})
          </Button>
          <Button size="sm" variant={selectedPaymentState === "cleared" ? "primary" : "secondary"} onClick={() => setFilter("cleared", searchParams, setSearchParams)}>
            Cleared ({paymentPipeline.cleared})
          </Button>
          <Button size="sm" variant={selectedPaymentState === "bounced" ? "primary" : "secondary"} onClick={() => setFilter("bounced", searchParams, setSearchParams)}>
            Bounced ({paymentPipeline.bounced})
          </Button>
          <Button size="sm" variant={selectedPaymentState === "manual_paid" ? "primary" : "secondary"} onClick={() => setFilter("manual_paid", searchParams, setSearchParams)}>
            Manual Paid ({paymentPipeline.manual_paid})
          </Button>
        </div>
      </div>

      {listQuery.isError || kpiBaseQuery.isError || openBillsQuery.isError ? (
        <ListErrorBanner
          message={`Failed to load settlement data: ${[
            listQuery.isError ? "list" : "",
            kpiBaseQuery.isError ? "KPI" : "",
            openBillsQuery.isError ? "open driver bills" : "",
          ].filter(Boolean).join(", ")}.`}
          onRetry={() => {
            if (listQuery.isError) void listQuery.refetch();
            if (kpiBaseQuery.isError) void kpiBaseQuery.refetch();
            if (openBillsQuery.isError) void openBillsQuery.refetch();
          }}
        />
      ) : null}

      <OpenDriverBillsPanel
        loading={openBillsQuery.isPending}
        totalCount={openBillsSummary.total_count}
        totalGrossCents={openBillsSummary.total_gross_cents}
        items={openBillsSummary.items}
      />

      <SettlementsTable
        rows={focusedSettlements}
        loading={listQuery.isPending || (listQuery.isFetching && focusedSettlements.length === 0)}
        onOpen={(id) => {
          const next = new URLSearchParams(searchParams);
          next.set("settlement_id", id);
          setSearchParams(next);
        }}
      />
        </>
      ) : (
        <SettlementDisputesTab companyId={companyId} />
      )}
    </div>
  );
}

function OpenDriverBillsPanel({
  loading,
  totalCount,
  totalGrossCents,
  items,
}: {
  loading: boolean;
  totalCount: number;
  totalGrossCents: number;
  items: OpenDriverBill[];
}) {
  if (loading) {
    return (
      <DataPanel title={`Open Driver Bills · loading…`} accentColor="#64748b">
        <p className="text-xs text-gray-500">Loading open driver bills…</p>
      </DataPanel>
    );
  }
  return (
    <DataPanel title={`Open Driver Bills · ${totalCount} · ${formatUsdCents(totalGrossCents)}`} accentColor="#64748b">
      {items.length === 0 ? (
        <p className="text-xs text-gray-500">No open driver bills — all driver pay is either settled or not yet booked.</p>
      ) : (
        <div className="space-y-1">
          {items.map((bill) => (
            <div key={bill.id} className="flex items-center justify-between text-sm">
              <span className="flex flex-wrap items-center gap-1">
                <EntityLink
                  kind="driver"
                  id={bill.driver_id}
                  label={entityLabel(bill.driver_name, bill.driver_id, "Driver")}
                />
                <span className="text-gray-400">·</span>
                <EntityLink
                  kind="load"
                  id={bill.load_id ?? ""}
                  label={entityLabel(bill.load_number, bill.load_id, "Load")}
                />
                {bill.bill_number ? <span className="text-[10px] text-gray-400">({entityLabel(bill.bill_number, bill.id, "Bill")})</span> : null}
              </span>
              <span className="font-semibold">{formatUsdCents(bill.gross_amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
    </DataPanel>
  );
}

function setFilter(
  state: "unpaid" | "queued" | "sent_to_bank" | "cleared" | "bounced" | "manual_paid",
  searchParams: URLSearchParams,
  setSearchParams: (nextInit: URLSearchParams) => void
) {
  const next = new URLSearchParams(searchParams);
  next.set("payment_state", state);
  setSearchParams(next);
}

function KpiCard({
  label,
  value,
  to,
  onClick,
  active,
  disabled,
  disabledReason,
}: {
  label: string;
  value: number | string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const content = (
    <>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </>
  );
  const base = `rounded-sm border px-2 py-1 text-[11px] ${
    active ? "border-slate-500 bg-slate-50" : "border-gray-200 bg-white"
  }`;
  if (disabled) {
    return (
      <div className={`${base} cursor-not-allowed opacity-70`} aria-disabled="true" title={disabledReason} data-kpi-disabled="true">
        {content}
      </div>
    );
  }
  if (to) {
    return (
      <Link to={to} className={`block ${base} transition hover:shadow-xs`}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={Boolean(active)} className={`${base} w-full text-left transition hover:shadow-xs`}>
        {content}
      </button>
    );
  }
  return <div className={base}>{content}</div>;
}
