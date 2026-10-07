import { Link } from "react-router-dom";
import type { HomeQboSyncHealth, HomeQboCustomersPushStatus, HomeQboVendorsPushStatus, HomeQboAccountsPushStatus } from "../../api/home";
import { Button } from "../Button";

type Props = {
  data?: HomeQboSyncHealth;
  pushStatus?: HomeQboCustomersPushStatus;
  vendorsPushStatus?: HomeQboVendorsPushStatus;
  accountsPushStatus?: HomeQboAccountsPushStatus;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

type HealthTone = "green" | "yellow" | "red" | "slate";

function statusPill(health?: HomeQboSyncHealth): { label: string; tone: HealthTone } {
  if (!health) return { label: "No runs", tone: "slate" };
  if (health.high_severity_alerts_count > 0) return { label: "Critical", tone: "red" };
  if (!health.latest_run) return { label: "No runs", tone: "slate" };
  const latest = health.latest_run.status.toLowerCase();
  if (latest === "failed") return { label: "Critical", tone: "red" };
  if (health.is_stale || health.freshness_status === "never") return { label: "Stale", tone: "yellow" };
  if (latest === "success" && health.open_alerts_count === 0 && health.failed_outbox_count === 0) {
    return { label: "Healthy", tone: "green" };
  }
  return { label: "Warning", tone: "yellow" };
}

function pillClass(tone: HealthTone): string {
  if (tone === "green") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (tone === "yellow") return "border-amber-300 bg-amber-50 text-amber-700";
  if (tone === "red") return "border-red-300 bg-red-50 text-red-700";
  return "border-[#E5E7EB] bg-[#F7F8FA] text-[#1F2A44]";
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

function formatAgeSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "never";
  if (seconds < 60) return "under 1m ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function sourceLabel(source: HomeQboSyncHealth["last_success_source"]): string {
  if (source === "master_data_cdc") return "Master-data CDC";
  if (source === "qbo_sync_runs") return "QBO sync run";
  return "No successful source";
}

export function QboSyncHealthCard({ data, pushStatus, vendorsPushStatus, accountsPushStatus, isLoading, isError, onRetry }: Props) {
  if (isLoading) {
    return (
      <section className="rounded-sm border border-[#E5E7EB] bg-white">
        <div className="border-b border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#0F1219]">QBO Sync Health</div>
        <div className="space-y-2 p-3">
          <div className="h-6 animate-pulse rounded-sm bg-[#F7F8FA]" />
          <div className="h-6 animate-pulse rounded-sm bg-[#F7F8FA]" />
          <div className="h-6 animate-pulse rounded-sm bg-[#F7F8FA]" />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="rounded-sm border border-red-200 bg-red-50">
        <div className="border-b border-red-200 px-3 py-2 text-xs font-semibold text-red-900">QBO Sync Health</div>
        <div className="flex items-center justify-between px-3 py-3 text-xs text-red-800">
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
    <section className="rounded-sm border border-[#E5E7EB] bg-white">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-3 py-2">
        <div className="text-xs font-semibold text-[#0F1219]">QBO Sync Health</div>
        <span className={`inline-flex rounded-sm border px-2 py-0.5 text-xs font-semibold ${pillClass(pill.tone)}`}>{pill.label}</span>
      </div>
      <div className="space-y-1 px-3 py-2">
        <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
          <span className="text-[#4B5563]">Last run</span>
          <span className="font-semibold text-[#0F1219]">{formatRelative(latestRunTime)}</span>
        </div>
        <div className={`flex items-center justify-between rounded-sm px-2 py-1.5 text-xs ${data?.is_stale ? "bg-amber-50" : "bg-[#F7F8FA]"}`}>
          <span className={data?.is_stale ? "text-amber-700" : "text-[#4B5563]"}>Last successful sync</span>
          <span className={`font-semibold ${data?.is_stale ? "text-amber-800" : "text-[#0F1219]"}`}>
            {formatAgeSeconds(data?.last_success_age_seconds)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
          <span className="text-[#4B5563]">Success source</span>
          <span className="font-semibold text-[#0F1219]">{sourceLabel(data?.last_success_source ?? null)}</span>
        </div>
        <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
          <span className="text-[#4B5563]">Freshness limit</span>
          <span className="font-semibold text-[#0F1219]">
            {data?.stale_after_seconds ? `${Math.floor(data.stale_after_seconds / 3600)}h` : "Unavailable"}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
          <span className="text-[#4B5563]">Open alerts</span>
          <span className="font-semibold text-[#0F1219]">{data?.open_alerts_count ?? 0}</span>
        </div>
        <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
          <span className="text-[#4B5563]">Failed events</span>
          <span className="font-semibold text-[#0F1219]">{data?.failed_outbox_count ?? 0}</span>
        </div>
        {pushStatus ? (
          <>
            <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
              <span className="text-[#4B5563]">Local customers pending</span>
              <span className="font-semibold text-[#0F1219]">{pushStatus.unsynced + pushStatus.failed}</span>
            </div>
            <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
              <span className="text-[#4B5563]">Customers synced to QBO</span>
              <span className="font-semibold text-[#0F1219]">{pushStatus.synced}</span>
            </div>
          </>
        ) : null}
        {vendorsPushStatus ? (
          <>
            <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
              <span className="text-[#4B5563]">Local vendors pending</span>
              <span className="font-semibold text-[#0F1219]">{vendorsPushStatus.unsynced + vendorsPushStatus.failed}</span>
            </div>
            <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
              <span className="text-[#4B5563]">Vendors synced to QBO</span>
              <span className="font-semibold text-[#0F1219]">{vendorsPushStatus.synced}</span>
            </div>
          </>
        ) : null}
        {accountsPushStatus ? (
          <>
            <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
              <span className="text-[#4B5563]">Local accounts pending</span>
              <span className="font-semibold text-[#0F1219]">{accountsPushStatus.unsynced + accountsPushStatus.failed}</span>
            </div>
            <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5 text-xs">
              <span className="text-[#4B5563]">Accounts synced to QBO</span>
              <span className="font-semibold text-[#0F1219]">{accountsPushStatus.synced}</span>
            </div>
            {accountsPushStatus.blocked_by_parent > 0 ? (
              <div className="flex items-center justify-between rounded-sm bg-amber-50 px-2 py-1.5 text-xs">
                <span className="text-amber-700">Blocked by parent</span>
                <span className="font-semibold text-amber-800">{accountsPushStatus.blocked_by_parent}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="border-t border-[#E5E7EB] px-3 py-2">
        <Link className="text-xs font-medium text-[#1F2A44] hover:underline" to="/qbo/sync-dashboard">
          Open QBO sync dashboard
        </Link>
      </div>
    </section>
  );
}
