import type { ListsRecentActivityRow } from "../../../api/listsHub";

type Props = {
  rows: ListsRecentActivityRow[];
};

function timeAgo(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const deltaMins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (deltaMins < 1) return "just now";
  if (deltaMins < 60) return `${deltaMins}m ago`;
  const hrs = Math.floor(deltaMins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s.includes("synced")) return "bg-[#F7F8FA] text-[#4B5563]";
  if (s === "in") return "bg-[#F7F8FA] text-[#4B5563]";
  if (s.includes("failed")) return "bg-red-50 text-red-700";
  return "bg-[#F7F8FA] text-[#4B5563]";
}

export function RecentActivityCard({ rows }: Props) {
  const top = rows.slice(0, 10);
  return (
    <div className="rounded-sm border border-[#E5E7EB] bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">Recent Catalog Activity</div>
      <div className="space-y-2 text-xs">
        {top.map((row, idx) => (
          <div key={`${row.created_at}-${idx}`} className="border-t border-[#E5E7EB] px-2 py-1.5">
            <div className="text-[#6B7280]">{timeAgo(row.created_at)}</div>
            <div className="text-[#1F2A44]">
              {row.catalog_key} · {row.action} · {row.entity_name}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[#6B7280]">{row.user_display_name}</span>
              <span className={`rounded-sm px-1.5 py-0.5 text-xs font-semibold ${statusClass(row.qbo_sync_status)}`}>{row.qbo_sync_status}</span>
            </div>
          </div>
        ))}
        {top.length === 0 ? <div className="text-[#6B7280]">No recent catalog activity.</div> : null}
      </div>
    </div>
  );
}

