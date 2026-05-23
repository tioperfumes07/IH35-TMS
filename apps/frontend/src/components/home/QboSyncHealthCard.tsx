import { Link } from "react-router-dom";
import type { HomeQboSyncHealth } from "../../api/home";
import { Button } from "../Button";

type Props = {
  data?: HomeQboSyncHealth;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

type HealthTone = "green" | "yellow" | "red" | "slate";

function statusPill(health?: HomeQboSyncHealth): { label: string; tone: HealthTone } {
  if (!health || !health.latest_run) return { label: "No runs", tone: "slate" };
  const latest = health.latest_run.status.toLowerCase();
  if (latest === "failed" || health.high_severity_alerts_count > 0) return { label: "Critical", tone: "red" };
  if (latest === "success" && health.open_alerts_count === 0 && health.failed_outbox_count === 0) {
    return { label: "Healthy", tone: "green" };
  }
  return { label: "Warning", tone: "yellow" };
}

function pillClass(tone: HealthTone): string {
  if (tone === "green") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (tone === "yellow") return "border-amber-300 bg-amber-50 text-amber-700";
  if (tone === "red") return "border-red-300 bg-red-50 text-red-700";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function QboSyncHealthCard({ data, isLoading, isError, onRetry }: Props) {
  if (isLoading) {
    return (
      <section className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">QBO Sync Health</div>
        <div className="space-y-2 p-3">
          <div className="h-6 animate-pulse rounded bg-slate-100" />
          <div className="h-6 animate-pulse rounded bg-slate-100" />
          <div className="h-6 animate-pulse rounded bg-slate-100" />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="rounded border border-red-200 bg-red-50">
        <div className="border-b border-red-200 px-3 py-2 text-sm font-semibold text-red-900">QBO Sync Health</div>
        <div className="flex items-center justify-between px-3 py-3 text-sm text-red-800">
          <span>Failed to load QBO sync health.</span>
          <Button variant="secondary" onClick={onRetry}>
            Refresh
          </Button>
        </div>
      </section>
    );
  }

  const pill = statusPill(data);
  const latestRunTime = data?.latest_run?.completed_at ?? data?.latest_run?.started_at ?? null;
  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div className="text-sm font-semibold text-slate-900">QBO Sync Health</div>
        <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold ${pillClass(pill.tone)}`}>{pill.label}</span>
      </div>
      <div className="space-y-1 px-3 py-2">
        <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 text-xs">
          <span className="text-slate-600">Last run</span>
          <span className="font-semibold text-slate-800">{formatRelative(latestRunTime)}</span>
        </div>
        <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 text-xs">
          <span className="text-slate-600">Open alerts</span>
          <span className="font-semibold text-slate-800">{data?.open_alerts_count ?? 0}</span>
        </div>
        <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 text-xs">
          <span className="text-slate-600">Failed events</span>
          <span className="font-semibold text-slate-800">{data?.failed_outbox_count ?? 0}</span>
        </div>
      </div>
      <div className="border-t border-slate-100 px-3 py-2">
        <Link className="text-xs font-medium text-blue-700 hover:underline" to="/qbo/sync-dashboard">
          Open QBO sync dashboard
        </Link>
      </div>
    </section>
  );
}
