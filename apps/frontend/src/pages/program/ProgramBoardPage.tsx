import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import {
  getProgramBoard,
  postProgramBoardNote,
  type BoardNote,
  type ExtraItem,
  type HoldItem,
  type MergedPr,
  type ProgramBoard,
  type ReconBlock,
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
};

// Owner-Batch review tag: absent/blank/unknown defaults to the standard-pattern "proceed-on-row".
// Only an explicit "needs-your-preview" (judgment-heavy surface) opts into the preview-first path.
export function reviewTag(raw: string | undefined): "proceed-on-row" | "needs-your-preview" {
  return (raw || "").trim().toLowerCase() === "needs-your-preview" ? "needs-your-preview" : "proceed-on-row";
}

type TabId = "focus" | "all" | "pending" | "owner" | "dispatch" | "audit" | "merged" | "hold" | "questions" | "ideas";

const TABS: { id: TabId; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "all", label: "All blocks" },
  { id: "pending", label: "Pending" },
  { id: "owner", label: "Owner-Batch" },
  { id: "dispatch", label: "Dispatch-Kit" },
  { id: "audit", label: "Audit & Bug Sweep" },
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
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00-05:00` : raw);
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
  };
}

type SortKey = "date" | "id" | "wave" | "status" | "tier";

export function ProgramBoardPage() {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("focus");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError, error, isFetching } = useQuery<ProgramBoard>({
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
      const msg = String((e as { payload?: { message?: string } })?.payload?.message ?? (e as Error)?.message ?? "Save failed");
      pushToast(msg, "error");
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

  const activeRows = useMemo<Row[]>(() => {
    let rows: Row[];
    if (tab === "all") rows = allRows;
    else if (tab === "owner") rows = ownerRows;
    else if (tab === "dispatch") rows = dispatchRows;
    else if (tab === "audit") rows = auditRows;
    else if (tab === "focus" || tab === "pending") rows = allRows.filter((r) => isOpenStatus(r.status));
    else rows = [];

    const f = filter.trim().toLowerCase();
    if (f) {
      rows = rows.filter((r) =>
        [r.id, r.wave, r.description, r.status, r.tier].join(" ").toLowerCase().includes(f)
      );
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = String(a[sort.key] ?? "");
      const bv = String(b[sort.key] ?? "");
      return av.localeCompare(bv) * dir;
    });
  }, [tab, allRows, ownerRows, dispatchRows, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  // Owner-Batch shows an extra "Review" tag column. Column count drives the empty/expanded-row colSpans
  // (leading "#" + 8 base columns + optional Review).
  const showReview = tab === "owner";
  const colCount = 9 + (showReview ? 1 : 0);
  const lockedDecisions = data?.locked_decisions ?? [];

  return (
    <div className="space-y-3">
      <Breadcrumb items={[{ label: "Program Board" }]} />
      <PageHeader
        title="Program Board"
        subtitle="Live block/task tracker — two-way. The agent asks; you answer. Nothing is ever lost."
      />

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
        <div className="py-8 text-center text-sm text-red-600">Failed to load: {String((error as Error)?.message ?? "error")}</div>
      ) : null}

      {/* TABLE tabs */}
      {!isLoading && !isError && (tab === "focus" || tab === "all" || tab === "pending" || tab === "owner" || tab === "dispatch") ? (
        <div className="space-y-2">
          {tab === "pending" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {(
                  [
                    { label: `${pendingSummary.open} open`, key: "PENDING" },
                    { label: `${pendingSummary.pending} pending`, key: "PENDING" },
                    { label: `${pendingSummary.gated} gated`, key: "PENDING (GATED)" },
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
                Everything not yet concluded — pending, gated, and needs-verify. Live on every load; as items are
                finished they leave this list and the completion metric above rises.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by id, wave, description, status…"
              className="h-7 w-72 max-w-full rounded border border-gray-300 px-2 text-xs"
            />
            <span className="text-[11px] tabular-nums text-slate-500">{activeRows.length} rows</span>
          </div>

          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">#</th>
                  <Th label="Date" onClick={() => toggleSort("date")} active={sort.key === "date"} dir={sort.dir} />
                  <Th label="ID" onClick={() => toggleSort("id")} active={sort.key === "id"} dir={sort.dir} />
                  <Th label="Wave / Source" onClick={() => toggleSort("wave")} active={sort.key === "wave"} dir={sort.dir} />
                  <th className="px-2 py-1.5 font-semibold">Description</th>
                  <Th label="Tier" onClick={() => toggleSort("tier")} active={sort.key === "tier"} dir={sort.dir} />
                  <th className="px-2 py-1.5 font-semibold">Fin</th>
                  <Th label="Status" onClick={() => toggleSort("status")} active={sort.key === "status"} dir={sort.dir} />
                  <th className="px-2 py-1.5 font-semibold">PR</th>
                  {showReview ? <th className="px-2 py-1.5 font-semibold">Review</th> : null}
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
                              onSubmit={(body) => mutation.mutate({ block_id: r.id, kind: "answer", body })}
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

      {/* HOLD-FOR-JORGE tab — merged-but-gated PRs awaiting Jorge (mirrors master-tracker "11"). Snapshot-based. */}
      {!isLoading && !isError && tab === "hold" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by PR #, title, category…"
              className="h-7 w-72 max-w-full rounded border border-gray-300 px-2 text-xs"
            />
            <span className="text-[11px] tabular-nums text-slate-500">{holdFiltered.length} held items</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Merged but gated — behind a flag or awaiting your financial ceremony. Nothing here is live until you act.
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
                  onSubmit={(body) => mutation.mutate({ block_id: q.block_id ?? null, kind: "answer", body })}
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
            onSubmit={(body) => mutation.mutate({ kind: "idea", body })}
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

function Th({ label, onClick, active, dir }: { label: string; onClick: () => void; active: boolean; dir: "asc" | "desc" }) {
  return (
    <th className="cursor-pointer select-none px-2 py-1.5 font-semibold hover:text-slate-900" onClick={onClick}>
      {label}
      {active ? <span className="ml-0.5 text-slate-400">{dir === "asc" ? "▲" : "▼"}</span> : null}
    </th>
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
  onSubmit: (body: string) => void;
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
  onSubmit: (body: string) => void;
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
            onSubmit(body);
            setValue("");
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
