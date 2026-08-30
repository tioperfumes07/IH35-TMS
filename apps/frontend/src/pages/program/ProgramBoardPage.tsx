import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  getProgramBoard,
  postProgramBoardNote,
  type BoardDeltas,
  type BoardNote,
  type BoardTotals,
  type ExtraItem,
  type HoldItem,
  type MergedPr,
  type ProgramBoard,
  type ProgramBoardAudit,
  type ReconBlock,
  type TabTally,
} from "../../api/program";

const AUTO_REFRESH_MS = 60_000; // board re-polls every 60s so refreshed_at_ct stays live

// ── normalized row (blocks + owner tracks share one shape so the table is uniform) ──────────────────
type Row = {
  key: string;
  id: string;
  date: string | null; // registered_on (raw ISO/date)
  wave: string; // source / wave label
  description: string;
  tier: string;
  fin: boolean;
  status: string;
  pr: number | null;
  track: "block" | "owner-batch" | "dispatch-kit" | "audit";
  review?: string; // Owner-Batch review tag (proceed-on-row | needs-your-preview); absent → proceed-on-row
  // ── Live-data upgrade (audit findings) — all OPTIONAL; the table degrades gracefully when absent ──────
  severity?: string;
  module?: string;
  where?: string;
  live?: string; // live_state (deployed | merged | waiting-merge | in-ci | ci-failed | pending | gated)
  requestedCt?: string;
  writtenCt?: string;
  mergedCt?: string;
  deployedCt?: string;
  deployNo?: string; // Render deploy short-sha the fix went live in
  lifecycle?: string; // furthest stage reached (requested | written | merged | deployed)
};

// Owner-Batch review tag: absent/blank/unknown defaults to the standard-pattern "proceed-on-row".
// Only an explicit "needs-your-preview" (judgment-heavy surface) opts into the preview-first path.
export function reviewTag(raw: string | undefined): "proceed-on-row" | "needs-your-preview" {
  return (raw || "").trim().toLowerCase() === "needs-your-preview" ? "needs-your-preview" : "proceed-on-row";
}

type TabId = "focus" | "all" | "pending" | "owner" | "dispatch" | "audit" | "merged" | "hold" | "questions" | "ideas";
const PROGRAM_BOARD_TAB_IDS = new Set<string>([
  "focus",
  "all",
  "pending",
  "owner",
  "dispatch",
  "audit",
  "merged",
  "hold",
  "questions",
  "ideas",
]);

export function parseProgramBoardTab(raw: string | null): TabId {
  if (raw && PROGRAM_BOARD_TAB_IDS.has(raw)) return raw as TabId;
  return "focus";
}

const TABS: { id: TabId; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "all", label: "All Tasks" },
  { id: "pending", label: "Currently Pending" },
  { id: "owner", label: "Owner-Batch" },
  { id: "dispatch", label: "Dispatch-Kit" },
  { id: "audit", label: "Bugs & Audits" },
  { id: "merged", label: "Merged PRs" },
  { id: "hold", label: "HOLD-FOR-JORGE" },
  { id: "questions", label: "Questions" },
  { id: "ideas", label: "Ideas" },
];

// The only concluded status is DONE — everything else (PENDING, PENDING (GATED), NEEDS-VERIFY, OPEN,
// or any future not-done state) is "open". Shared by the Focus and Pending tabs so their filters can
// never drift apart. See the reconcile JSON status vocabulary: PENDING / PENDING (GATED) /
// NEEDS-VERIFY / OPEN / DONE.
export function isOpenStatus(status: string): boolean {
  return (status || "").toUpperCase() !== "DONE";
}

export type PendingSummary = {
  pending: number;
  gated: number;
  needsVerify: number;
  done: number;
  open: number;
  total: number;
  pct: number;
};

// Pure roll-up of the Pending tab's live progress metric. Buckets every item's status and derives the
// done-vs-total completion percentage. Any not-done state that isn't gated/needs-verify falls into
// `pending` so the open count always equals total − done.
export function summarizePending(statuses: string[]): PendingSummary {
  let pending = 0;
  let gated = 0;
  let needsVerify = 0;
  let done = 0;
  for (const raw of statuses) {
    const s = (raw || "").toUpperCase();
    if (s === "DONE") done += 1;
    else if (s.includes("GATED")) gated += 1;
    else if (s === "NEEDS-VERIFY") needsVerify += 1;
    else pending += 1; // PENDING, OPEN, or any other not-done state
  }
  const total = statuses.length;
  const open = total - done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { pending, gated, needsVerify, done, open, total, pct };
}

// ── status chip styling — SEMANTIC (not the §7 accent). navy/slate family for pending; never blue/purple ──
function statusChip(status: string): { bg: string; fg: string } {
  const s = (status || "").toUpperCase();
  if (s === "DONE") return { bg: "#DCFCE7", fg: "#166534" }; // green
  if (s === "NEEDS-VERIFY") return { bg: "#FEF3C7", fg: "#854F0B" }; // amber
  if (s.includes("GATED")) return { bg: "#F3F4F6", fg: "#6B7280" }; // grey
  if (s === "PENDING" || s === "OPEN") return { bg: "#E2E8F0", fg: "#334155" }; // slate (navy family)
  return { bg: "#E2E8F0", fg: "#334155" };
}

// ── CT date-only formatter for the Date column (registered_on has no time) ──────────────────────────
function formatDateCt(raw: string | null): string {
  if (!raw) return "—";
  // Date-only calendar days are not instants. Pinning noon at a fixed UTC offset (-05:00)
  // is wrong in CST (UTC-6) and is T-08. Render YYYY-MM-DD as calendar parts.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${m}/${d}/${y}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")}`;
}

// ── CT date+time formatter for the Merged-PR "Merged At" column (mergedAt is a full ISO instant) ──────
function formatDateTimeCt(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")} ${get("dayPeriod")} CT`;
}

function blockToRow(b: ReconBlock): Row {
  return {
    key: `block:${b.id}`,
    id: b.id,
    date: b.registered_on,
    wave: b.source,
    description: b.name?.trim() || b.evidence || "",
    tier: b.tier || "",
    fin: b.fin,
    status: b.status,
    pr: b.pr,
    track: "block",
  };
}

