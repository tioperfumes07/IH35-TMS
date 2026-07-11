import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { ListErrorState } from "../../components/ListErrorState";
import { getProgramTracker, type ProgramTracker, type TrackerPhase, type TrackerBlockRow } from "../../api/program-tracker";

const CT = "America/Chicago";

// Real Central-Time stamps only — never hardcoded/placeholder (§0). All timestamps come from the server.
function ctDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { timeZone: CT, year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) + " CT";
}
function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
// Prefer the registry's own CT string; fall back to formatting the ISO.
function bestStamp(row: TrackerBlockRow): string {
  return row.deployed_ct || row.merged_ct || ctDateTime(row.merged_at);
}

const PILL: Record<TrackerPhase["status"], { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-[#d1fae5] text-slate-800" },
  "in-progress": { label: "In progress", cls: "bg-slate-100 text-slate-700" },
  "awaiting-owner": { label: "Awaiting owner", cls: "border border-[#dc2626] text-[#dc2626]" },
  queued: { label: "Queued", cls: "bg-slate-50 text-slate-500" },
};

function StatCard({ n, label }: { n: string | number; label: string }) {
  return (
    <div className="min-w-[140px] flex-1 rounded-sm border border-gray-200 bg-white px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums text-slate-900">{n}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-sm bg-slate-100">
      <div className="h-full rounded-sm bg-[#334155]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function BlockTable({ rows, showLive }: { rows: TrackerBlockRow[]; showLive?: boolean }) {
  if (rows.length === 0) return <p className="px-3 py-4 text-sm text-slate-500">None.</p>;
  return (
    <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left">Block</th>
            <th className="px-3 py-2 text-left">Phase</th>
            <th className="px-3 py-2 text-left">Status</th>
            {showLive ? <th className="px-3 py-2 text-left">Live</th> : null}
            <th className="px-3 py-2 text-left">PR</th>
            <th className="px-3 py-2 text-right">{showLive ? "Deployed / merged" : "Updated"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-100 last:border-b-0 align-top">
              <td className="px-3 py-2 text-slate-800">{r.name}{r.financial ? <span className="ml-1 rounded-sm bg-slate-100 px-1 text-[10px] text-slate-500">FIN</span> : null}</td>
              <td className="px-3 py-2 text-slate-500">{r.phase ?? "—"}</td>
              <td className="px-3 py-2 text-slate-600">{r.status}</td>
              {showLive ? <td className="px-3 py-2 text-slate-500">{r.live_state ?? "—"}</td> : null}
              <td className="px-3 py-2 font-mono text-slate-500">{r.pr ? `#${r.pr}` : "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">{bestStamp(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SequenceTable({ phases }: { phases: TrackerPhase[] }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Phase</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">Done</th>
            <th className="px-3 py-2 text-right">Held</th>
            <th className="px-3 py-2 text-left">Progress</th>
            <th className="px-3 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {phases.map((p) => (
            <tr key={p.key} className="border-b border-gray-100 last:border-b-0">
              <td className="px-3 py-2 text-slate-500">{p.n}</td>
              <td className="px-3 py-2 text-slate-800">{p.label}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{p.total}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{p.done}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{p.held}</td>
              <td className="px-3 py-2"><ProgressBar done={p.done} total={p.total} /></td>
              <td className="px-3 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[p.status].cls}`}>{PILL[p.status].label}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type TabKey = "pending" | "in_progress" | "completed" | "sequence";

function TrackerBody({ data }: { data: ProgramTracker }) {
  const [tab, setTab] = useState<TabKey>("pending");
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "pending", label: "Pending", count: data.view_counts.pending },
    { key: "in_progress", label: "In Progress", count: data.view_counts.in_progress },
    { key: "completed", label: "Completed & live", count: data.view_counts.completed },
    { key: "sequence", label: "Sequence" },
  ];
  const CompletedSection = (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed &amp; live ({data.view_counts.completed}) — 100% done, deployed</h2>
      <BlockTable rows={data.views.completed} showLive />
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1 rounded-sm border border-gray-300 bg-white px-2 py-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#334155]" /> Live · updated {relTime(data.generated_at)}
        </span>
        <span className="rounded-sm border border-gray-300 bg-white px-2 py-1">As of <span className="font-semibold">{ctDateTime(data.generated_at)}</span></span>
        <span className="rounded-sm border border-gray-300 bg-white px-2 py-1">Deploy <span className="font-mono">{data.deployed_sha}</span></span>
      </div>

      <div className="flex flex-wrap gap-3">
        <StatCard n={data.authored_total} label="Blocks authored" />
        <StatCard n={data.registered_total} label="Registered (live-tracked)" />
        <StatCard n={data.view_counts.completed} label="Completed & live" />
        <StatCard n={data.view_counts.in_progress} label="In progress" />
        <StatCard n={data.view_counts.pending + data.not_registered_total} label="Pending (+ unregistered)" />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-[#1f2a44] font-semibold text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}{typeof t.count === "number" ? <span className="ml-1 tabular-nums text-slate-400">({t.count})</span> : null}
          </button>
        ))}
      </div>

      {tab === "sequence" ? (
        <SequenceTable phases={data.phases} />
      ) : tab === "completed" ? (
        CompletedSection
      ) : (
        <div className="space-y-6">
          <BlockTable rows={tab === "pending" ? data.views.pending : data.views.in_progress} showLive={tab === "in_progress"} />
          {/* per owner: pending/in-progress tabs show the completed-and-live ones at the bottom */}
          <div className="border-t border-gray-200 pt-4">{CompletedSection}</div>
        </div>
      )}

      <div className="text-[11px] text-slate-400">
        Numbers + timestamps are recomputed live from the deployed <span className="font-mono">.block-ready</span> registry
        (reconcile:blocks) + the authored phase manifest — on load, on tab focus, and every 60s. "Completed &amp; live"
        is registry-DONE <b>and</b> deployed (live_state=deployed) — not merged-but-hollow false-done.
      </div>
    </div>
  );
}

export function ProgramTrackerPage() {
  const query = useQuery({
    queryKey: ["program", "tracker"],
    queryFn: getProgramTracker,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });
  return (
    <div className="space-y-3">
      <Breadcrumb items={[{ label: "Program Board", href: "/program" }, { label: "Build Progress" }]} />
      <PageHeader title="Program Tracker" subtitle="Build Progress — live from the block registry. Pending / In Progress / Completed & live / Sequence. Auto-refreshes on open, focus, and every 60s." backHref="/program" />
      {query.isLoading ? (
        <p className="text-sm text-slate-500">Loading live tracker…</p>
      ) : query.isError ? (
        <ListErrorState title="Couldn't load the tracker" status={0} message={(query.error as Error)?.message} onRetry={() => void query.refetch()} />
      ) : query.data ? (
        <TrackerBody data={query.data} />
      ) : null}
    </div>
  );
}
