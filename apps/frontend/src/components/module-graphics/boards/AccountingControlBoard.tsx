import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getArAgingReport, getApAgingReport } from "../../../api/reports";
import { getAccountingPeriods } from "../../../api/my-accountant";
import { getBankingUncategorized } from "../../../api/banking";
import { companyToday } from "../../../lib/businessDate";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell, ModSectionHead } from "../ModBoardShell";
import { formatUsdCents } from "../format";

type Props = { companyId: string };

/**
 * ROUND 443.248 — Accounting control board (LEAD-MOD-DESIGN-Accounting).
 * Numbers from live AR/AP aging, periods, and bank uncategorized feed.
 */
export function AccountingControlBoard({ companyId }: Props) {
  const asOf = companyToday();

  const arQ = useQuery({
    queryKey: ["mod-graphics", "ar-aging", companyId, asOf],
    queryFn: () => getArAgingReport(companyId, asOf),
    enabled: Boolean(companyId),
    retry: false,
  });
  const apQ = useQuery({
    queryKey: ["mod-graphics", "ap-aging", companyId, asOf],
    queryFn: () => getApAgingReport(companyId, asOf),
    enabled: Boolean(companyId),
    retry: false,
  });
  const periodsQ = useQuery({
    queryKey: ["mod-graphics", "periods", companyId],
    queryFn: () => getAccountingPeriods(companyId),
    enabled: Boolean(companyId),
    retry: false,
  });
  const bankQ = useQuery({
    queryKey: ["mod-graphics", "bank-uncat", companyId],
    queryFn: () => getBankingUncategorized(companyId, { limit: 1 }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const periods = periodsQ.data?.periods ?? [];
  const pastOpen = useMemo(() => {
    const today = asOf;
    return periods
      .filter((p) => p.period_end < today)
      .sort((a, b) => a.period_start.localeCompare(b.period_start));
  }, [periods, asOf]);
  const closedCount = pastOpen.filter((p) => String(p.status).toLowerCase() === "closed").length;
  const openCount = pastOpen.length - closedCount;
  const bankCount = bankQ.data?.meta?.uncategorized_count ?? bankQ.data?.transactions?.length ?? null;

  const arCents = arQ.data?.total_open_cents ?? null;
  const arInvoices = arQ.data?.total_open_invoices ?? null;
  const over60 =
    arQ.data?.rows.reduce(
      (s, r) => s + (r.bucket_61_90_cents ?? 0) + (r.bucket_91_plus_cents ?? 0),
      0
    ) ?? null;
  // APAgingResponse is row-only — derive board totals from the live rows.
  const apCents = apQ.data?.rows.reduce((s, r) => s + (r.total_open_cents ?? 0), 0) ?? null;
  const apBills = apQ.data?.rows.reduce((s, r) => s + (r.open_bill_count ?? 0), 0) ?? null;

  return (
    <ModBoardShell
      eyebrow={`Accounting · USMCA · live ${asOf}`}
      title="Accounting control"
      subtitle="The books at a glance"
      testId="accounting-control-board"
    >
      <div className="mod-board__kpi-grid">
        <ClickableStat
          label="Owed to us"
          value={arQ.isError ? "—" : formatUsdCents(arCents)}
          hint={
            arQ.isError
              ? "Unable to load"
              : arInvoices != null
                ? `${arInvoices} invoices · ${formatUsdCents(over60)} over 60 days`
                : "Loading…"
          }
          to="/reports/ar-aging"
          testId="acct-board-ar"
        />
        <ClickableStat
          label="We owe · unpaid"
          value={apQ.isError ? "—" : formatUsdCents(apCents)}
          hint={apQ.isError ? "Unable to load" : apBills != null ? `${apBills} bills` : "Loading…"}
          to="/reports/ap-aging"
          testId="acct-board-ap"
        />
        <ClickableStat
          label="Months closed"
          value={periodsQ.isError ? "—" : pastOpen.length ? `${closedCount} of ${pastOpen.length}` : "—"}
          hint={
            periodsQ.isError
              ? "Unable to load"
              : openCount > 0
                ? `${openCount} past months open`
                : pastOpen.length
                  ? "All past months closed"
                  : "No periods"
          }
          to="/reports/audit/period-close-history"
          testId="acct-board-periods"
        />
        <ClickableStat
          label="Bank lines to review"
          value={bankQ.isError ? "—" : bankCount == null ? "…" : String(bankCount)}
          hint={bankQ.isError ? "Unable to load" : "Uncategorized feed"}
          to="/banking/transactions?type=uncategorized"
          testId="acct-board-bank-review"
        />
      </div>

      <ModSectionHead title="Period close" viewAllTo="/reports/audit/period-close-history" />
      {periodsQ.isError ? (
        <div className="mod-empty">Period status could not be loaded.</div>
      ) : pastOpen.length === 0 ? (
        <div className="mod-empty">No past accounting periods on file yet.</div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 md:grid-cols-9" data-testid="acct-board-period-strip">
          {pastOpen.slice(-9).map((p) => {
            const closed = String(p.status).toLowerCase() === "closed";
            const label =
              p.period_label ||
              new Date(`${p.period_start}T12:00:00`).toLocaleString("en-US", { month: "short" });
            return (
              <Link
                key={p.id}
                to={`/reports/audit/period-close-history?period=${encodeURIComponent(p.period_start)}`}
                className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1.5 text-center no-underline"
                data-mod-click-through="1"
                data-mod-click-to={`/reports/audit/period-close-history?period=${encodeURIComponent(p.period_start)}`}
              >
                <div className="text-section-header font-bold uppercase text-[#14213D]">{label}</div>
                <div
                  className="mt-0.5 text-section-header font-semibold uppercase"
                  style={{ color: closed ? "#1F8A4C" : "#C76A0A" }}
                >
                  {closed ? "Closed" : "Not closed"}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </ModBoardShell>
  );
}
