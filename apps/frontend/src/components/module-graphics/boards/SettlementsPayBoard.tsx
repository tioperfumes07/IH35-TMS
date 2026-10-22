import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getOpenDriverBills, listSettlements, type SettlementListRow } from "../../../api/driverFinance";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell, ModSectionHead } from "../ModBoardShell";
import { formatUsdCents, isoDate } from "../format";

type Props = { companyId: string };

/** Monday (ISO week start) for a YYYY-MM-DD date string, America/Chicago calendar day. */
function weekStartIso(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

function thisWeekStart(): string {
  return weekStartIso(isoDate(new Date()));
}

function weekLabel(startIso: string): string {
  const d = new Date(`${startIso}T12:00:00`);
  return d.toLocaleString("en-US", { month: "2-digit", day: "2-digit" }).replace("/", "-");
}

/**
 * ROUND 443.248 — Driver settlements board (LEAD-MOD-DESIGN-Settlements).
 * Live listSettlements + open driver bills; week bars and this-week driver rows click through.
 */
export function SettlementsPayBoard({ companyId }: Props) {
  const week0 = thisWeekStart();

  const setlQ = useQuery({
    queryKey: ["mod-graphics", "settlements", companyId],
    queryFn: () => listSettlements(companyId),
    enabled: Boolean(companyId),
    retry: false,
  });
  const openQ = useQuery({
    queryKey: ["mod-graphics", "open-driver-bills", companyId],
    queryFn: () => getOpenDriverBills(companyId),
    enabled: Boolean(companyId),
    retry: false,
  });

  const settlements = setlQ.data?.settlements ?? [];

  const byWeek = useMemo(() => {
    const map = new Map<
      string,
      { net: number; gross: number; deductions: number; count: number; open: number }
    >();
    for (const s of settlements) {
      const key = weekStartIso(s.period_end || s.period_start);
      const row = map.get(key) ?? { net: 0, gross: 0, deductions: 0, count: 0, open: 0 };
      // net_pay / gross_pay are dollars on SettlementListRow
      row.net += Number(s.net_pay ?? 0);
      row.gross += Number(s.gross_pay ?? 0);
      row.deductions += Number(s.deductions_total ?? 0);
      row.count += 1;
      if (s.payment_state === "unpaid" || s.payment_state === "queued" || !s.payment_state) {
        if (s.status !== "voided" && s.status !== "paid") row.open += 1;
      }
      map.set(key, row);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-11);
  }, [settlements]);

  const thisWeekRows = useMemo(() => {
    return settlements
      .filter((s) => weekStartIso(s.period_end || s.period_start) === week0)
      .sort((a, b) => Number(b.net_pay ?? 0) - Number(a.net_pay ?? 0));
  }, [settlements, week0]);

  const thisWeekNet = thisWeekRows.reduce((s, r) => s + Number(r.net_pay ?? 0), 0);
  const thisWeekGross = thisWeekRows.reduce((s, r) => s + Number(r.gross_pay ?? 0), 0);
  const windowNet = byWeek.reduce((s, [, w]) => s + w.net, 0);
  const windowCount = byWeek.reduce((s, [, w]) => s + w.count, 0);
  const windowDed = byWeek.reduce((s, [, w]) => s + w.deductions, 0);
  const openPresettle = openQ.data?.open_driver_bills?.total_count ?? null;
  const maxWeekNet = Math.max(1, ...byWeek.map(([, w]) => w.net));

  const listBase = "/driver-finance/settlements?view=payments";

  return (
    <ModBoardShell
      eyebrow="Settlements · USMCA · live"
      title="Driver settlements"
      subtitle="What we pay drivers, week by week"
      testId="settlements-pay-board"
    >
      <div className="mod-board__kpi-grid">
        <ClickableStat
          label="This week net"
          value={setlQ.isError ? "—" : formatUsdCents(Math.round(thisWeekNet * 100))}
          hint={setlQ.isError ? "Unable to load" : `gross ${formatUsdCents(Math.round(thisWeekGross * 100))}`}
          to={`${listBase}&week_start=${encodeURIComponent(week0)}`}
          testId="setl-board-week-net"
        />
        <ClickableStat
          label="Open"
          value={openQ.isError ? "—" : openPresettle == null ? "…" : String(openPresettle)}
          hint="pre-settlements / open driver bills"
          to="/driver-finance/settlements?view=payments"
          testId="setl-board-open"
        />
        <ClickableStat
          label="11-week net"
          value={setlQ.isError ? "—" : formatUsdCents(Math.round(windowNet * 100))}
          hint={`${windowCount} settlements`}
          to={listBase}
          testId="setl-board-window-net"
        />
        <ClickableStat
          label="Deductions 11 wk"
          value={setlQ.isError ? "—" : formatUsdCents(Math.round(windowDed * 100))}
          hint="escrow · advances · fines"
          to="/driver-finance/settlements?view=payments&focus=debt"
          testId="setl-board-deductions"
        />
      </div>

      <ModSectionHead title="Driver pay by week" viewAllTo={listBase} />
      {setlQ.isError ? (
        <div className="mod-empty">Settlements could not be loaded.</div>
      ) : byWeek.length === 0 ? (
        <div className="mod-empty">No settlements in the recent window yet.</div>
      ) : (
        <div className="flex items-end gap-1 overflow-x-auto pb-1" data-testid="setl-board-week-bars">
          {byWeek.map(([start, w]) => {
            const h = Math.max(8, Math.round((w.net / maxWeekNet) * 72));
            const to = `${listBase}&week_start=${encodeURIComponent(start)}`;
            return (
              <Link
                key={start}
                to={to}
                className="flex w-12 shrink-0 flex-col items-center gap-0.5 no-underline"
                data-mod-click-through="1"
                data-mod-click-to={to}
                title={`${start}: ${w.count} settlements`}
              >
                <div className="font-mono text-[10px] font-semibold text-[#14213D]">
                  ${(w.net / 1000).toFixed(1)}k
                </div>
                <div
                  className="w-7 rounded-sm bg-[#1F8A4C]"
                  style={{ height: h }}
                  aria-hidden
                />
                <div className="text-[10px] font-bold uppercase text-[#6B7280]">{weekLabel(start)}</div>
                <div className="text-[10px] text-[#6B7280]">
                  {w.count} stl{w.open ? ` · ${w.open} open` : ""}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ModSectionHead
        title={`This week — ${thisWeekRows.length} settlements with pay`}
        viewAllTo={`${listBase}&week_start=${encodeURIComponent(week0)}`}
      />
      {thisWeekRows.length === 0 ? (
        <div className="mod-empty">No settlements with pay this week yet.</div>
      ) : (
        <div className="space-y-1" data-testid="setl-board-this-week-list">
          {thisWeekRows.slice(0, 10).map((s: SettlementListRow) => {
            const to = `/driver-finance/settlements/${s.id}`;
            const loads =
              s.load_links?.map((l) => l.label).filter(Boolean).join(", ") ||
              (s.load_count ? `${s.load_count} loads` : "—");
            return (
              <Link
                key={s.id}
                to={to}
                className="flex items-center justify-between gap-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1.5 no-underline hover:border-[#14213D]"
                data-mod-click-through="1"
                data-mod-click-to={to}
              >
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-[#14213D]">{s.driver_full_name}</div>
                  <div className="truncate text-[11px] text-[#6B7280]">{loads}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[13px] font-semibold text-[#14213D]">
                    {formatUsdCents(Math.round(Number(s.net_pay ?? 0) * 100))}
                  </div>
                  <div className="text-[11px] uppercase text-[#1F8A4C]">
                    {s.payment_state === "cleared" || s.payment_state === "manual_paid" ? "paid" : s.payment_state ?? "open"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </ModBoardShell>
  );
}