function extraToRow(e: ExtraItem): Row {
  return {
    key: `${e.track ?? "extra"}:${e.id}`,
    id: e.id,
    date: e.registered_on,
    wave: e.wave,
    description: [e.name, e.notes].filter(Boolean).join(" — "),
    tier: e.tier || "",
    fin: e.fin,
    status: e.status,
    pr: null,
    track: (e.track as Row["track"]) ?? "owner-batch",
    review: e.review,
    severity: e.severity,
    module: e.module,
    where: e.where,
    live: e.live_state,
    requestedCt: e.requested_ct,
    writtenCt: e.written_ct,
    mergedCt: e.merged_ct,
    deployedCt: e.deployed_ct,
    deployNo: e.deploy_no,
    lifecycle: e.lifecycle,
  };
}

// Every data column in the shared block/task table is sortable. "#" is the row ordinal (not a data
// field) so it stays non-sortable; everything else clicks to sort. The audit tab adds live-data
// columns (severity/module/where/live/lifecycle) — all sortable through the same comparator.
type SortKey =
  | "date"
  | "id"
  | "wave"
  | "description"
  | "tier"
  | "fin"
  | "status"
  | "pr"
  | "review"
  | "severity"
  | "module"
  | "where"
  | "live"
  | "lifecycle";

// ── Lifecycle stage ordering for the sortable Lifecycle column (furthest reached wins) ───────────────
const LIFECYCLE_ORDER = ["requested", "written", "merged", "deployed"] as const;
export function lifecycleRank(stage: string | undefined): number {
  const i = LIFECYCLE_ORDER.indexOf((stage || "").toLowerCase() as (typeof LIFECYCLE_ORDER)[number]);
  return i; // -1 when unknown/absent → sorts before "requested"
}

// Derive the furthest reached lifecycle stage from the timestamps when an explicit `lifecycle` is absent.
// A row is only fully DONE once deployed_ct is set — merged ≠ live (constitution §3.7).
export function deriveLifecycle(row: {
  lifecycle?: string;
  deployedCt?: string;
  mergedCt?: string;
  writtenCt?: string;
  requestedCt?: string;
}): string | undefined {
  if (row.lifecycle) return row.lifecycle.toLowerCase();
  if (row.deployedCt) return "deployed";
  if (row.mergedCt) return "merged";
  if (row.writtenCt) return "written";
  if (row.requestedCt) return "requested";
  return undefined;
}

// Type-aware, stable row comparator. Dates compare chronologically, PR # numerically, Fin as a
// boolean, Lifecycle by pipeline stage, and id/wave/tier/status/severity/module/where/live use a
// numeric-aware locale compare so "P3-T11.10" sorts after "P3-T11.2". Returns raw asc ordering; the
// caller applies direction + a stable index tiebreak.
export function compareRows(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case "date": {
      const toTs = (raw: string | null): number => {
        if (!raw) return -Infinity;
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          return Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(5, 7)) - 1, Number(raw.slice(8, 10)));
        }
        const t = Date.parse(raw);
        return Number.isNaN(t) ? -Infinity : t;
      };
      return toTs(a.date) - toTs(b.date);
    }
    case "pr":
      return (a.pr ?? -Infinity) - (b.pr ?? -Infinity);
    case "fin":
      return (a.fin ? 1 : 0) - (b.fin ? 1 : 0);
    case "review":
      return reviewTag(a.review).localeCompare(reviewTag(b.review));
    case "lifecycle":
      return lifecycleRank(deriveLifecycle(a)) - lifecycleRank(deriveLifecycle(b));
    default:
      return String(a[key] ?? "").localeCompare(String(b[key] ?? ""), undefined, { numeric: true });
  }
}

// ── LIVE git-state chip (audit table) — §7 palette only: navy/slate family, DONE green, red for failed ──
// deployed=green · merged=slate · waiting-merge=navy · in-ci=slate-lt · ci-failed=red · gated=grey · pending=slate
function liveStateChip(state: string | undefined): { bg: string; fg: string; label: string } {
  const s = (state || "").toLowerCase();
  switch (s) {
    case "deployed":
      return { bg: "#DCFCE7", fg: "#166534", label: "deployed" }; // green — live on prod
    case "merged":
      return { bg: "#E2E8F0", fg: "#334155", label: "merged" }; // slate
    case "waiting-merge":
      return { bg: "#1F2A44", fg: "#FFFFFF", label: "waiting-merge" }; // navy — ready
    case "in-ci":
      return { bg: "#F1F5F9", fg: "#64748B", label: "in-ci" }; // slate-lt
    case "ci-failed":
      return { bg: "#FEE2E2", fg: "#991B1B", label: "ci-failed" }; // red
    case "gated":
      return { bg: "#F3F4F6", fg: "#6B7280", label: "gated" }; // grey
    case "pending":
      return { bg: "#E2E8F0", fg: "#334155", label: "pending" }; // slate
    default:
      return { bg: "#F3F4F6", fg: "#9CA3AF", label: state || "—" };
  }
}

// In-module nav for PROGRAM. Declared as data (not inline JSX) because verify-nav-integrity reads
// PROGRAM_MODULE_NAV literal href strings prove every route has a real door — a route reachable only by typing its URL
// is a dead page, and an allowlist entry would assert reachability without providing it.
const PROGRAM_MODULE_NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/program/modules", label: "Module Completion" },
  { href: "/program/tracker", label: "Build Progress" },
];

