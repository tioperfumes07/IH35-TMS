import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { listSettlements } from "../../api/driverFinance";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SettlementDetailPage } from "./SettlementDetailPage";
import { SettlementDisputesTab } from "./components/SettlementDisputesTab";
import { SettlementsTable } from "./components/SettlementsTable";

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

  const settlements = (listQuery.data?.settlements ?? []).filter((s) =>
    filterDriverId ? s.driver_id === filterDriverId : true,
  );
  const now = new Date();
  const ytdYear = now.getFullYear();
  const periodStartOfWeek = (() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - d.getDay()); // Sunday start — matches Tasks planner This Week
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const isInThisPeriod = (s: (typeof settlements)[number]) => {
    const end = new Date(s.period_end);
    if (Number.isNaN(end.getTime())) return false;
    return end.getTime() >= periodStartOfWeek.getTime();
  };
  const isYtd = (s: (typeof settlements)[number]) => {
    const end = new Date(s.period_end);
    return !Number.isNaN(end.getTime()) && end.getFullYear() === ytdYear;
  };
  const kpis = {
    total_unpaid: settlements.filter((s) => s.status !== "paid").length,
    this_period: settlements.filter(isInThisPeriod).length,
    drivers_with_debt: settlements.filter((s) => typeof s.live_debt_flag === "number" && s.live_debt_flag > 0).length,
    pending_acks: settlements.filter((s) => s.has_pending_acks).length,
    held_deductions: settlements.filter((s) => s.status === "held").length,
    ytd_settlements: settlements.filter(isYtd).length,
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
    unpaid: settlements.filter((s) => (s.payment_state ?? "unpaid") === "unpaid").length,
    queued: settlements.filter((s) => s.payment_state === "queued").length,
    sent_to_bank: settlements.filter((s) => s.payment_state === "sent_to_bank").length,
    cleared: settlements.filter((s) => s.payment_state === "cleared").length,
    bounced: settlements.filter((s) => s.payment_state === "bounced").length,
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
          ?focus= predicates matching the KPI counts on this same list (real data, not guess-routes). */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
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
        </div>
      </div>

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

function setFilter(
  state: "unpaid" | "queued" | "sent_to_bank" | "cleared" | "bounced",
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
  value: number;
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
