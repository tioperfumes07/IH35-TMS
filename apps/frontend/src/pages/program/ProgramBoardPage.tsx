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
  type ProgramBoard,
  type ReconBlock,
} from "../../api/program";

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
  track: "block" | "owner-batch" | "dispatch-kit";
};

type TabId = "focus" | "all" | "owner" | "dispatch" | "questions" | "ideas";

const TABS: { id: TabId; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "all", label: "All blocks" },
  { id: "owner", label: "Owner-Batch" },
  { id: "dispatch", label: "Dispatch-Kit" },
  { id: "questions", label: "Questions" },
  { id: "ideas", label: "Ideas" },
];

const FOCUS_STATUSES = new Set(["PENDING", "NEEDS-VERIFY", "OPEN", "PENDING (GATED)"]);

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

  const { data, isLoading, isError, error } = useQuery<ProgramBoard>({
    queryKey: ["program-board"],
    queryFn: getProgramBoard,
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
    if (tab === "all") rows = [...blockRows, ...ownerRows, ...dispatchRows];
    else if (tab === "owner") rows = ownerRows;
    else if (tab === "dispatch") rows = dispatchRows;
    else if (tab === "focus")
      rows = [...blockRows, ...ownerRows, ...dispatchRows].filter((r) => FOCUS_STATUSES.has((r.status || "").toUpperCase()));
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
  }, [tab, blockRows, ownerRows, dispatchRows, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="space-y-3">
      <Breadcrumb items={[{ label: "Program Board" }]} />
      <PageHeader
        title="Program Board"
        subtitle="Live block/task tracker — two-way. The agent asks; you answer. Nothing is ever lost."
      />

      {/* generated + counts strip */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span className="rounded border border-gray-300 bg-white px-2 py-1">
          Generated <span className="font-semibold tabular-nums">{data?.generated_at_ct ?? "…"}</span>
        </span>
        {data?.source_generated_on ? (
          <span className="rounded border border-gray-300 bg-white px-2 py-1">
            Reconcile snapshot <span className="font-semibold tabular-nums">{data.source_generated_on}</span>
          </span>
        ) : null}
        {Object.entries(data?.counts ?? {}).map(([k, v]) => {
          const c = statusChip(k);
          return (
            <span key={k} className="rounded px-2 py-1 font-semibold tabular-nums" style={{ background: c.bg, color: c.fg }}>
              {k}: {v}
            </span>
          );
        })}
      </div>

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
      {!isLoading && !isError && (tab === "focus" || tab === "all" || tab === "owner" || tab === "dispatch") ? (
        <div className="space-y-2">
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
                  <Th label="Date" onClick={() => toggleSort("date")} active={sort.key === "date"} dir={sort.dir} />
                  <Th label="ID" onClick={() => toggleSort("id")} active={sort.key === "id"} dir={sort.dir} />
                  <Th label="Wave / Source" onClick={() => toggleSort("wave")} active={sort.key === "wave"} dir={sort.dir} />
                  <th className="px-2 py-1.5 font-semibold">Description</th>
                  <Th label="Tier" onClick={() => toggleSort("tier")} active={sort.key === "tier"} dir={sort.dir} />
                  <th className="px-2 py-1.5 font-semibold">Fin</th>
                  <Th label="Status" onClick={() => toggleSort("status")} active={sort.key === "status"} dir={sort.dir} />
                  <th className="px-2 py-1.5 font-semibold">PR</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r) => {
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
                      </tr>
                      {isOpen ? (
                        <tr className="border-t border-gray-100 bg-slate-50">
                          <td colSpan={8} className="px-4 py-3">
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
                    <td colSpan={8} className="px-2 py-6 text-center text-slate-400">
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

      {/* QUESTIONS tab */}
      {!isLoading && !isError && tab === "questions" ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Every agent question. Type your answer inline — it persists.</p>
          {questions.length === 0 ? <div className="py-6 text-center text-slate-400">No questions yet.</div> : null}
          {questions.map((q) => {
            const ans = answersByBlock.get(q.block_id ?? "__general__") ?? [];
            return (
              <div key={q.id} className="rounded border border-gray-200 bg-white p-3">
                <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-400">
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
          {ideas.map((n) => (
            <div key={n.id} className="rounded border border-gray-200 bg-white p-3">
              <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-400">
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