export function ProgramBoardPage() {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseProgramBoardTab(searchParams.get("tab"));
  const setTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "focus") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [filter, setFilter] = useState("");
  // Debounced copy of the filter that drives the row-table filtering (typing stays responsive on 160+ rows).
  const [debouncedFilter, setDebouncedFilter] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter), 200);
    return () => clearTimeout(t);
  }, [filter]);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deltasOpen, setDeltasOpen] = useState(false);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<ProgramBoard>({
    queryKey: ["program-board"],
    queryFn: getProgramBoard,
    refetchInterval: AUTO_REFRESH_MS, // re-poll every 60s so the live-metrics timestamp stays current
    refetchOnWindowFocus: true,
  });

  const mutation = useMutation({
    mutationFn: postProgramBoardNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["program-board"] });
      pushToast("Saved. Nothing is ever lost.", "success");
    },
    onError: (e: unknown) => {
      pushToast(userFacingApiError(e, "Save failed"), "error");
    },
  });

  const blockRows = useMemo<Row[]>(() => (data?.blocks ?? []).map(blockToRow), [data]);
  const ownerRows = useMemo<Row[]>(
    () => (data?.extra ?? []).filter((e) => (e.track ?? "owner-batch") === "owner-batch").map(extraToRow),
    [data]
  );
  const dispatchRows = useMemo<Row[]>(
    () => (data?.extra ?? []).filter((e) => e.track === "dispatch-kit").map(extraToRow),
    [data]
  );
  // Audit & Bug Sweep track — the 160-finding 2026-07-04 sweep (append-only; mark DONE, never delete).
  const auditRows = useMemo<Row[]>(
    () => (data?.extra ?? []).filter((e) => e.track === "audit").map(extraToRow),
    [data]
  );

  // Every item across blocks + both owner tracks — the full universe the All and Pending tabs both draw
  // from (All shows all of it; Pending shows the not-done slice).
  const allRows = useMemo<Row[]>(() => [...blockRows, ...ownerRows, ...dispatchRows], [blockRows, ownerRows, dispatchRows]);

  // Live progress summary for the Pending tab. Recomputed on every board load, so as gated/pending items
  // get concluded the open count falls and the done-vs-total completion metric rises.
  const pendingSummary = useMemo(() => summarizePending(allRows.map((r) => r.status)), [allRows]);

  // Merged-PR spine + HOLD-FOR-JORGE inventory (from the committed reconcile snapshot). Filterable.
  const mergedFiltered = useMemo<MergedPr[]>(() => {
    const f = filter.trim().toLowerCase();
    const list = data?.merged_prs ?? [];
    return f
      ? list.filter((p) => `#${p.number} ${p.title} ${p.branch ?? ""}`.toLowerCase().includes(f))
      : list;
  }, [data, filter]);
  const holdFiltered = useMemo<HoldItem[]>(() => {
    const f = filter.trim().toLowerCase();
    const list = data?.hold_for_jorge ?? [];
    return f
      ? list.filter((p) => `#${p.number} ${p.title} ${p.category}`.toLowerCase().includes(f))
      : list;
  }, [data, filter]);

  const notes = data?.notes ?? [];
  const questions = useMemo(() => notes.filter((n) => n.kind === "question"), [notes]);
  const ideas = useMemo(() => notes.filter((n) => n.kind === "idea"), [notes]);

  // answers/notes indexed by block_id for row-expand + question threads
  const answersByBlock = useMemo(() => {
    const m = new Map<string, BoardNote[]>();
    for (const n of notes) {
      if (n.kind === "answer" || n.kind === "note") {
        const k = n.block_id ?? "__general__";
        m.set(k, [...(m.get(k) ?? []), n]);
      }
    }
    return m;
  }, [notes]);
  const questionsByBlock = useMemo(() => {
    const m = new Map<string, BoardNote[]>();
    for (const q of questions) {
      const k = q.block_id ?? "__general__";
      m.set(k, [...(m.get(k) ?? []), q]);
    }
    return m;
  }, [questions]);

  // The tab's FULL (unfiltered) row set — its length is the "of <total>" denominator in the count.
  const baseRows = useMemo<Row[]>(() => {
    if (tab === "all") return allRows;
    if (tab === "owner") return ownerRows;
    if (tab === "dispatch") return dispatchRows;
    if (tab === "audit") return auditRows;
    if (tab === "focus" || tab === "pending") return allRows.filter((r) => isOpenStatus(r.status));
    return [];
  }, [tab, allRows, ownerRows, dispatchRows, auditRows]);

  // Filter FIRST (case-insensitive substring over id/description/module/where/status/PR/severity),
  // THEN sort via the shared type-aware compareRows — one sort system, composes with the column headers.
  const activeRows = useMemo<Row[]>(() => {
    let rows = baseRows;
    const f = debouncedFilter.trim().toLowerCase();
    if (f) {
      rows = rows.filter((r) =>
        [
          r.id,
          r.wave,
          r.description,
          r.status,
          r.tier,
          r.severity,
          r.module,
          r.where,
          r.pr != null ? `#${r.pr}` : "",
          // lifecycle stamps + Render deploy sha so the owner can filter by them too
          r.requestedCt,
          r.writtenCt,
          r.mergedCt,
          r.deployedCt,
          r.deployNo,
          deriveLifecycle(r),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(f)
      );
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    // Decorate-sort-undecorate so equal rows keep their original order (stable) regardless of engine.
    return rows
      .map((r, i) => [r, i] as const)
      .sort((x, y) => {
        const c = compareRows(x[0], y[0], sort.key);
        return c !== 0 ? c * dir : x[1] - y[1];
      })
      .map(([r]) => r);
  }, [baseRows, debouncedFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  // Column visibility. Owner-Batch shows a "Review" tag column; the Bugs & Audits tab adds the four
  // audit-finding columns (Severity, Module, Where, Live); and the Lifecycle column (uploaded→written→
  // merged→Render-deployed) shows on the three owner-named tabs: All Tasks, Currently Pending, Bugs &
  // Audits. Column count drives the empty/expanded-row colSpans (leading "#" + 8 base + the optionals).
  const showReview = tab === "owner";
  const showAuditCols = tab === "audit"; // severity/module/where/live
  const showLifecycleCol = tab === "all" || tab === "pending" || tab === "audit";
  const colCount = 9 + (showReview ? 1 : 0) + (showAuditCols ? 4 : 0) + (showLifecycleCol ? 1 : 0);
  const lockedDecisions = data?.locked_decisions ?? [];
  const deltas = data?.meta?.deltas; // NEW: live-sync additions/completions badge (tolerated absent)

  return (
    <div className="space-y-3">
      <Breadcrumb items={[{ label: "Program Board" }]} />
      <PageHeader
        title="Program Board"
        subtitle="Live block/task tracker — two-way. The agent asks; you answer. Nothing is ever lost."
        actions={
          <div className="flex items-center gap-2">
            {PROGRAM_MODULE_NAV.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-sm border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-gray-50"
              >
                {link.label} →
              </a>
            ))}
          </div>
        }
      />

      {/* AUDIT TRUTH — additive, read-only, TRUE-state audit vs prod (committed JSON only). Renders
          nothing when the board's audit snapshot is absent (older backend / unreadable file). */}
      {data?.audit ? <AuditTruthSection audit={data.audit} /> : null}

      {/* HONEST TIMESTAMPS — two distinct fields, never conflated. Left = the snapshot's true age;
          right = live server compute time (re-polled every 60s). Live counts are recomputed at request
          time from the snapshot, so they always match the rows below. */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span className="rounded border border-gray-300 bg-white px-2 py-1">
          Blocks data as of{" "}
          <span className="font-semibold tabular-nums">{data?.data_as_of_ct ?? "…"}</span>
          {typeof data?.live?.snapshot_age_days === "number" && data.live.snapshot_age_days > 0 ? (
            <span className="ml-1 rounded px-1 py-0.5 text-[10px] font-semibold" style={{ background: "#FEF3C7", color: "#854F0B" }}>
              {data.live.snapshot_age_days}d old
            </span>
          ) : null}
        </span>
        <span className="rounded border border-gray-300 bg-white px-2 py-1">
          Live metrics refreshed{" "}
          <span className="font-semibold tabular-nums">{data?.refreshed_at_ct ?? "…"}</span>
          {isFetching ? <span className="ml-1 text-slate-400">· refreshing…</span> : null}
        </span>
        <span className="text-[10px] text-slate-400">auto-refreshes every 60s</span>
        {Object.entries(data?.live?.counts ?? data?.counts ?? {}).map(([k, v]) => {
          const c = statusChip(k);
          return (
            <span key={k} className="rounded px-2 py-1 font-semibold tabular-nums" style={{ background: c.bg, color: c.fg }}>
              {k}: {v}
            </span>
          );
        })}
        {data?.live ? (
          <span className="rounded border border-gray-300 bg-white px-2 py-1 text-slate-500">
            {data.live.merged_pr_total} merged PRs · {data.live.hold_count} HOLD · {data.live.financial_count} financial
          </span>
        ) : null}
      </div>
      {/* Honesty note — PR/HOLD figures are snapshot-based, not a live GitHub feed. */}
      {data?.live ? (
        <p className="text-[10px] text-slate-400">{data.live.note}</p>
      ) : null}

      {/* LOCKED DECISIONS — owner-locked answers surfaced up top so they are never buried in a thread. */}
      {lockedDecisions.length > 0 ? (
        <div className="rounded border border-gray-200 bg-white" style={{ borderLeft: "3px solid #1F2A44" }}>
          <div className="border-b border-gray-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Locked Decisions — owner-locked, do not re-litigate ({lockedDecisions.length})
          </div>
          <ol className="divide-y divide-gray-100">
            {lockedDecisions.map((d, i) => (
              <li key={d.id} className="flex gap-2 px-3 py-2 text-xs text-slate-700">
                <span className="tabular-nums font-semibold text-slate-400">{i + 1}.</span>
                <span className="flex-1">
                  <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{d.id}</span>
                  {d.decision}
                  <span className="ml-2 tabular-nums text-[10px] text-slate-400">{d.date_ct}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {(data?.warnings?.length ?? 0) > 0 ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          {data?.warnings?.join(" · ")}
        </div>
      ) : null}

      {/* tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setExpanded(null);
              }}
              className="px-3 py-1.5 text-xs font-semibold"
              style={{
                color: active ? "#0F1219" : "#64748B",
                borderBottom: active ? "2px solid #1F2A44" : "2px solid transparent",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {isLoading ? <div className="py-8 text-center text-sm text-slate-500">Loading board…</div> : null}
      {isError ? (
        <ListErrorBanner
          message={`Failed to load program board: ${userFacingApiError(error, "error")}`}
          onRetry={() => void refetch()}
        />
      ) : null}

      {/* TABLE tabs */}
      {!isLoading && !isError && (tab === "focus" || tab === "all" || tab === "pending" || tab === "owner" || tab === "dispatch" || tab === "audit") ? (
        <div className="space-y-2">
          {/* Real-time tally/summary (meta-driven) — All Tasks / Currently Pending / Bugs & Audits only.
              Renders nothing when meta is absent (graceful degradation). */}
          {showLifecycleCol ? (
            <TallyBar tally={data?.meta?.tabs?.[tab]} totals={data?.meta?.totals} lastSyncedCt={data?.meta?.last_synced_ct} />
          ) : null}
          {tab === "pending" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {(
                  [
                    { label: `${pendingSummary.open} open`, key: "PENDING" },
                    { label: `${pendingSummary.pending} pending`, key: "PENDING" },
                    { label: `${pendingSummary.gated} legacy GATED (actionable)`, key: "PENDING (GATED)" },
                    { label: `${pendingSummary.needsVerify} needs-verify`, key: "NEEDS-VERIFY" },
                    { label: `${pendingSummary.done} done / ${pendingSummary.total} total`, key: "DONE" },
                  ] as const
                ).map((chip, i) => {
                  const c = statusChip(chip.key);
                  return (
                    <span
                      key={`${chip.label}-${i}`}
                      className="rounded px-2 py-1 font-semibold tabular-nums"
                      style={{ background: c.bg, color: c.fg }}
                    >
                      {chip.label}
                    </span>
                  );
                })}
                <span className="font-semibold tabular-nums text-slate-600">{pendingSummary.pct}% complete</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200" role="progressbar" aria-valuenow={pendingSummary.pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded" style={{ width: `${pendingSummary.pct}%`, background: "#1F2A44" }} />
              </div>
              <p className="text-[11px] text-slate-500">
                Everything not yet concluded — pending, legacy GATED (actionable; no owner approval), and needs-verify. Live on every load; as items are
                finished they leave this list and the completion metric above rises.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by id, description, module, where, status, PR, severity…"
                aria-label="Filter board rows"
                className="h-7 w-72 max-w-full rounded border border-gray-300 px-2 text-xs"
              />
              <DeltasBadge deltas={deltas} open={deltasOpen} onToggle={() => setDeltasOpen((o) => !o)} />
            </div>
            <span className="text-[11px] tabular-nums text-slate-500">
              Showing {activeRows.length} of {baseRows.length}
            </span>
          </div>

          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">#</th>
                  <Th label="Date" onClick={() => toggleSort("date")} active={sort.key === "date"} dir={sort.dir} />
                  <Th label="ID" onClick={() => toggleSort("id")} active={sort.key === "id"} dir={sort.dir} />
                  <Th label="Wave / Source" onClick={() => toggleSort("wave")} active={sort.key === "wave"} dir={sort.dir} />
                  <Th label="Description" onClick={() => toggleSort("description")} active={sort.key === "description"} dir={sort.dir} />
                  <Th label="Tier" onClick={() => toggleSort("tier")} active={sort.key === "tier"} dir={sort.dir} />
                  <Th label="Fin" onClick={() => toggleSort("fin")} active={sort.key === "fin"} dir={sort.dir} />
                  <Th label="Status" onClick={() => toggleSort("status")} active={sort.key === "status"} dir={sort.dir} />
                  <Th label="PR" onClick={() => toggleSort("pr")} active={sort.key === "pr"} dir={sort.dir} />
                  {showAuditCols ? (
                    <>
                      <Th label="Severity" onClick={() => toggleSort("severity")} active={sort.key === "severity"} dir={sort.dir} />
                      <Th label="Module" onClick={() => toggleSort("module")} active={sort.key === "module"} dir={sort.dir} />
                      <Th label="Where" onClick={() => toggleSort("where")} active={sort.key === "where"} dir={sort.dir} />
                      <Th label="Live" onClick={() => toggleSort("live")} active={sort.key === "live"} dir={sort.dir} />
                    </>
                  ) : null}
                  {showLifecycleCol ? (
                    <Th label="Lifecycle" onClick={() => toggleSort("lifecycle")} active={sort.key === "lifecycle"} dir={sort.dir} />
                  ) : null}
                  {showReview ? <Th label="Review" onClick={() => toggleSort("review")} active={sort.key === "review"} dir={sort.dir} /> : null}
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r, i) => {
                  const chip = statusChip(r.status);
                  const isOpen = expanded === r.key;
                  const qs = questionsByBlock.get(r.id) ?? [];
                  const ans = answersByBlock.get(r.id) ?? [];
                  return (
                    <Fragment key={r.key}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : r.key)}
                        className="cursor-pointer border-t border-gray-100 hover:bg-slate-50"
                        style={r.fin ? { boxShadow: "inset 3px 0 0 0 #DC2626" } : undefined}
                      >
                        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-500">{formatDateCt(r.date)}</td>
                        <td className="px-2 py-1.5 font-semibold text-slate-800">
                          <span className="mr-1 text-slate-400">{isOpen ? "▾" : "▸"}</span>
                          {r.id}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{r.wave}</td>
                        <td className="px-2 py-1.5 text-slate-700">
                          {r.description}
                          {qs.length ? <span className="ml-1 rounded bg-slate-200 px-1 text-[10px] text-slate-600">Q{qs.length}</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-600">{r.tier || "—"}</td>
                        <td className="px-2 py-1.5">
                          {r.fin ? (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                              FIN
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: chip.bg, color: chip.fg }}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          {r.pr ? (
                            <a
                              href={`https://github.com/tioperfumes07/IH35-TMS/pull/${r.pr}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-700 underline hover:text-slate-900"
                            >
                              #{r.pr}
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        {showAuditCols ? (
                          <>
                            <td className="whitespace-nowrap px-2 py-1.5">
                              {r.severity ? (
                                <span className="tabular-nums font-semibold text-slate-600">{r.severity.toUpperCase()}</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600">
                              <span className="block max-w-[150px] truncate" title={r.module || undefined}>
                                {r.module || "—"}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-slate-500">
                              <span className="block max-w-[190px] truncate font-mono text-[10px]" title={r.where || undefined}>
                                {r.where || "—"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5">
                              {r.live ? (
                                (() => {
                                  const lc = liveStateChip(r.live);
                                  return (
                                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: lc.bg, color: lc.fg }}>
                                      {lc.label}
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </>
                        ) : null}
                        {showLifecycleCol ? (
                          <td className="px-2 py-1.5">
                            <LifecycleCell row={r} />
                          </td>
                        ) : null}
                        {showReview ? (
                          <td className="whitespace-nowrap px-2 py-1.5">
                            {(() => {
                              const tagVal = reviewTag(r.review);
                              const needsPreview = tagVal === "needs-your-preview";
                              return (
                                <span
                                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                  style={needsPreview ? { background: "#FEF3C7", color: "#854F0B" } : { background: "#E2E8F0", color: "#334155" }}
                                >
                                  {tagVal}
                                </span>
                              );
                            })()}
                          </td>
                        ) : null}
                      </tr>
                      {isOpen ? (
                        <tr className="border-t border-gray-100 bg-slate-50">
                          <td colSpan={colCount} className="px-4 py-3">
                            <ThreadPanel
                              blockId={r.id}
                              questions={qs}
                              answers={ans}
                              onSubmit={async (body) => {
                                await mutation.mutateAsync({ block_id: r.id, kind: "answer", body });
                              }}
                              submitting={mutation.isPending}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {activeRows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-2 py-6 text-center text-slate-400">
                      No rows.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {tab === "focus" && (data?.sequence?.length ?? 0) > 0 ? (
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recommended sequence</div>
              <ol className="space-y-1 text-xs text-slate-700">
                {data?.sequence?.map((s) => (
                  <li key={s.step} className="flex gap-2">
                    <span className="font-semibold tabular-nums text-slate-400">{s.step}.</span>
                    <span>{s.label}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* MERGED PRs tab — the shipped-unit spine (mirrors master-tracker "01 Merged PRs"). Snapshot-based. */}
      {!isLoading && !isError && tab === "merged" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by PR #, title, branch…"
              aria-label="Filter merged PRs"
              className="h-7 w-72 max-w-full rounded border border-gray-300 px-2 text-xs"
            />
            <span className="text-[11px] tabular-nums text-slate-500">
              showing {mergedFiltered.length} of {data?.merged_pr_total ?? mergedFiltered.length} merged PRs
              {(data?.merged_pr_total ?? 0) > (data?.merged_prs?.length ?? 0) ? " (most recent slice)" : ""}
            </span>
          </div>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">#</th>
                  <th className="px-2 py-1.5 font-semibold">PR #</th>
                  <th className="px-2 py-1.5 font-semibold">Title</th>
                  <th className="px-2 py-1.5 font-semibold">Merged At</th>
                  <th className="px-2 py-1.5 font-semibold">Branch</th>
                </tr>
              </thead>
              <tbody>
                {mergedFiltered.map((p, i) => (
                  <tr key={p.number} className="border-t border-gray-100 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-semibold">
                      <a
                        href={`https://github.com/tioperfumes07/IH35-TMS/pull/${p.number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-700 underline hover:text-slate-900"
                      >
                        #{p.number}
                      </a>
                    </td>
                    <td className="px-2 py-1.5 text-slate-700">{p.title}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-500">{formatDateTimeCt(p.mergedAt)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] text-slate-500">{p.branch ?? "—"}</td>
                  </tr>
                ))}
                {mergedFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-slate-400">
                      No merged PRs in this snapshot.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* HOLD tab — merged PRs behind feature flags / deploy lag (historical inventory; not an owner merge hold). Snapshot-based. */}
      {!isLoading && !isError && tab === "hold" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by PR #, title, category…"
              aria-label="Filter held PRs"
              className="h-7 w-72 max-w-full rounded border border-gray-300 px-2 text-xs"
            />
            <span className="text-[11px] tabular-nums text-slate-500">{holdFiltered.length} held items</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Merged but gated — typically behind a feature flag or awaiting deploy/ancestry. Not an owner merge-approval hold; flip flags or wait for deploy as applicable.
          </p>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">#</th>
                  <th className="px-2 py-1.5 font-semibold">PR #</th>
                  <th className="px-2 py-1.5 font-semibold">Title</th>
                  <th className="px-2 py-1.5 font-semibold">Merged At</th>
                  <th className="px-2 py-1.5 font-semibold">Category</th>
                </tr>
              </thead>
              <tbody>
                {holdFiltered.map((p, i) => {
                  const isTier1 = /financial/i.test(p.category);
                  return (
                    <tr key={p.number} className="border-t border-gray-100 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 font-semibold">
                        <a
                          href={`https://github.com/tioperfumes07/IH35-TMS/pull/${p.number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-700 underline hover:text-slate-900"
                        >
                          #{p.number}
                        </a>
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">{p.title}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-500">{formatDateTimeCt(p.mergedAt)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={isTier1 ? { background: "#FEE2E2", color: "#991B1B" } : { background: "#E2E8F0", color: "#334155" }}
                        >
                          {p.category}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {holdFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-slate-400">
                      No HOLD-FOR-JORGE items in this snapshot.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* QUESTIONS tab */}
      {!isLoading && !isError && tab === "questions" ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Every agent question. Type your answer inline — it persists.</p>
          {questions.length === 0 ? <div className="py-6 text-center text-slate-400">No questions yet.</div> : null}
          {questions.map((q, i) => {
            const ans = answersByBlock.get(q.block_id ?? "__general__") ?? [];
            return (
              <div key={q.id} className="rounded border border-gray-200 bg-white p-3">
                <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="tabular-nums font-semibold text-slate-500">{i + 1}.</span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-600">
                    {q.block_id ?? "general"}
                  </span>
                  <span className="tabular-nums">{q.created_at_ct}</span>
                </div>
                <div className="text-sm text-slate-800">{q.body}</div>
                <ThreadPanel
                  blockId={q.block_id ?? null}
                  questions={[]}
                  answers={ans}
                  onSubmit={async (body) => {
                    await mutation.mutateAsync({ block_id: q.block_id ?? null, kind: "answer", body });
                  }}
                  submitting={mutation.isPending}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {/* IDEAS tab */}
      {!isLoading && !isError && tab === "ideas" ? (
        <div className="space-y-3">
          <AddNote
            placeholder="Add an idea — your own, in your words. It is timestamped (CT) and kept forever."
            onSubmit={async (body) => {
              await mutation.mutateAsync({ kind: "idea", body });
            }}
            submitting={mutation.isPending}
          />
          {ideas.length === 0 ? <div className="py-6 text-center text-slate-400">No ideas yet.</div> : null}
          {ideas.map((n, i) => (
            <div key={n.id} className="rounded border border-gray-200 bg-white p-3">
              <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-400">
                <span className="tabular-nums font-semibold text-slate-500">{i + 1}.</span>
                <span className="rounded bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-600">{n.author}</span>
                {n.block_id ? <span className="rounded bg-slate-100 px-1.5 py-0.5">{n.block_id}</span> : null}
                <span className="tabular-nums">{n.created_at_ct}</span>
              </div>
              <div className="text-sm text-slate-800">{n.body}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── AUDIT TRUTH — additive TRUE-state section (2026-07-10 MASTER-MANIFEST audit vs prod branch
// br-fancy-credit-akjnd07a). Read-only, committed-JSON only, gated entirely on `board.audit` being
// present. §7 palette only: navy/slate tokens; --red #dc2626 reserved for not-built/alert emphasis.
function AuditTruthSection({ audit }: { audit: ProgramBoardAudit }) {
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [verdictFilter, setVerdictFilter] = useState<string>("all");

  const modules = useMemo(
    () => Array.from(new Set(audit.top_open_items.map((it) => it.module))).sort(),
    [audit.top_open_items]
  );
  const verdicts = useMemo(
    () => Array.from(new Set(audit.top_open_items.map((it) => it.verdict))).sort(),
    [audit.top_open_items]
  );
  const filteredOpenItems = useMemo(
    () =>
      audit.top_open_items.filter(
        (it) => (moduleFilter === "all" || it.module === moduleFilter) && (verdictFilter === "all" || it.verdict === verdictFilter)
      ),
    [audit.top_open_items, moduleFilter, verdictFilter]
  );

  const tiles: { label: string; value: number; accent?: string }[] = [
    { label: "Built", value: audit.true_totals.built },
    { label: "Partial", value: audit.true_totals.partial },
    { label: "Not Built", value: audit.true_totals.not_built, accent: "#DC2626" },
    { label: "Needs Design", value: audit.true_totals.needs_design },
  ];

  return (
    <div className="space-y-3 rounded border border-gray-200 bg-white p-3" style={{ borderLeft: "3px solid #1F2A44" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Audit Truth — 2026-07-10</h2>
        <span className="text-[10px] text-slate-400">{audit.source}</span>
      </div>
      <p className="text-xs font-semibold text-slate-700">{audit.headline}</p>

      {audit.why_done_overstates.length > 0 ? (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Why the DONE count overstates completion
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
            {audit.why_done_overstates.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded border border-gray-200 p-2 text-center"
              style={t.accent ? { borderColor: t.accent } : undefined}
            >
              <div className="text-lg font-semibold tabular-nums" style={{ color: t.accent ?? "#1F2A44" }}>
                {t.value}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-400">{audit.true_totals.note}</p>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">By module</div>
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full border-collapse text-[11px]">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Module</th>
                <th className="px-2 py-1.5 font-semibold">Built</th>
                <th className="px-2 py-1.5 font-semibold">Partial</th>
                <th className="px-2 py-1.5 font-semibold">Not Built</th>
                <th className="px-2 py-1.5 font-semibold">Needs Design</th>
              </tr>
            </thead>
            <tbody>
              {audit.by_module.map((m) => (
                <tr key={m.module} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 font-semibold text-slate-800">{m.module}</td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-600">{m.built}</td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-600">{m.partial}</td>
                  <td className="px-2 py-1.5 tabular-nums" style={{ color: "#DC2626" }}>
                    {m.not_built}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-600">{m.needs_design}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {audit.prod_verified_facts.length > 0 ? (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Prod-verified facts</div>
          <ul className="space-y-1.5">
            {audit.prod_verified_facts.map((f, i) => (
              <li key={i} className="rounded border border-gray-100 bg-slate-50 px-2 py-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{f.fact}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ background: "#E2E8F0", color: "#334155" }}
                  >
                    {f.verdict}
                  </span>
                </div>
                <div className="mt-0.5 text-slate-600">{f.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {audit.schema_drift_flags.length > 0 ? (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Schema drift flags</div>
          <ul className="list-disc space-y-0.5 pl-4 text-xs" style={{ color: "#DC2626" }}>
            {audit.schema_drift_flags.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Top open items ({filteredOpenItems.length} of {audit.top_open_items.length})
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="h-7 rounded border border-gray-300 px-1.5 text-[11px]"
            >
              <option value="all">All modules</option>
              {modules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="h-7 rounded border border-gray-300 px-1.5 text-[11px]"
            >
              <option value="all">All verdicts</option>
              {verdicts.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full border-collapse text-[11px]">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">ID</th>
                <th className="px-2 py-1.5 font-semibold">Module</th>
                <th className="px-2 py-1.5 font-semibold">Verdict</th>
                <th className="px-2 py-1.5 font-semibold">Tier</th>
                <th className="px-2 py-1.5 font-semibold">Title</th>
                <th className="px-2 py-1.5 font-semibold">Missing</th>
                <th className="px-2 py-1.5 font-semibold">Spec</th>
              </tr>
            </thead>
            <tbody>
              {filteredOpenItems.map((it) => {
                const isNotBuilt = it.verdict.toLowerCase().replace(/\s+/g, "-").includes("not-built");
                return (
                  <tr key={it.id} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] text-slate-500">{it.id}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{it.module}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={isNotBuilt ? { background: "#FEE2E2", color: "#991B1B" } : { background: "#E2E8F0", color: "#334155" }}
                      >
                        {it.verdict}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{it.tier}</td>
                    <td className="px-2 py-1.5 text-slate-700">
                      <span className="block max-w-[320px] truncate" title={it.title}>
                        {it.title}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">
                      <span className="block max-w-[280px] truncate" title={it.missing}>
                        {it.missing}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">
                      <span className="block max-w-[140px] truncate" title={it.spec}>
                        {it.spec}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredOpenItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-slate-400">
                    No items match this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ label, onClick, active, dir }: { label: string; onClick: () => void; active: boolean; dir: "asc" | "desc" }) {
  return (
    <th className="cursor-pointer select-none px-2 py-1.5 font-semibold hover:text-slate-900" onClick={onClick}>
      {label}
      {active ? <span className="ml-0.5 text-slate-400">{dir === "asc" ? "▲" : "▼"}</span> : null}
    </th>
  );
}

// ── Additions/deltas badge — navy pill "+N new · M completed"; click to expand the id list. §7 palette. ──
// Renders nothing when there are no deltas (meta absent, or nothing new/completed since last sync).
function DeltasBadge({ deltas, open, onToggle }: { deltas?: BoardDeltas; open: boolean; onToggle: () => void }) {
  const added = deltas?.added ?? [];
  const completed = deltas?.completed ?? [];
  if (added.length === 0 && completed.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="rounded px-2 py-1 text-[10px] font-semibold tabular-nums"
        style={{ background: "#1F2A44", color: "#FFFFFF" }}
        title={deltas?.since ? `Since ${deltas.since}` : undefined}
      >
        +{added.length} new · {completed.length} completed
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 w-72 max-w-[80vw] rounded border border-gray-200 bg-white p-2 text-[11px] shadow-lg">
          {deltas?.since ? <div className="mb-1 text-[10px] text-slate-400">since {deltas.since}</div> : null}
          {added.length ? (
            <div className="mb-1.5">
              <div className="font-semibold text-slate-600">New ({added.length})</div>
              <ul className="mt-0.5 space-y-0.5">
                {added.map((d) => (
                  <li key={`add-${d.id}`} className="truncate text-slate-700" title={d.name || d.id}>
                    <span className="font-mono text-[10px] text-slate-500">{d.id}</span>
                    {d.name ? ` — ${d.name}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {completed.length ? (
            <div>
              <div className="font-semibold text-slate-600">Completed ({completed.length})</div>
              <ul className="mt-0.5 space-y-0.5">
                {completed.map((d) => (
                  <li key={`done-${d.id}`} className="truncate text-slate-700" title={d.name || d.id}>
                    <span className="rounded px-1 text-[9px] font-semibold" style={{ background: "#DCFCE7", color: "#166534" }}>
                      done
                    </span>{" "}
                    <span className="font-mono text-[10px] text-slate-500">{d.id}</span>
                    {d.pr ? <span className="ml-1 text-slate-500">{d.pr}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// First defined numeric among the candidates (per-tab value wins over the global roll-up).
function pickNum(...vals: unknown[]): number | undefined {
  for (const v of vals) if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

// ── Real-time tally/summary bar (meta-driven) — the owner's core ask: on each of the three named tabs,
// see true progress + all pending financial + all blocks pending per module, live. Reads the sync-engine
// meta (per-tab tally preferred, global totals as fallback). Renders NOTHING when no data is present so
// the board degrades gracefully while the parallel sync PR is still populating these fields. §7 palette.
function TallyBar({ tally, totals, lastSyncedCt }: { tally?: TabTally; totals?: BoardTotals; lastSyncedCt?: string }) {
  const t = tally ?? {};
  const g = totals ?? {};
  const deployed = pickNum(t.deployed, g.deployed);
  const total = pickNum(t.total, g.total);
  const pct =
    pickNum(t.pct_deployed, g.pct_deployed) ??
    (typeof deployed === "number" && typeof total === "number" && total > 0 ? Math.round((deployed / total) * 100) : undefined);
  const financialPending = pickNum(t.financial_pending, g.financial_pending);
  const addedRecent = pickNum(t.added_recent, g.added_recent);
  const completedRecent = pickNum(t.completed_recent, g.completed_recent);
  const byModule = (t.by_module ?? g.by_module ?? {}) as Record<string, number>;

  const moduleChips = Object.entries(byModule)
    .filter(([, n]) => typeof n === "number" && n > 0)
    .sort((a, b) => b[1] - a[1]);

  const hasProgress = typeof pct === "number" || typeof deployed === "number" || typeof total === "number";
  const hasFinancial = typeof financialPending === "number";
  const hasModules = moduleChips.length > 0;
  const hasDeltas = typeof addedRecent === "number" || typeof completedRecent === "number";
  if (!hasProgress && !hasFinancial && !hasModules && !hasDeltas) return null;

  const TOP = 10;
  const shown = moduleChips.slice(0, TOP);
  const moreCount = moduleChips.length - shown.length;

  return (
    <div className="space-y-1.5 rounded border border-gray-200 bg-white p-2">
      {hasProgress ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
            <span className="font-semibold tabular-nums">
              {typeof deployed === "number" ? deployed : "—"} of {typeof total === "number" ? total : "—"} deployed
              {typeof pct === "number" ? ` · ${pct}%` : ""}
            </span>
            {lastSyncedCt ? <span className="text-[10px] text-slate-400">synced {lastSyncedCt}</span> : null}
          </div>
          {typeof pct === "number" ? (
            <div
              className="h-1.5 w-full overflow-hidden rounded bg-slate-200"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: "#1F2A44" }} />
            </div>
          ) : null}
        </div>
      ) : null}

      {hasFinancial || hasDeltas ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {hasFinancial ? (
            <span
              className="rounded px-2 py-0.5 font-semibold tabular-nums"
              style={(financialPending ?? 0) > 0 ? { background: "#FEE2E2", color: "#991B1B" } : { background: "#E2E8F0", color: "#334155" }}
            >
              Pending financial: {financialPending}
            </span>
          ) : null}
          {hasDeltas ? (
            <span className="rounded px-2 py-0.5 tabular-nums text-slate-600" style={{ background: "#E2E8F0" }}>
              +{addedRecent ?? 0} added · {completedRecent ?? 0} completed (since last sync)
            </span>
          ) : null}
        </div>
      ) : null}

      {hasModules ? (
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          <span className="font-semibold uppercase tracking-wide text-slate-500">Pending by module:</span>
          {shown.map(([mod, n]) => (
            <span
              key={mod}
              className="rounded px-1.5 py-0.5 tabular-nums text-slate-600"
              style={{ background: "#E2E8F0" }}
              title={`${mod}: ${n} pending`}
            >
              <span className="inline-block max-w-[140px] truncate align-bottom">{mod}</span> {n}
            </span>
          ))}
          {moreCount > 0 ? <span className="text-slate-400">+{moreCount} more</span> : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Lifecycle confirmation cell — the FULL chain in ONE row, each stage with its real Central-Time stamp:
//   Uploaded→Coder (requested) · Written · Merged · Render ✓ <deploy_no> (deployed).
// Filled (navy ✓, Render stage green) when a stage is reached; hollow (grey ○ + "pending") when not.
// The owner wants both the "uploaded to coder" time and the Render deploy confirmation visible in the same
// row. A row is only fully live once the Render stage is stamped (merged ≠ live). No emoji — plain ✓/○
// text glyphs, §7 palette (navy/slate; deployed green).
function LifecycleCell({ row }: { row: Row }) {
  const stages: { label: string; ts?: string; sha?: string; render?: boolean }[] = [
    { label: "Uploaded→Coder", ts: row.requestedCt },
    { label: "Written", ts: row.writtenCt },
    { label: "Merged", ts: row.mergedCt },
    { label: "Render", ts: row.deployedCt, sha: row.deployNo, render: true },
  ];
  if (!stages.some((s) => s.ts)) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-tight">
      {stages.map((s, i) => {
        const done = Boolean(s.ts);
        // Render stage reads "Render ✓ <sha>"; others read "✓ <label>". Render green when done.
        const nameColor = done ? (s.render ? "#166534" : "#1F2A44") : "#CBD5E1";
        const tsColor = done ? "#64748B" : "#CBD5E1";
        return (
          <Fragment key={s.label}>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span className="font-semibold" style={{ color: nameColor }}>
                {s.render
                  ? `${s.label} ${done ? "✓" : "○"}${done && s.sha ? ` ${s.sha}` : ""}`
                  : `${done ? "✓" : "○"} ${s.label}`}
              </span>
              <span className="tabular-nums" style={{ color: tsColor }}>
                {done ? formatDateTimeCt(s.ts ?? null) : "pending"}
              </span>
            </span>
            {i < stages.length - 1 ? <span className="text-slate-300">·</span> : null}
          </Fragment>
        );
      })}
    </div>
  );
}

function ThreadPanel({
  blockId,
  questions,
  answers,
  onSubmit,
  submitting,
}: {
  blockId: string | null;
  questions: BoardNote[];
  answers: BoardNote[];
  onSubmit: (body: string) => void | Promise<void>;
  submitting: boolean;
}) {
  return (
    <div className="space-y-2">
      {questions.map((q) => (
        <div key={q.id} className="rounded border-l-2 border-slate-300 bg-white px-3 py-2">
          <div className="mb-0.5 flex items-center gap-2 text-[10px] text-slate-400">
            <span className="font-semibold text-slate-500">Agent question</span>
            <span className="tabular-nums">{q.created_at_ct}</span>
          </div>
          <div className="text-xs text-slate-800">{q.body}</div>
        </div>
      ))}
      {answers.map((a) => (
        <div key={a.id} className="rounded border-l-2 px-3 py-2" style={{ borderColor: "#1F2A44", background: "#EAECF1" }}>
          <div className="mb-0.5 flex items-center gap-2 text-[10px] text-slate-500">
            <span className="font-semibold">{a.author === "owner" ? "Jorge" : a.author}</span>
            <span className="tabular-nums">{a.created_at_ct}</span>
          </div>
          <div className="text-xs text-slate-800">{a.body}</div>
        </div>
      ))}
      {!questions.length && !answers.length ? (
        <div className="text-[11px] text-slate-400">No agent question on file for {blockId ?? "this item"} yet — you can still add a note.</div>
      ) : null}
      <AddNote placeholder="Type your answer…" onSubmit={onSubmit} submitting={submitting} compact />
    </div>
  );
}

function AddNote({
  placeholder,
  onSubmit,
  submitting,
  compact,
}: {
  placeholder: string;
  onSubmit: (body: string) => void | Promise<void>;
  submitting: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <div className={compact ? "flex items-start gap-2" : "rounded border border-gray-200 bg-white p-3"}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
      />
      <div className={compact ? "" : "mt-2"}>
        <Button
          size="sm"
          loading={submitting}
          disabled={!value.trim() || submitting}
          onClick={() => {
            const body = value.trim();
            if (!body) return;
            void Promise.resolve(onSubmit(body)).then(
              () => setValue(""),
              () => undefined,
            );
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
