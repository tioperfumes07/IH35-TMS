/**
 * FEED GATE — Lead 2026-10-01 (owner law: every feed verified for full linkage, wiring, accounts and date stamps
 * before it is accepted; one settlement completes before the next opens).
 * /feed-gate            — every intake (settlement / load), status, red count, run again.
 * /feed-gate/:intakeId  — the checklist: one row per check per subject, red rows first, each with what is missing
 *                         and the link to the screen that fixes it. Close is enabled only when the latest run is green.
 */
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../../components/ListErrorState";
import { closeFeedIntake, getFeedIntake, listFeedIntakes, runFeedGate, type FeedCheck, type FeedIntake, type FeedKind } from "../../api/feedGate";
import { formatDateTimeUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { BoardSection } from "../../components/v3/BoardSection";
import { InfoPopover } from "../../components/shared/InfoPopover";

const STATUS_CLS: Record<string, string> = {
  passed: "bg-[#0F1219] text-white", closed: "bg-[#1F2A44] text-white", blocked: "bg-red-600 text-white", open: "bg-[#E5E7EB] text-[#1F2A44]", voided: "bg-[#F7F8FA] text-[#6B7280]",
};
const GROUP_ORDER = ["driver_pay", "load", "revenue", "controls", "costs", "fuel", "linkage", "stamps"];
const GROUP_LABEL: Record<string, string> = { driver_pay: "Driver pay", load: "Loads", revenue: "Revenue / invoices", controls: "Ledger & controls", costs: "Costs / expenses", fuel: "Fuel", linkage: "Linkage", stamps: "Date stamps" };

function feedKindToEntityKind(feedKind: string | null | undefined): EntityKind | null {
  switch (feedKind) {
    case "settlement":
      return "settlement";
    case "load":
      return "load";
    case "invoice":
      return "invoice";
    case "expense":
      return "expense";
    case "bill":
      return "bill";
    case "deposit":
      return "deposit";
    case "bill_payment":
      return "bill_payment";
    default:
      return null;
  }
}

function subjectTableToEntityKind(subjectTable: string | null | undefined, feedKind?: string | null): EntityKind | null {
  const table = subjectTable?.toLowerCase() ?? "";
  if (table.includes("driver_settlements")) return "settlement";
  if (table.includes("loads")) return "load";
  if (table.includes("invoices")) return "invoice";
  if (table.includes("expenses")) return "expense";
  if (table.includes("bills") && !table.includes("bill_payment")) return "bill";
  if (table.includes("bill_payment")) return "bill_payment";
  if (table.includes("deposit")) return "deposit";
  return feedKindToEntityKind(feedKind);
}

function FeedSubjectLabel({
  label,
  subjectId,
  feedKind,
  subjectTable,
}: {
  label: string | null | undefined;
  subjectId: string | null | undefined;
  feedKind?: string | null;
  subjectTable?: string | null;
}) {
  const display = label ?? "—";
  const kind = subjectTableToEntityKind(subjectTable, feedKind);
  if (!subjectId || !kind) return <>{display}</>;
  return <EntityLink kind={kind} id={subjectId} label={display} />;
}

function Badge({ status }: { status: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${STATUS_CLS[status] ?? "bg-[#E5E7EB]"}`} data-testid={`feed-gate-status-${status}`}>{status}</span>;
}

// 443.99 — both registers are the shared ParityTable (were hand-rolled HTML tables): sortable headers, gear, export.
const CHECK_ROW_CLS: Record<string, string> = {
  fail: "border-l-4 border-red-600 bg-red-50",
  pass: "border-l-4 border-[#1F2A44]",
};

function checkColumns(feedKind?: string | null): Array<ParityColumn<FeedCheck>> {
  return [
    { key: "status", label: "Status", sortable: true, sortValue: (c) => c.status, cellClass: "text-xs font-semibold uppercase", render: (c) => c.status },
    { key: "check_key", label: "Check", sortable: true, sortValue: (c) => c.check_key, render: (c) => c.check_key },
    {
      key: "subject_label",
      label: "Subject",
      sortable: true,
      sortValue: (c) => c.subject_label,
      render: (c) => <FeedSubjectLabel label={c.subject_label} subjectId={c.subject_id} feedKind={feedKind} subjectTable={c.subject_table} />,
    },
    {
      key: "missing",
      label: "What is missing",
      sortable: true,
      allowWrap: true,
      sortValue: (c) => c.missing,
      render: (c) => (c.status === "fail" ? c.missing : c.status === "na" ? (c.missing ?? "not applicable") : "ok"),
    },
    {
      key: "fix_link",
      label: "Fix",
      sortable: false,
      render: (c) => (c.status === "fail" && c.fix_link ? <Link className="underline" to={c.fix_link}>Fix →</Link> : null),
    },
  ];
}

export function FeedGateIntakePage() {
  const { intakeId = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pathname } = useLocation();
  const listHref = pathname.startsWith("/driver-finance/") ? "/driver-finance/feed-gate" : "/feed-gate";
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
        <Link to={listHref} className="text-xs underline">← Feed gate</Link>
        <h1 className="text-xs font-semibold uppercase tracking-wide text-[#4B5563]">{intake?.subject_label ?? intake?.feed_kind ?? "Intake"}</h1>
        {intake ? <Badge status={intake.status} /> : null}
        {intake ? <span className="text-xs text-[#4B5563]">run #{intake.last_run_no} · {intake.checks_failed} red of {intake.checks_total}</span> : null}
        <span className="flex-1" />
        <button type="button" className="h-7 rounded-sm border border-[#1F2A44] px-2 text-xs" disabled={rerun.isPending || !intake || intake.status === "closed"} onClick={() => rerun.mutate()} data-testid="feed-gate-rerun">Run checks again</button>
        <button type="button" className="h-7 rounded-sm bg-[#0F1219] px-2 text-xs text-white disabled:opacity-40" disabled={close.isPending || intake?.status !== "passed"} onClick={() => close.mutate()} data-testid="feed-gate-close">Close feed (all green)</button>
      </div>
      {error ? <div className="mb-2 rounded border border-red-600 bg-red-50 p-2 text-xs text-red-800" role="alert">{error}</div> : null}
      {detail.isLoading ? <p className="text-xs text-[#6B7280]">Loading…</p> : null}
      {groups.map((g) => (
        <div key={g} className="mb-4">
          {/* 443.280 — check group ParityTable in shared BoardSection. */}
          <BoardSection
            title={`${GROUP_LABEL[g] ?? g} · ${checks.filter((c) => c.check_group === g && c.status === "fail").length} red`}
            testId={`feed-gate-checks-${g}-board-section`}
          >
            <ParityTable<FeedCheck>
              rows={checks.filter((c) => c.check_group === g)}
              rowKey={(c) => c.id}
              columns={checkColumns(intake?.feed_kind)}
              storageKey="feed-gate-checks"
              exportFilename={`feed-gate-checks-${g}`}
              suppressToolbarRange
              hidePager
              rowTestId={(c) => `feed-gate-check-${c.check_key}`}
              rowClassName={(c) => CHECK_ROW_CLS[c.status] ?? "border-l-4 border-[#E5E7EB] text-[#6B7280]"}
            />
          </BoardSection>
        </div>
      ))}
    </div>
  );
}

export function FeedGatePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pathname } = useLocation();
  // Intake detail lives at /feed-gate/:id (and /driver-finance/feed-gate/:id when Settlements-mounted).
  const gateBase = pathname.startsWith("/driver-finance/") ? "/driver-finance/feed-gate" : "/feed-gate";
  const underSettlements = pathname.startsWith("/driver-finance/");
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
    <div className={`${underSettlements ? "" : "mx-auto max-w-6xl p-4"}`} data-testid="feed-gate-page">
      {underSettlements ? (
        <p className="mb-3 text-xs text-[#4B5563]">
          <InfoPopover label="About the feed gate">
            <span className="block">Every feed — a settlement, a load, an invoice, an expense, a bill, a fuel purchase — is verified for full linkage, wiring, accounts and date stamps before it is accepted.</span>
            <span className="mt-1 block">A settlement commits only when every check is green and the next settlement for the same driver cannot open until the previous one is closed; an invoice is sent and an expense is saved only through this gate. Red rows carry the link to the screen that fixes them.</span>
          </InfoPopover>
        </p>
      ) : (
        <h1 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
          Feed gate{" "}
          <InfoPopover label="About the feed gate">
            <span className="block">Every feed — a settlement, a load, an invoice, an expense, a bill, a fuel purchase — is verified for full linkage, wiring, accounts and date stamps before it is accepted.</span>
            <span className="mt-1 block">A settlement commits only when every check is green and the next settlement for the same driver cannot open until the previous one is closed; an invoice is sent and an expense is saved only through this gate. Red rows carry the link to the screen that fixes them.</span>
          </InfoPopover>
        </h1>
      )}
      {error ? <div className="mb-2 rounded border border-red-600 bg-red-50 p-2 text-xs text-red-800" role="alert">{error}</div> : null}
      {/* 443.280 — intakes ParityTable in shared BoardSection (Settlements Feed Gate tab + /feed-gate). */}
      <BoardSection title="Feed intakes" testId="feed-gate-intakes-board-section">
        <ParityTable<FeedIntake>
          rows={rows}
          rowKey={(i) => i.id}
          loading={list.isLoading}
          storageKey="feed-gate-intakes"
          exportFilename="feed-gate"
          suppressToolbarRange
          emptyText="No feed has been run yet. Approving a settlement runs its gate automatically."
          rowTestId={() => "feed-gate-row"}
          columns={[
            {
              key: "subject_label",
              label: "Feed",
              sortable: true,
              sortValue: (i) => i.subject_label ?? i.feed_kind,
              render: (i) =>
                feedKindToEntityKind(i.feed_kind) && i.subject_id ? (
                  <span className="inline-flex items-center gap-1">
                    <EntityLink
                      kind={feedKindToEntityKind(i.feed_kind)!}
                      id={i.subject_id}
                      label={i.subject_label ?? `${i.feed_kind} — name not available`}
                    />
                    <Link className="underline text-[#4B5563]" to={`${gateBase}/${i.id}`}>Gate</Link>
                  </span>
                ) : (
                  <Link className="underline" to={`${gateBase}/${i.id}`}>
                    {i.subject_label ?? `${i.feed_kind} — name not available`}
                  </Link>
                ),
            },
            {
              key: "driver_name",
              label: "Driver",
              sortable: true,
              sortValue: (i) => i.driver_name,
              render: (i) => <EntityLinkOrTombstone kind="driver" id={i.driver_id} name={i.driver_name} noun="Driver" />,
            },
            { key: "status", label: "Status", sortable: true, sortValue: (i) => i.status, render: (i) => <Badge status={i.status} /> },
            {
              key: "checks_failed",
              label: "Red / total",
              sortable: true,
              sortValue: (i) => i.checks_failed,
              render: (i) => `${i.checks_failed} / ${i.checks_total}`,
            },
            {
              key: "last_run_at",
              label: "Last run",
              sortable: true,
              sortValue: (i) => i.last_run_at,
              render: (i) => (i.last_run_at ? formatDateTimeUS(i.last_run_at) : "—"),
            },
          ]}
          rowActions={(i) => (
            <button type="button" className="h-7 rounded-sm border border-[#1F2A44] px-2 text-xs" disabled={rerun.isPending || i.status === "closed"} onClick={() => rerun.mutate(i)}>
              Run again
            </button>
          )}
        />
      </BoardSection>
    </div>
  );
}
