import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { getProgramBoard, type ProgramBoard, type ReconBlock } from "../../api/program";
import { userFacingApiError } from "../../lib/api-error-message";

// Final Additions — the launch punch-list. Shows every remaining block that still has to be built,
// and flips each to DONE as it ships. Completed blocks are NEVER removed — they stay, labelled DONE,
// so the list is the append-only record of the final additions to the software.
// Read-only view over the same reconcile snapshot the Program Board uses (/api/v1/program/board);
// it advances whenever `npm run reconcile:blocks` is committed + deployed.

function isDone(status: string) {
  return (status || "").toUpperCase() === "DONE";
}

// Ordering weight for the remaining work: actionable-now first, gated (owner-blocked) last.
function openRank(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "PENDING" || s === "OPEN") return 0;
  if (s === "NEEDS-VERIFY") return 1;
  if (s.includes("GATED")) return 2;
  return 3;
}

function statusStyle(status: string): { bg: string; fg: string; label: string } {
  const s = (status || "").toUpperCase();
  if (s === "DONE") return { bg: "#DCFCE7", fg: "#166534", label: "Done" };
  if (s === "NEEDS-VERIFY") return { bg: "#FEF3C7", fg: "#854F0B", label: "Needs verify" };
  if (s.includes("GATED")) return { bg: "#F3F4F6", fg: "#6B7280", label: "Gated" };
  if (s === "PENDING" || s === "OPEN") return { bg: "#E2E8F0", fg: "#334155", label: "Pending" };
  return { bg: "#E2E8F0", fg: "#334155", label: s || "—" };
}

function StatusPill({ status }: { status: string }) {
  const st = statusStyle(status);
  return (
    <span
      className="inline-block rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: st.bg, color: st.fg }}
    >
      {st.label}
    </span>
  );
}

function BlockRow({ b }: { b: ReconBlock }) {
  return (
    <div className="flex items-center gap-3 border-t border-gray-100 px-3 py-2 first:border-t-0">
      <div className="w-28 shrink-0">
        <StatusPill status={b.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-slate-800" title={b.name || b.id}>
          {b.name || b.id}
        </div>
        <div className="truncate text-[11px] text-slate-500">
          {b.id}
          {b.source ? ` · ${b.source}` : ""}
          {b.tier ? ` · ${b.tier}` : ""}
          {b.fin ? " · financial" : ""}
        </div>
      </div>
      <div className="w-24 shrink-0 text-right text-[11px] text-slate-500">
        {b.pr ? (
          <a
            href={`https://github.com/tioperfumes07/IH35-TMS/pull/${b.pr}`}
            target="_blank"
            rel="noreferrer"
            className="text-slate-600 underline decoration-slate-300 hover:text-slate-900"
          >
            #{b.pr}
          </a>
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-slate-700">
          {done} of {total} shipped
        </span>
        <span className="text-[13px] font-semibold text-slate-700">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#1F2A44" }} />
      </div>
    </div>
  );
}

function CountChip({ label, value, bg, fg }: { label: string; value: number; bg: string; fg: string }) {
  return (
    <div className="rounded-sm border border-gray-200 px-3 py-1.5">
      <div className="text-lg font-semibold tabular-nums" style={{ color: fg }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: fg, opacity: 0.85, backgroundColor: "transparent" }}>
        <span style={{ backgroundColor: bg }} className="rounded-sm px-1 py-0.5">
          {label}
        </span>
      </div>
    </div>
  );
}

const RECENT_DONE_LIMIT = 60;

export function FinalAdditionsPage() {
  const { data, isLoading, isError, error } = useQuery<ProgramBoard>({
    queryKey: ["program", "board", "final-additions"],
    queryFn: getProgramBoard,
    staleTime: 60_000,
  });

  const blocks = useMemo(() => data?.blocks ?? [], [data?.blocks]);

  const { remaining, done, counts } = useMemo(() => {
    const remaining = blocks.filter((b) => !isDone(b.status)).sort((a, b) => openRank(a.status) - openRank(b.status));
    const done = blocks
      .filter((b) => isDone(b.status))
      .sort((a, b) => (b.pr ?? 0) - (a.pr ?? 0));
    let pending = 0;
    let gated = 0;
    let verify = 0;
    for (const b of remaining) {
      const r = openRank(b.status);
      if (r === 0) pending += 1;
      else if (r === 1) verify += 1;
      else gated += 1;
    }
    return { remaining, done, counts: { pending, gated, verify, done: done.length, total: blocks.length } };
  }, [blocks]);

  return (
    <div className="space-y-3">
      <Breadcrumb items={[{ label: "Program", href: "/program" }, { label: "Final Additions" }]} />
      <PageHeader
        backHref="/program"
        title="Final Additions"
        subtitle="The launch punch-list — every remaining block, flipped to Done as it ships. Nothing is removed; shipped work stays, labelled Done."
      />

      {isLoading ? <div className="py-8 text-center text-sm text-slate-500">Loading punch-list…</div> : null}
      {isError ? (
        <div className="py-8 text-center text-sm text-red-600">Failed to load: {userFacingApiError(error, "error")}</div>
      ) : null}

      {data ? (
        <>
          <div className="rounded border border-gray-200 bg-white p-3" style={{ borderLeft: "3px solid #1F2A44" }}>
            <ProgressBar done={counts.done} total={counts.total} />
            <div className="mt-3 flex flex-wrap gap-2">
              <CountChip label="Pending" value={counts.pending} bg="#E2E8F0" fg="#334155" />
              <CountChip label="Needs verify" value={counts.verify} bg="#FEF3C7" fg="#854F0B" />
              <CountChip label="Gated (owner)" value={counts.gated} bg="#F3F4F6" fg="#6B7280" />
              <CountChip label="Done" value={counts.done} bg="#DCFCE7" fg="#166534" />
            </div>
            {data.live?.snapshot_age_days != null ? (
              <div className="mt-2 text-[11px] text-slate-500">
                Snapshot {data.live.snapshot_age_days === 0 ? "current" : `${data.live.snapshot_age_days} day(s) old`}
                {data.data_as_of_ct ? ` · data as of ${data.data_as_of_ct}` : ""} — re-run reconcile to advance.
              </div>
            ) : null}
          </div>

          <div className="rounded border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Remaining to build ({remaining.length})
              </span>
            </div>
            {remaining.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500">Nothing left — all blocks shipped.</div>
            ) : (
              remaining.map((b) => <BlockRow key={b.id} b={b} />)
            )}
          </div>

          <div className="rounded border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Shipped — kept for the record ({counts.done})
              </span>
              {done.length > RECENT_DONE_LIMIT ? (
                <span className="text-[11px] text-slate-400">showing {RECENT_DONE_LIMIT} most recent</span>
              ) : null}
            </div>
            {done.slice(0, RECENT_DONE_LIMIT).map((b) => (
              <BlockRow key={b.id} b={b} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default FinalAdditionsPage;
