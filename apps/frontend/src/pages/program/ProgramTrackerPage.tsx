import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { getProgramTracker, type ProgramTracker, type TrackerPhase, type TrackerBlockRow, type Tab } from "../../api/program-tracker";

import { ctDateTime } from "../../lib/businessDate";

/** UI tabs on Program Tracker (API `Tab` also has `not_counted`, which is not a sub-nav tab). */
type TrackerTabId = "pending" | "in_progress" | "completed" | "sequence" | "modules";
const TRACKER_TAB_IDS = new Set<string>(["pending", "in_progress", "completed", "sequence", "modules"]);

export function parseProgramTrackerTab(raw: string | null): TrackerTabId {
  if (raw && TRACKER_TAB_IDS.has(raw)) return raw as TrackerTabId;
  return "pending";
}

// Real Central-Time stamps only — never hardcoded/now() (§0). All timestamps come from the server; unknown → "—".
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
const changedStamp = (r: TrackerBlockRow) => r.last_changed_ct || ctDateTime(r.last_changed_at);
const doneStamp = (r: TrackerBlockRow) => r.completed_ct || ctDateTime(r.completed_at);

const PILL: Record<TrackerPhase["status"], { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-[#d1fae5] text-slate-800" },
  "in-progress": { label: "In progress", cls: "bg-slate-100 text-slate-700" },
  "awaiting-owner": { label: "Awaiting owner", cls: "border border-[#dc2626] text-[#dc2626]" },
  queued: { label: "Queued", cls: "bg-slate-50 text-slate-500" },
};

/** Historical GATED tags are source history, not an owner hold (same law as Final Additions). */
function isLegacyGatedStatus(status: string | null | undefined): boolean {
  return (status || "").toUpperCase().includes("GATED");
}

function TrackerStatusCell({ status, kind }: { status: string; kind: "open" | "completed" }) {
  const gated = isLegacyGatedStatus(status);
  return (
    <td
      className="px-3 py-2 text-slate-600"
      title={gated ? "Historical GATED tag; no owner approval required" : undefined}
      data-testid={gated ? "tracker-status-legacy-gated" : undefined}
    >
      {status}
      {kind === "completed" ? " · live" : ""}
      {gated ? <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-500">(actionable)</span> : null}
    </td>
  );
}

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

const LAYER_DEFS: { key: keyof TrackerBlockRow["layers"]; abbr: string; title: string }[] = [
  { key: "frontend", abbr: "FE", title: "Front End" },
  { key: "backend", abbr: "BE", title: "Back End" },
  { key: "db", abbr: "DB", title: "DB/Migration" },
  { key: "gl", abbr: "GL", title: "GL/Accounting" },
  { key: "rls", abbr: "RLS", title: "RLS/Security" },
  { key: "guard", abbr: "G", title: "Guard" },
  { key: "tests", abbr: "T", title: "Tests" },
];

function LayerChips({ r }: { r: TrackerBlockRow }) {
  return (
    <span className="inline-flex flex-wrap gap-0.5">
      {LAYER_DEFS.map((l) => (
        <span key={l.abbr} title={l.title}
          className={`rounded-sm px-1 text-[10px] ${r.layers[l.key] ? "bg-slate-200 text-slate-700" : "bg-slate-50 text-slate-300"}`}>{l.abbr}</span>
      ))}
    </span>
  );
}

// `extended` (By-Module drill-down only) adds 4 LIVE-from-registry columns: Wired / Needs design / Missing /
// Completeness. Top-level Pending/In-Progress/Completed tables stay compact (extended omitted → false).
function BlockTable({ rows, kind, moved, extended = false }: { rows: TrackerBlockRow[]; kind: "open" | "completed"; moved: Set<string>; extended?: boolean }) {
  if (rows.length === 0) return <p className="px-3 py-4 text-sm text-slate-500">None.</p>;
  return (
    <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left">Block</th>
            <th className="px-3 py-2 text-left">Kind</th>
            <th className="px-3 py-2 text-left">Layers</th>
            {extended ? <th className="px-3 py-2 text-center">Wired</th> : null}
            {extended ? <th className="px-3 py-2 text-left">Needs design</th> : null}
            {extended ? <th className="px-3 py-2 text-left">Missing</th> : null}
            {extended ? <th className="px-3 py-2 text-left">Completeness</th> : null}
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">PR</th>
            <th className="px-3 py-2 text-right">{kind === "completed" ? "Completed (deployed)" : "Last change"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 align-top ${moved.has(r.id) ? "bg-[#d1fae5]" : ""}`}>
              <td className="px-3 py-2 text-slate-800">
                {r.name}
                {r.financial ? <span className="ml-1 rounded-sm bg-slate-100 px-1 text-[10px] text-slate-500">FIN</span> : null}
                {r.feature_incomplete ? <span className="ml-1 rounded-sm border border-[#dc2626] px-1 text-[10px] text-[#dc2626]">FEATURE INCOMPLETE</span> : null}
                {r.cross_module.length ? <div className="mt-0.5 text-[10px] text-slate-400">links: {r.cross_module.join(", ")}</div> : null}
              </td>
              <td className="px-3 py-2 text-slate-500">{r.kind}</td>
              <td className="px-3 py-2"><LayerChips r={r} /></td>
              {extended ? (
                <td className="px-3 py-2 text-center">
                  {r.wired
                    ? <span className="font-semibold text-slate-600" title="Linkage declared: financial primitive + operational module + hub table">✓</span>
                    : <span className="font-semibold text-[#dc2626]" title={`Undeclared linkage: ${r.missing.filter((m) => m.startsWith("link:")).join(", ") || "—"}`}>✗</span>}
                </td>
              ) : null}
              {extended ? (
                <td className="px-3 py-2 text-slate-500">
                  {r.needs_design ? <span className="rounded-sm bg-slate-100 px-1 text-[11px] text-slate-700">Needs design</span> : "—"}
                </td>
              ) : null}
              {extended ? (
                <td className="px-3 py-2 text-[11px] text-slate-500">{r.missing.length ? r.missing.join(", ") : "—"}</td>
              ) : null}
              {extended ? (
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <ProgressBar done={r.completeness} total={100} />
                    <span className="tabular-nums text-[11px] text-slate-600">{r.completeness}%</span>
                  </div>
                </td>
              ) : null}
              <TrackerStatusCell status={r.status} kind={kind} />
              <td className="px-3 py-2 font-mono text-slate-500">{r.pr ? `#${r.pr}` : "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">{kind === "completed" ? doneStamp(r) : changedStamp(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompletedSection({ rows, moved }: { rows: TrackerBlockRow[]; moved: Set<string> }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed &amp; live ({rows.length}) — 100% done, merged + deployed</h2>
      <BlockTable rows={rows} kind="completed" moved={moved} />
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
            <th className="px-3 py-2 text-right">Pending</th>
            <th className="px-3 py-2 text-right">In prog</th>
            <th className="px-3 py-2 text-right">Done+live</th>
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
              <td className="px-3 py-2 text-right tabular-nums text-slate-500">{p.pending}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-500">{p.in_progress}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{p.completed}</td>
              <td className="px-3 py-2"><ProgressBar done={p.completed} total={p.total} /></td>
              <td className="px-3 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[p.status].cls}`}>{PILL[p.status].label}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ByModuleView({ data, moved }: { data: ProgramTracker; moved: Set<string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const allRows = [...data.views.completed, ...data.views.in_progress, ...data.views.pending];
  const totals = data.modules.reduce((a, m) => ({ built: a.built + m.built, partial: a.partial + m.partial, not_built: a.not_built + m.not_built }), { built: 0, partial: 0, not_built: 0 });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <StatCard n={totals.built} label="Built (live-verified)" />
        <StatCard n={totals.partial} label="Partial / in progress" />
        <StatCard n={totals.not_built} label="Not built" />
        <StatCard n={data.modules.length} label="Modules" />
      </div>
      <p className="text-[11px] text-slate-400">Each block counted once, by module (from its file paths); reconciles to the registered total. Computed live from the registry.</p>
      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">Module</th>
              <th className="px-3 py-2 text-right">Built</th>
              <th className="px-3 py-2 text-right">Partial</th>
              <th className="px-3 py-2 text-right">Not built</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.modules.map((m) => [
              <tr key={m.module} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50" onClick={() => setOpen(open === m.module ? null : m.module)}>
                <td className="px-3 py-2 text-slate-800">{open === m.module ? "▾ " : "▸ "}{m.module}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{m.built}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{m.partial}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${m.not_built > 0 ? "font-semibold text-[#dc2626]" : "text-slate-400"}`}>{m.not_built}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{m.total}</td>
              </tr>,
              open === m.module ? (
                <tr key={m.module + "-drill"}>
                  <td colSpan={5} className="bg-gray-50 px-3 py-2">
                    <BlockTable rows={allRows.filter((r) => (r.module ?? "uncategorized") === m.module)} kind="open" moved={moved} extended />
                  </td>
                </tr>
              ) : null,
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrackerBody({ data, moved }: { data: ProgramTracker; moved: Set<string> }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseProgramTrackerTab(searchParams.get("tab"));
  const setTab = (next: TrackerTabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "pending") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const tabs: { key: TrackerTabId; label: string; count?: number }[] = [
    { key: "pending", label: "Pending", count: data.view_counts.pending },
    { key: "in_progress", label: "In Progress", count: data.view_counts.in_progress },
    { key: "completed", label: "Completed", count: data.view_counts.completed },
    { key: "sequence", label: "Sequence" },
    { key: "modules", label: "By Module" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1 rounded-sm border border-gray-300 bg-white px-2 py-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#334155]" /> Registered count live · loaded {relTime(data.generated_at)}
        </span>
        <span className="rounded-sm border border-gray-300 bg-white px-2 py-1">Status as of last sync <span className="font-semibold">{ctDateTime(data.recon_synced_at)}</span></span>
        <span className="rounded-sm border border-gray-300 bg-white px-2 py-1">Deploy <span className="font-mono">{data.deployed_sha}</span></span>
      </div>

      <div className="flex flex-wrap gap-3">
        <StatCard n={data.registered_total} label="Registered (unique, live from .block-ready)" />
        <StatCard n={data.tracked_total} label="Tracked status rows (registry + legacy)" />
        <StatCard n={`${data.authored_registered_total}/${data.authored_total}`} label="Authored registered" />
        <StatCard n={data.view_counts.pending} label="Tracked pending (includes legacy GATED tags)" />
        <StatCard n={data.view_counts.in_progress} label="Tracked in progress" />
        <StatCard n={data.view_counts.completed} label="Tracked completed & live" />
      </div>

      {(() => {
        const legacyGated = [...data.views.pending, ...data.views.in_progress].filter((r) =>
          isLegacyGatedStatus(r.status),
        ).length;
        if (legacyGated <= 0) return null;
        return (
          <div className="rounded-sm border border-gray-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600" data-testid="tracker-legacy-gated-disclosure">
            {legacyGated} open row{legacyGated === 1 ? " carries" : "s carry"} a historical GATED tag.
            The tag is retained as source history; no owner approval is required and these rows remain actionable.
          </div>
        );
      })()}

      {/* FIX B — "Since Jul 1": the same breakdown restricted to blocks created (git add-date) on/after
          2026-07-01, side-by-side with the full view. Undated blocks are surfaced, never guessed in. */}
      {data.since_jul1 ? (
        <div className="rounded-sm border border-gray-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Since Jul 1 <span className="font-normal normal-case text-slate-400">(blocks created on/after {data.since_jul1.since} · {data.since_jul1.total} of {data.registered_total} · {data.since_jul1.undated} undated)</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <StatCard n={data.since_jul1.total} label="Registered since Jul 1" />
            <StatCard n={data.since_jul1.pending} label="Pending" />
            <StatCard n={data.since_jul1.in_progress} label="In progress" />
            <StatCard n={data.since_jul1.completed} label="Completed & live" />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-[#1f2a44] font-semibold text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}{typeof t.count === "number" ? <span className="ml-1 tabular-nums text-slate-400">({t.count})</span> : null}
          </button>
        ))}
      </div>

      {tab === "sequence" ? (
        <SequenceTable phases={data.phases} />
      ) : tab === "modules" ? (
        <ByModuleView data={data} moved={moved} />
      ) : tab === "completed" ? (
        <CompletedSection rows={data.views.completed} moved={moved} />
      ) : (
        <div className="space-y-6">
          <BlockTable rows={tab === "pending" ? data.views.pending : data.views.in_progress} kind="open" moved={moved} />
          {/* owner request: pending + in-progress tabs pin the completed-and-live list at the bottom */}
          <div className="border-t border-gray-200 pt-4"><CompletedSection rows={data.views.completed} moved={moved} /></div>
        </div>
      )}

      {data.view_counts.not_counted > 0 ? (
        <div className="text-[11px] text-slate-400">
          Not counted: {data.view_counts.not_counted} superseded/duplicate block(s) — excluded from the pending / in-progress / completed totals (honest, §0).
        </div>
      ) : null}
      <div className="text-[11px] text-slate-400">
        The headline <b>Registered</b> count is computed live at request time from the deployed
        <span className="font-mono"> .block-ready</span> registry — <b>unique block_id, with duplicate / superseded /
        stale files excluded</b> (a CI guard keeps every active block_id unique), so it is never inflated by the raw
        file count. <b>Tracked status rows</b> are a different, explicitly labeled population: the live registry
        unioned with recon-only legacy rows so historical work is not erased. Pending / In Progress / Completed use
        that tracked denominator, not the smaller registry-only count. A newly-registered block bumps the registry
        count on the next deploy with no script re-run. Per-block <b>status / PR / timestamps</b> and the phase rollup come from the
        last reconcile sync (Status as of last sync, above) — refreshed automatically on schedule and on merge-to-main,
        not fabricated per request. "Completed" = registry DONE <b>and</b> merged + deployed (live-verified) — a bare
        done marker without live proof stays In Progress, never Completed.
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

  // Highlight blocks that changed tab since the last refetch, so movement is visible.
  const prevTab = useRef<Record<string, Tab>>({});
  const [moved, setMoved] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!query.data) return;
    const now: Record<string, Tab> = {};
    const changed = new Set<string>();
    for (const key of ["pending", "in_progress", "completed", "not_counted"] as Tab[]) {
      for (const r of query.data.views[key]) {
        now[r.id] = key;
        if (prevTab.current[r.id] && prevTab.current[r.id] !== key) changed.add(r.id);
      }
    }
    prevTab.current = now;
    if (changed.size > 0) {
      setMoved(changed);
      const t = setTimeout(() => setMoved(new Set()), 4000);
      return () => clearTimeout(t);
    }
  }, [query.data]);

  return (
    <div className="space-y-3">
      <Breadcrumb items={[{ label: "Program Tracker" }]} />
      <PageHeader
        title="Program Tracker"
        subtitle="Build Progress — live from the block registry. Pending / In Progress / Completed / Sequence / By Module. Auto-refreshes on open, focus, and every 60s."
        actions={
          <a href="/program/legacy-board" className="rounded-sm border border-gray-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50">
            Legacy audit board
          </a>
        }
      />
      {query.isLoading ? (
        <p className="text-sm text-slate-500">Loading live tracker…</p>
      ) : query.isError ? (
        <ListErrorBanner
          message={`Couldn't load the tracker: ${userFacingApiError(query.error, "error")}`}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <TrackerBody data={query.data} moved={moved} />
      ) : null}
    </div>
  );
}
