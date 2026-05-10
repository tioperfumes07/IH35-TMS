import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listSettlements } from "../../api/driverFinance";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SettlementDetailPage } from "./SettlementDetailPage";
import { SettlementsTable } from "./components/SettlementsTable";

export function SettlementsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = selectedCompanyId ?? "";
  const selectedSettlementId = searchParams.get("settlement_id");
  const selectedPaymentState = searchParams.get("payment_state") as
    | "unpaid"
    | "queued"
    | "sent_to_bank"
    | "cleared"
    | "bounced"
    | "manual_paid"
    | null;

  const listQuery = useQuery({
    queryKey: ["driver-finance", "settlements", companyId, selectedPaymentState ?? ""],
    queryFn: () => listSettlements(companyId, { payment_state: selectedPaymentState ?? undefined }),
    enabled: Boolean(companyId),
  });

  const settlements = listQuery.data?.settlements ?? [];
  const kpis = {
    total_unpaid: settlements.filter((s) => s.status !== "paid").length,
    this_period: settlements.length,
    drivers_with_debt: settlements.filter((s) => typeof s.live_debt_flag === "number" && s.live_debt_flag > 0).length,
    pending_acks: settlements.filter((s) => s.has_pending_acks).length,
    held_deductions: settlements.filter((s) => s.status === "held").length,
    ytd_settlements: settlements.length,
  };
  const paymentPipeline = {
    unpaid: settlements.filter((s) => (s.payment_state ?? "unpaid") === "unpaid").length,
    queued: settlements.filter((s) => s.payment_state === "queued").length,
    sent_to_bank: settlements.filter((s) => s.payment_state === "sent_to_bank").length,
    cleared: settlements.filter((s) => s.payment_state === "cleared").length,
    bounced: settlements.filter((s) => s.payment_state === "bounced").length,
  };

  if (selectedSettlementId) {
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

      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {["Drivers", "Profiles", "Pre-Settlements", "Settlements", "Cash Advances", "Liabilities", "Escrow", "Driver Pay Catalog", "Deduction Catalog"].map((item) => (
            <span key={item} className={item === "Settlements" ? "border-b border-white pb-0.5 font-semibold" : ""}>{item}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total Unpaid" value={kpis.total_unpaid} />
        <KpiCard label="This Period" value={kpis.this_period} />
        <KpiCard label="Drivers w/ Debt" value={kpis.drivers_with_debt} />
        <KpiCard label="Pending Acks" value={kpis.pending_acks} />
        <KpiCard label="Held Deductions" value={kpis.held_deductions} />
        <KpiCard label="YTD Settlements" value={kpis.ytd_settlements} />
      </div>
      <div className="rounded border border-gray-200 bg-white p-2">
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
        rows={settlements}
        onOpen={(id) => {
          const next = new URLSearchParams(searchParams);
          next.set("settlement_id", id);
          setSearchParams(next);
        }}
      />
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

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
