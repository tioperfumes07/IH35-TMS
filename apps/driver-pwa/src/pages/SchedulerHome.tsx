import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { getMySchedule } from "../api/scheduler";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * 86_400_000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function enumerateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function dayLabel(iso: string, lang: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(lang, { weekday: "narrow", month: "numeric", day: "numeric", timeZone: "UTC" });
}

function cellClass(leaveType: string | undefined, pending: boolean) {
  if (pending) return "bg-amber-500/25 border border-dashed border-amber-400";
  switch (leaveType) {
    case "vacation":
      return "bg-emerald-900/40";
    case "sick":
      return "bg-yellow-900/30";
    case "personal":
      return "bg-orange-900/30";
    case "wfh":
      return "bg-blue-900/40";
    default:
      return "bg-pwa-bg";
  }
}

export function SchedulerHomePage() {
  const { t, i18n } = useTranslation();
  const start = utcToday();
  const end = addDays(start, 39);
  const scheduleQuery = useQuery({
    queryKey: ["driver", "scheduler", "range", start, end],
    queryFn: () => getMySchedule(start, end),
  });

  const byDate = useMemo(() => {
    const map = new Map<string, { leave_type: string; pending: boolean }>();
    const data = scheduleQuery.data;
    if (!data) return map;
    for (const row of data.approved_days) {
      map.set(row.d, { leave_type: row.leave_type, pending: false });
    }
    const windowDays = enumerateRange(start, end);
    for (const pr of data.pending_requests) {
      const s = String(pr.start_date).slice(0, 10);
      const e = String(pr.end_date).slice(0, 10);
      for (const iso of windowDays) {
        if (iso >= s && iso <= e && !map.has(iso)) {
          map.set(iso, { leave_type: pr.leave_type, pending: true });
        }
      }
    }
    return map;
  }, [scheduleQuery.data, start, end]);

  const days = useMemo(() => enumerateRange(start, end), [start, end]);

  return (
    <div className="min-h-screen bg-pwa-bg px-3 py-3 pb-28">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Link to="/today" className="text-xs font-semibold text-pwa-text-secondary">
            {t("scheduler.back_today")}
          </Link>
          <CalendarDays className="h-5 w-5 shrink-0 text-pwa-text-secondary" />
        </div>
        <h1 className="text-lg font-semibold text-pwa-text-primary">{t("scheduler.title")}</h1>
        <PwaCard title={t("scheduler.next_40_days")} subtitle={t("scheduler.swipe_hint")}>
          {scheduleQuery.isLoading ? (
            <p className="text-sm text-pwa-text-secondary">{t("common.loading")}</p>
          ) : scheduleQuery.isError ? (
            <p className="text-sm text-red-400">{t("scheduler.load_error")}</p>
          ) : (
            <div className="-mx-1 flex gap-1 overflow-x-auto pb-2">
              {days.map((iso) => {
                const st = byDate.get(iso);
                const leaveType = st?.leave_type;
                const cls = cellClass(leaveType, st?.pending ?? false);
                return (
                  <div key={iso} className={`flex w-10 shrink-0 flex-col items-center gap-1 rounded px-0.5 py-2 text-[10px] ${cls}`}>
                    <span className="text-pwa-text-secondary">{dayLabel(iso, i18n.language)}</span>
                    <span className="font-mono text-[9px] text-pwa-text-primary">{iso.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </PwaCard>
        <Link to="/scheduler/request" className="block">
          <PwaButton className="w-full">{t("scheduler.request_time_off")}</PwaButton>
        </Link>
        <Link to="/scheduler/requests" className="block">
          <PwaButton variant="secondary" className="w-full">
            {t("scheduler.my_requests")}
          </PwaButton>
        </Link>
      </div>
    </div>
  );
}
