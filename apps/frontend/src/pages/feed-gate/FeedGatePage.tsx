/**
 * FEED GATE — Lead 2026-10-01 (owner law: every feed verified for full linkage, wiring, accounts and date stamps
 * before it is accepted; one settlement completes before the next opens).
 * /feed-gate            — every intake (settlement / load), status, red count, run again.
 * /feed-gate/:intakeId  — the checklist: one row per check per subject, red rows first, each with what is missing
 *                         and the link to the screen that fixes it. Close is enabled only when the latest run is green.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../../components/ListErrorState";
import { closeFeedIntake, getFeedIntake, listFeedIntakes, runFeedGate, type FeedCheck, type FeedIntake, type FeedKind } from "../../api/feedGate";

const STATUS_CLS: Record<string, string> = {
  passed: "bg-slate-800 text-white", closed: "bg-slate-600 text-white", blocked: "bg-red-600 text-white", open: "bg-slate-200 text-slate-800", voided: "bg-slate-100 text-slate-500",
};
const GROUP_ORDER = ["driver_pay", "load", "revenue", "controls", "costs", "fuel", "linkage", "stamps"];
const GROUP_LABEL: Record<string, string> = { driver_pay: "Driver pay", load: "Loads", revenue: "Revenue / invoices", controls: "Ledger & controls", costs: "Costs / expenses", fuel: "Fuel", linkage: "Linkage", stamps: "Date stamps" };

function Badge({ status }: { status: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${STATUS_CLS[status] ?? "bg-slate-200"}`} data-testid={`feed-gate-status-${status}`}>{status}</span>;
}

function CheckRow({ c }: { c: FeedCheck }) {
  const cls = c.status === "fail" ? "border-l-4 border-red-600 bg-red-50" : c.status === "pass" ? "border-l-4 border-slate-700" : "border-l-4 border-slate-300 text-slate-500";
  return (
    <tr className={cls} data-testid={`feed-gate-check-${c.check_key}`} data-status={c.status}>
      <td className="p-2 text-xs font-semibold uppercase">{c.status}</td>
      <td className="p-2 text-xs">{c.check_key}</td>
      <td className="p-2 text-xs">{c.subject_label ?? "—"}</td>
      <td className="p-2 text-xs">{c.status === "fail" ? c.missing : c.status === "na" ? (c.missing ?? "not applicable") : "ok"}</td>
      <td className="p-2 text-xs">{c.status === "fail" && c.fix_link ? <Link className="underline" to={c.fix_link}>Fix →</Link> : null}</td>
    </tr>
  );
}

export function FeedGateIntakePage() {
  const { intakeId = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ["feed-gate", "intake", companyId, intakeId], queryFn: () => getFeedIntake(companyId, intakeId), enabled: !!companyId && !!intakeId });
  const rerun = useMutation({
    mutationFn: () => runFeedGate(companyId, (detail.data?.intake.feed_kind ?? "settlement") as FeedKind, detail.data?.intake.subject_id ?? ""),
    onSuccess: () => { setError(null); void qc.invalidateQueries({ queryKey: ["feed-gate"] }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });
  const close = useMutation({
    mutationFn: () => closeFeedIntake(companyId, intakeId),
    onSuccess: () => { setError(null); void qc.invalidateQueries({ queryKey: ["feed-gate"] }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });
  const intake = detail.data?.intake;
  const checks = detail.data?.checks ?? [];
  const groups = GROUP_ORDER.filter((g) => checks.some((c) => c.check_group === g)).concat(Array.from(new Set(checks.map((c) => c.check_group))).filter((g) => !GROUP_ORDER.includes(g)));
  if (detail.isError) {
    return (
      <div className="mx-auto max-w-6xl p-4" data-testid="feed-gate-intake-page">
        <ListErrorState
          title="Could not load feed gate intake"
          status={0}
          message={(detail.error as Error)?.message}
          onRetry={() => void detail.refetch()}
        />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl p-4" data-testid="feed-gate-intake-page">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link to="/feed-gate" className="text-xs underline">← Feed gate</Link>
        <h1 className="text-xs font-semibold uppercase tracking-wide text-slate-700">{intake?.subject_label ?? intake?.feed_kind ?? "Intake"}</h1>
        {intake ? <Badge status={intake.status} /> : null}
        {intake ? <span className="text-xs text-slate-600">run #{intake.last_run_no} · {intake.checks_failed} red of {intake.checks_total}</span> : null}
        <span className="flex-1" />
        <button type="button" className="h-7 rounded-sm border border-slate-700 px-2 text-xs" disabled={rerun.isPending || !intake || intake.status === "closed"} onClick={() => rerun.mutate()} data-testid="feed-gate-rerun">Run checks again</button>
        <button type="button" className="h-7 rounded-sm bg-slate-800 px-2 text-xs text-white disabled:opacity-40" disabled={close.isPending || intake?.status !== "passed"} onClick={() => close.mutate()} data-testid="feed-gate-close">Close feed (all green)</button>
      </div>
      {error ? <div className="mb-2 rounded border border-red-600 bg-red-50 p-2 text-xs text-red-800" role="alert">{error}</div> : null}
      {detail.isLoading ? <p className="text-xs text-slate-500">Loading…</p> : null}
      {groups.map((g) => (
        <div key={g} className="mb-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{GROUP_LABEL[g] ?? g} · {checks.filter((c) => c.check_group === g && c.status === "fail").length} red</h2>
          <table className="w-full border-collapse"><thead><tr className="text-left text-xs text-slate-500"><th className="p-2">Status</th><th className="p-2">Check</th><th className="p-2">Subject</th><th className="p-2">What is missing</th><th className="p-2">Fix</th></tr></thead>
            <tbody>{checks.filter((c) => c.check_group === g).map((c) => <CheckRow key={c.id} c={c} />)}</tbody></table>
        </div>
      ))}
    </div>
  );
}

export function FeedGatePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["feed-gate", "list", companyId], queryFn: () => listFeedIntakes(companyId), enabled: !!companyId });
  const rerun = useMutation({
    mutationFn: (i: FeedIntake) => runFeedGate(companyId, i.feed_kind as FeedKind, i.subject_id),
    onSuccess: () => { setError(null); void qc.invalidateQueries({ queryKey: ["feed-gate"] }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });
  const rows = list.data?.intakes ?? [];
  if (list.isError) {
    return (
      <div className="mx-auto max-w-6xl p-4" data-testid="feed-gate-page">
        <ListErrorState
          title="Could not load feed gate"
          status={0}
          message={(list.error as Error)?.message}
          onRetry={() => void list.refetch()}
        />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl p-4" data-testid="feed-gate-page">
      <h1 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-700">Feed gate</h1>
      <p className="mb-3 text-xs text-slate-600">Every feed — a settlement, a load, an invoice, an expense, a bill, a fuel purchase — is verified for full linkage, wiring, accounts and date stamps before it is accepted. A settlement commits only when every check is green and the next settlement for the same driver cannot open until the previous one is closed; an invoice is sent and an expense is saved only through this gate. Red rows carry the link to the screen that fixes them.</p>
      {error ? <div className="mb-2 rounded border border-red-600 bg-red-50 p-2 text-xs text-red-800" role="alert">{error}</div> : null}
      <table className="w-full border-collapse">
        <thead><tr className="text-left text-xs text-slate-500"><th className="p-2">Feed</th><th className="p-2">Driver</th><th className="p-2">Status</th><th className="p-2">Red / total</th><th className="p-2">Last run</th><th className="p-2"></th></tr></thead>
        <tbody>
          {rows.length === 0 && !list.isLoading && !list.isError ? <tr><td className="p-2 text-xs text-slate-500" colSpan={6}>No feed has been run yet. Approving a settlement runs its gate automatically.</td></tr> : null}
          {rows.map((i) => (
            <tr key={i.id} className="border-t border-slate-200" data-testid="feed-gate-row">
              <td className="p-2 text-xs"><Link className="underline" to={`/feed-gate/${i.id}`}>{i.subject_label ?? `${i.feed_kind} ${i.subject_id.slice(0, 8)}`}</Link></td>
              <td className="p-2 text-xs">{i.driver_name ?? "—"}</td>
              <td className="p-2"><Badge status={i.status} /></td>
              <td className="p-2 text-xs">{i.checks_failed} / {i.checks_total}</td>
              <td className="p-2 text-xs">{i.last_run_at ? new Date(i.last_run_at).toLocaleString() : "—"}</td>
              <td className="p-2"><button type="button" className="h-7 rounded-sm border border-slate-700 px-2 text-xs" disabled={rerun.isPending || i.status === "closed"} onClick={() => rerun.mutate(i)}>Run again</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
