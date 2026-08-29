import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { resolveApiUrl } from "../../api/client";
import { getQboReconciliation, type QboReconResponse, type ReconObject } from "../../api/qbo-recon";
import { getLedgerHealth, type LedgerHealthResponse, type LedgerHealthFinding } from "../../api/ledger-health";
import { getQboSyncHealth, type QboSyncHealthResponse } from "../../api/qbo-integration";
import { getApAging, type ApAgingSummary } from "../../api/arApAging";
import { getProgramTracker, type ProgramTracker, type TrackerPhase } from "../../api/program-tracker";
import {
  getTransactionHealth,
  txHealthDocumentPath,
  type TxHealthResponse,
  type TxHealthRow,
} from "../../api/transaction-health";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { companyToday } from "../../lib/businessDate";

/**
 * SYSTEM — Owner-only module. Single home for QuickBooks Reconciliation (TMS↔QBO tie-out — NOT bank
 * reconciliation, which stays in Banking), QuickBooks Sync, Program Tracker, Software/Build health, and
 * Claude Coder (a read-only launcher; NO command execution happens in this app — auditor/DOT-safe).
 * Built field-for-field from the owner-supplied design mockup; palette + module-header law follow §7.
 *
 * NON-FINANCIAL: reads financial data (AP aging, QBO recon/sync health), posts nothing.
 */

// Canonical tab set — the guard (scripts/verify-system-module.mjs) asserts all eight labels are
// present. TXH-01 (2026-08-28) added "Transactions": every TMS-native document, computed-at-read-time
// health (posted/balanced/linked/sample-consistent), read-only. USMCA hides QBO Reconciliation/Sync
// today, so the owner sees 6 of these 8 — see QBO_SYSTEM_TAB_IDS below.
export const SYSTEM_TABS = [
  { id: "overview", label: "Overview" },
  { id: "qbo-recon", label: "QuickBooks Reconciliation" },
  { id: "qbo-sync", label: "QuickBooks Sync" },
  { id: "program", label: "Program Tracker" },
  { id: "software", label: "Software / Build" },
  { id: "ledger-health", label: "Ledger Health" },
  { id: "tx-health", label: "Transaction Health" },
  { id: "claude-coder", label: "Claude Coder" },
] as const;

type SystemTabId = (typeof SYSTEM_TABS)[number]["id"];
const SYSTEM_TAB_IDS = new Set<string>(SYSTEM_TABS.map((t) => t.id));
const QBO_SYSTEM_TAB_IDS = new Set<SystemTabId>(["qbo-recon", "qbo-sync"]);

export function parseSystemTab(raw: string | null, qboAvailable = true): SystemTabId {
  if (raw && SYSTEM_TAB_IDS.has(raw)) {
    const parsed = raw as SystemTabId;
    if (qboAvailable || !QBO_SYSTEM_TAB_IDS.has(parsed)) return parsed;
  }
  return "overview";
}

const CT = "America/Chicago";
const LAUNCH_COMMAND = "claude --project IH35-TMS";

function ctDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleString("en-US", { timeZone: CT, year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) +
    " CT"
  );
}

function fmtUsd(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function activeTrackerCount(tracker: ProgramTracker): number {
  const { pending, in_progress, completed } = tracker.view_counts;
  return pending + in_progress + completed;
}

// ---- primitives (match the mockup: card / row / pill / kpi) ---------------------------------------

type PillTone = "ok" | "warn" | "off" | "neutral";
const PILL_CLS: Record<PillTone, string> = {
  ok: "bg-[#d1fae5] text-[#065f46]",
  warn: "bg-[#fef3c7] text-[#b45309]",
  off: "bg-[#fee2e2] text-[#dc2626]",
  neutral: "bg-slate-200 text-slate-700",
};

function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${PILL_CLS[tone]}`}>{children}</span>;
}

function Card({ title, pill, sub, children, footer, full }: {
  title: string;
  pill?: ReactNode;
  sub?: string;
  children?: ReactNode;
  footer?: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white px-[18px] py-4 ${full ? "sm:col-span-2" : ""}`}>
      <h3 className="flex items-center gap-2 text-[13px] font-bold tracking-wide text-[#1f2a44]">
        {title}
        {pill}
      </h3>
      {sub ? <div className="mb-3 mt-0.5 text-[11.5px] text-slate-500">{sub}</div> : null}
      {children}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-200 py-[7px] text-[12px] first:border-t-0">
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-500">{children}</span>
    </div>
  );
}

function Kpi({ n, u }: { n: ReactNode; u: string }) {
  return (
    <div className="my-0.5 flex items-baseline gap-2">
      <span className="text-[22px] font-bold text-[#1f2a44] tabular-nums">{n}</span>
      <span className="text-[11.5px] text-slate-500">{u}</span>
    </div>
  );
}

function GhostButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#1f2a44] hover:bg-gray-50"
    >
      {children}
    </button>
  );
}

// ---- live data hooks ------------------------------------------------------------------------------

function useSystemData(companyId: string | null, qboAvailable: boolean) {
  const enabled = !!companyId;
  const asOf = companyToday();

  const recon = useQuery<QboReconResponse>({
    queryKey: ["system", "qbo-recon", companyId],
    queryFn: () => getQboReconciliation(companyId as string),
    enabled: enabled && qboAvailable,
    retry: false,
    staleTime: 60_000,
  });
  const syncHealth = useQuery<QboSyncHealthResponse>({
    queryKey: ["system", "qbo-sync-health", companyId],
    queryFn: () => getQboSyncHealth(companyId as string),
    enabled: enabled && qboAvailable,
    retry: false,
    staleTime: 60_000,
  });
  const apAging = useQuery<ApAgingSummary>({
    queryKey: ["system", "ap-aging", companyId, asOf],
    queryFn: () => getApAging(companyId as string, asOf),
    enabled: enabled && qboAvailable,
    retry: false,
    staleTime: 60_000,
  });
  const tracker = useQuery<ProgramTracker>({
    queryKey: ["system", "program-tracker"],
    queryFn: getProgramTracker,
    retry: false,
    staleTime: 60_000,
  });
  const ledgerHealth = useQuery<LedgerHealthResponse>({
    queryKey: ["system", "ledger-health", companyId],
    queryFn: () => getLedgerHealth(companyId as string),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  const health = useQuery({
    queryKey: ["system", "healthz"],
    queryFn: fetchHealth,
    retry: false,
    staleTime: 30_000,
  });

  return { recon, syncHealth, apAging, tracker, health, ledgerHealth };
}

type HealthSnapshot = {
  version: string;
  ok: boolean;
  checks: { name: string; ok: boolean; tier: "critical" | "warning" }[];
};

async function fetchHealth(): Promise<HealthSnapshot> {
  const [shallowRes, deepRes] = await Promise.all([
    fetch(resolveApiUrl("/api/v1/healthz/shallow"), { credentials: "include" }),
    fetch(resolveApiUrl("/api/v1/healthz"), { credentials: "include" }),
  ]);
  const shallow = shallowRes.ok ? await shallowRes.json() : {};
  // Deep health returns 200 or 503, both with a JSON body of checks.
  const deep = await deepRes.json().catch(() => ({ ok: false, checks: [] }));
  return {
    version: String(shallow?.version ?? "—"),
    ok: Boolean(deep?.ok),
    checks: Array.isArray(deep?.checks) ? deep.checks : [],
  };
}

/** Find the A/P reconciliation object (label/object mentions "A/P" or "payable"). */
function findApObject(recon: QboReconResponse | undefined) {
  if (!recon) return undefined;
  return recon.objects.find((o) => /a\/p|payable/i.test(o.label) || /a\/p|payable|\bap\b/i.test(o.object));
}

type SystemData = ReturnType<typeof useSystemData>;

// ---- tab bodies -----------------------------------------------------------------------------------

function OverviewTab({ data, onOpen, qboAvailable }: { data: SystemData; onOpen: (id: SystemTabId) => void; qboAvailable: boolean }) {
  const { recon, syncHealth, apAging, tracker, health, ledgerHealth } = data;
  const lhOpen = ledgerHealth.data?.open_findings_count ?? null;
  const lhCritical = ledgerHealth.data?.critical_open_count ?? null;
  const apObj = findApObject(recon.data);
  const reconAlerts = recon.data?.open_findings_count ?? null;
  const syncConnected = syncHealth.data?.status === "healthy" || syncHealth.data?.status === "syncing";
  const syncBroken = syncHealth.data?.status === "error" || syncHealth.data?.needs_reconnect === true;
  const apVendorCount = apAging.data?.vendors?.length ?? null;
  const healthGreen = health.data?.ok === true;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {qboAvailable ? <Card
        title="QuickBooks Reconciliation"
        pill={<Pill tone="neutral">TMS ↔ QBO</Pill>}
        sub="Daily tie-out of what the TMS posted against QuickBooks (system-of-record). This is not bank reconciliation — bank statement matching stays in Banking."
        footer={<GhostButton onClick={() => onOpen("qbo-recon")}>Open QuickBooks Reconciliation</GhostButton>}
      >
        <Row label="Last tie-out run">{ctDateTime(recon.data?.sync_state.last_successful_tick_at)}</Row>
        <Row label="A/P tie-out (QBO vs TMS)">
          {apObj ? (
            apObj.balance?.in_sync ? <Pill tone="ok">IN SYNC</Pill> : <Pill tone="off">DRIFT</Pill>
          ) : (
            <Pill tone="off">PENDING PULL</Pill>
          )}
        </Row>
        <Row label="Unresolved reconciliation alerts">
          {reconAlerts == null ? <Pill tone="neutral">—</Pill> : <Pill tone={reconAlerts > 0 ? "warn" : "ok"}>{reconAlerts}</Pill>}
        </Row>
      </Card> : null}

      {/* QuickBooks Sync */}
      {qboAvailable ? <Card
        title="QuickBooks Sync"
        pill={
          syncConnected ? (
            <Pill tone="ok">CONNECTED</Pill>
          ) : syncBroken ? (
            <Pill tone="off">{syncHealth.data?.needs_reconnect ? "RECONNECT NEEDED" : "ERROR"}</Pill>
          ) : (
            <Pill tone="warn">CHECKING</Pill>
          )
        }
        sub="Pull-only from QuickBooks — no write-back (by design)."
        footer={<GhostButton onClick={() => onOpen("qbo-sync")}>Open QuickBooks Sync</GhostButton>}
      >
        <Kpi n={fmtUsd(apObj?.balance?.qbo_cents)} u={`QBO A/P${apVendorCount != null ? ` · ${apVendorCount} vendors` : ""}`} />
        <Row label="Pulled into TMS (accounting.bills)">{fmtUsd(apAging.data?.totals.total_open_cents)}</Row>
        <Row label="QBO write-back">
          <Pill tone="ok">OFF (by design)</Pill>
        </Row>
      </Card> : null}

      {/* Program Tracker */}
      <Card
        title="Program Tracker"
        sub="Live build status — derived from merges + deploys, not a static field."
        footer={<GhostButton onClick={() => onOpen("program")}>Open Program Tracker</GhostButton>}
      >
        <Row label="Registered">
          {tracker.data ? <span className="tabular-nums">{tracker.data.registered_total}</span> : "—"}
        </Row>
        <Row label="Active tracked blocks">
          {tracker.data ? <span className="tabular-nums">{activeTrackerCount(tracker.data)}</span> : <Pill tone="warn">LIVE COUNT PENDING</Pill>}
        </Row>
        <Row label="Built &amp; live-verified">{tracker.data ? <span className="tabular-nums">{tracker.data.view_counts.completed}</span> : "—"}</Row>
        <Row label="In progress (open PR)">{tracker.data ? <span className="tabular-nums">{tracker.data.view_counts.in_progress}</span> : "—"}</Row>
      </Card>

      {/* Software / Build */}
      <Card
        title="Software / Build"
        pill={health.data ? <Pill tone={healthGreen ? "ok" : "off"}>{healthGreen ? "HEALTHY" : "DEGRADED"}</Pill> : <Pill tone="neutral">CHECKING</Pill>}
        sub="Deployed version, migrations, and service health."
        footer={<GhostButton onClick={() => onOpen("software")}>Open Health &amp; Deploys</GhostButton>}
      >
        <Row label="Deployed backend">
          <span className="font-mono text-[11.5px]">{health.data?.version ?? "—"}</span>
        </Row>
        <Row label="Frontend build">
          <span className="font-mono text-[11.5px]">{__APP_VERSION__}</span>
        </Row>
        <Row label="Deploy parity">
          {(() => {
            // Frontend and backend deploy independently. Two unequal SHAs prove drift, but they do not
            // prove which service is behind without a third authoritative main-HEAD value. Stay honest.
            const be = health.data?.version;
            if (!be || be === "—" || __APP_VERSION__ === "dev") return <Pill tone="neutral">—</Pill>;
            const inSync = be === __APP_VERSION__;
            return <Pill tone={inSync ? "ok" : "off"}>{inSync ? "IN SYNC" : "DEPLOY MISMATCH"}</Pill>;
          })()}
        </Row>
        <Row label="Service health">
          {health.data ? <Pill tone={healthGreen ? "ok" : "off"}>{healthGreen ? "GREEN" : "RED"}</Pill> : <Pill tone="neutral">—</Pill>}
        </Row>
      </Card>

      {/* Ledger Health */}
      <Card
        title="Ledger Health"
        pill={
          lhOpen == null ? (
            <Pill tone="neutral">—</Pill>
          ) : lhCritical && lhCritical > 0 ? (
            <Pill tone="off">{lhCritical} CRITICAL</Pill>
          ) : lhOpen > 0 ? (
            <Pill tone="warn">{lhOpen} OPEN</Pill>
          ) : (
            <Pill tone="ok">CLEAN</Pill>
          )
        }
        sub="Cross-integration reconciliation findings (QBO, Samsara, Plaid, FMCSA). Read-only — findings self-close on re-detection; there is no manual resolve action here."
        footer={<GhostButton onClick={() => onOpen("ledger-health")}>Open Ledger Health</GhostButton>}
      >
        <Row label="Open findings">{lhOpen == null ? "—" : <span className="tabular-nums">{lhOpen}</span>}</Row>
        <Row label="Critical">{lhCritical == null ? "—" : <span className="tabular-nums">{lhCritical}</span>}</Row>
        <Row label="Integrations monitored">{ledgerHealth.data?.by_integration?.length ?? "—"}</Row>
      </Card>

      {/* Claude Coder */}
      <Card title="Claude Coder" pill={<Pill tone="neutral">OWNER ONLY</Pill>} sub="Launch Claude Code on your machine (no terminal runs inside this app) plus a read-only activity view." full
        footer={<GhostButton onClick={() => onOpen("claude-coder")}>Open Claude Coder</GhostButton>}>
        <div className="text-[12px] text-slate-500">
          Safe launcher + read-only build/agent mirror. No command execution occurs inside the production app (auditor/DOT-safe).
        </div>
      </Card>
    </div>
  );
}

function QboReconTab({ data }: { data: SystemData }) {
  const { recon } = data;
  const apObj = findApObject(recon.data);
  const entities = recon.data?.objects?.map((o) => o.label).join(" · ");
  const columns: ParityColumn<ReconObject>[] = [
    { key: "label", label: "Object", sortable: true },
    { key: "tms_count", label: "TMS", sortable: true, className: "text-right", cellClass: "text-right tabular-nums" },
    {
      key: "qbo_count",
      label: "QBO",
      sortable: true,
      className: "text-right",
      cellClass: "text-right tabular-nums",
      sortValue: (row) => row.qbo_remote_count ?? row.qbo_mirror_count,
      render: (row) => row.qbo_remote_count ?? row.qbo_mirror_count,
    },
    {
      key: "count_in_sync",
      label: "In sync",
      sortable: true,
      sortValue: (row) => (row.count_in_sync ? 1 : 0),
      render: (row) => row.count_in_sync ? <Pill tone="ok">YES</Pill> : <Pill tone="warn">NO</Pill>,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card
        title="QuickBooks Reconciliation"
        pill={<Pill tone="neutral">TMS ↔ QBO</Pill>}
        sub="Daily tie-out of what the TMS posted against QuickBooks (system-of-record). This is not bank reconciliation — bank statement matching stays in Banking; the two are never combined in one table."
        footer={
          <Link to="/banking" className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f2a44] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#0f1729]">
            Open bank reconciliation
          </Link>
        }
      >
        <Row label="Last tie-out run">{ctDateTime(recon.data?.sync_state.last_successful_tick_at)}</Row>
        <Row label="Last run status">{recon.data?.sync_state.last_run_status ?? "—"}</Row>
        <Row label="Entities reconciled">{entities || (recon.isError ? "recon module not enabled" : "—")}</Row>
        <Row label="A/P tie-out (QBO vs TMS)">
          {apObj ? (
            apObj.balance?.in_sync ? <Pill tone="ok">IN SYNC</Pill> : <Pill tone="off">DRIFT {fmtUsd(apObj.balance?.delta_cents)}</Pill>
          ) : (
            <Pill tone="off">PENDING PULL</Pill>
          )}
        </Row>
        <Row label="Unresolved reconciliation alerts">
          {recon.data ? <Pill tone={recon.data.open_findings_count > 0 ? "warn" : "ok"}>{recon.data.open_findings_count}</Pill> : <Pill tone="neutral">—</Pill>}
        </Row>
      </Card>

      <Card title="Reconciled objects" sub="Per-object TMS vs QBO counts and balances (live).">
        <ParityTable<ReconObject>
          columns={columns}
          rows={recon.data?.objects ?? []}
          rowKey={(row) => row.object}
          storageKey="system-qbo-reconciled-objects"
          emptyText={recon.isError ? "Reconciliation unavailable." : recon.isLoading ? "Loading reconciliation…" : "No reconciled objects found."}
        />
      </Card>
    </div>
  );
}

/**
 * LEDGER-HEALTH tab — read-only. No resolve/close/acknowledge control exists anywhere on this page by
 * design: findings self-close when the detector/cron re-checks and the underlying drift clears. See
 * apps/backend/src/system/ledger-health-reads.ts's header and scripts/verify-ledger-health-no-human-resolve.mjs.
 */
function LedgerHealthTab({ data }: { data: SystemData }) {
  const { ledgerHealth } = data;
  const lh = ledgerHealth.data;
  const columns: ParityColumn<LedgerHealthFinding>[] = [
    { key: "integration", label: "Integration", sortable: true },
    { key: "finding_type", label: "Type", sortable: true },
    { key: "mirror_category", label: "Category", sortable: true },
    {
      key: "severity",
      label: "Severity",
      sortable: true,
      render: (row) =>
        row.severity === "critical" ? (
          <Pill tone="off">CRITICAL</Pill>
        ) : row.severity === "important" ? (
          <Pill tone="warn">IMPORTANT</Pill>
        ) : (
          <Pill tone="neutral">CLEANUP</Pill>
        ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => (row.status === "open" ? <Pill tone="warn">OPEN</Pill> : <Pill tone="ok">{row.status.toUpperCase()}</Pill>),
    },
    {
      key: "drift_metric_abs",
      label: "Drift",
      sortable: true,
      className: "text-right",
      cellClass: "text-right tabular-nums",
      render: (row) => (row.drift_metric_abs == null ? "—" : row.drift_metric_abs.toLocaleString("en-US")),
    },
    { key: "detected_at", label: "Detected", sortable: true, render: (row) => ctDateTime(row.detected_at) },
    { key: "last_seen_at", label: "Last seen", sortable: true, render: (row) => ctDateTime(row.last_seen_at) },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card
        title="Ledger Health"
        pill={<Pill tone="neutral">SELF-CLOSE ONLY</Pill>}
        sub="Every open reconciliation finding across every integration — QBO, Samsara, Plaid, FMCSA today; any future integration appears automatically. Display-only: a finding clears when the detector re-checks and the drift is gone, never by a click here."
      >
        <Row label="Open findings">{lh ? <span className="tabular-nums">{lh.open_findings_count}</span> : "—"}</Row>
        <Row label="Critical">{lh ? <span className="tabular-nums">{lh.critical_open_count}</span> : "—"}</Row>
        <Row label="Important">{lh ? <span className="tabular-nums">{lh.important_open_count}</span> : "—"}</Row>
        <Row label="Cleanup">{lh ? <span className="tabular-nums">{lh.cleanup_open_count}</span> : "—"}</Row>
        <Row label="Generated">{ctDateTime(lh?.generated_at)}</Row>
      </Card>

      <Card title="By integration" sub="Last successful reconciliation tick per integration.">
        {(lh?.by_integration ?? []).length === 0 ? (
          <div className="text-[12px] text-slate-500">{ledgerHealth.isLoading ? "Loading…" : "No integration state recorded yet."}</div>
        ) : (
          (lh?.by_integration ?? []).map((row) => (
            <Row
              key={row.integration}
              label={
                <span className="inline-flex items-center gap-2">
                  {row.integration}
                  {row.critical_open_count > 0 ? <Pill tone="off">{row.critical_open_count} critical</Pill> : null}
                </span>
              }
            >
              {row.open_count} open · last tick {ctDateTime(row.last_successful_tick_at)}
            </Row>
          ))
        )}
      </Card>

      <Card title="Findings" full sub="Newest first, open first. Read-only.">
        <ParityTable<LedgerHealthFinding>
          columns={columns}
          rows={lh?.findings ?? []}
          rowKey={(row) => row.id}
          storageKey="system-ledger-health-findings"
          emptyText={ledgerHealth.isError ? "Ledger health unavailable." : ledgerHealth.isLoading ? "Loading findings…" : "No findings — clean."}
        />
      </Card>
    </div>
  );
}

/**
 * TRANSACTIONS tab (TXH-01 / SYS-F-TRANSACTION-HEALTH-REGISTER) — read-only. Every TMS-native
 * document (invoice, bill, bill_payment, customer_payment, expense, journal_entry, factoring_batch,
 * settlement), joined at read time to its own posting/balance/linkage/sample-consistency status —
 * never stored (no health_status column, no migration; see transaction-health.service.ts header). No
 * resolve/close/acknowledge control exists here, matching Ledger Health's self-close-only shape: a row
 * clears when the underlying document is actually fixed, never by a click on this page.
 *
 * Self-contained data fetch (own useQuery + local filter/pagination state) rather than folding into
 * useSystemData — this tab's filters (entity, issues-only) and cursor pagination are its own concern.
 */
function TxCheckPill({ value }: { value: boolean | null }) {
  if (value === null) return <Pill tone="neutral">N/A</Pill>;
  return value ? <Pill tone="ok">OK</Pill> : <Pill tone="off">FAIL</Pill>;
}

function TransactionHealthTab() {
  const navigate = useNavigate();
  const [issuesOnly, setIssuesOnly] = useState(true);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]); // empty = every active entity
  const [cursor, setCursor] = useState<string | null>(null);
  const [rows, setRows] = useState<TxHealthRow[]>([]);
  const [entities, setEntities] = useState<TxHealthResponse["entities"]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const query = useQuery<TxHealthResponse>({
    queryKey: ["system", "tx-health", issuesOnly, selectedEntityIds, cursor],
    queryFn: () => getTransactionHealth({ issuesOnly, operatingCompanyIds: selectedEntityIds, cursor, limit: 100 }),
    retry: false,
    staleTime: 15_000,
  });

  // A genuine filter change (not a "Load more" cursor bump) restarts the page from the top.
  useEffect(() => {
    setCursor(null);
    setRows([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuesOnly, selectedEntityIds.join(",")]);

  useEffect(() => {
    if (!query.data) return;
    setEntities(query.data.entities);
    setGeneratedAt(query.data.generated_at);
    setRows((prev) => (cursor ? [...prev, ...query.data.rows] : query.data.rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const toggleEntity = (id: string) => {
    setSelectedEntityIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const failCount = rows.filter((r) => r.status === "FAIL").length;
  const warnCount = rows.filter((r) => r.status === "WARN").length;

  const columns: ParityColumn<TxHealthRow>[] = [
    { key: "doc_type", label: "Type", sortable: true, render: (row) => row.doc_type.replace(/_/g, " ") },
    { key: "entity_code", label: "Entity", sortable: true },
    { key: "display_label", label: "Document", sortable: true },
    { key: "event_at", label: "Date", sortable: true, render: (row) => ctDateTime(row.event_at) },
    { key: "posted", label: "Posted", render: (row) => <TxCheckPill value={row.checks.posted} /> },
    { key: "balanced", label: "Balanced", render: (row) => <TxCheckPill value={row.checks.balanced} /> },
    { key: "linked", label: "Linked", render: (row) => <TxCheckPill value={row.checks.linked} /> },
    {
      key: "sample_consistent",
      label: "Sample",
      render: (row) => <TxCheckPill value={row.checks.sample_consistent} />,
    },
    {
      key: "findings",
      label: "Findings",
      render: (row) => (row.findings.length === 0 ? "—" : <Pill tone="warn">{row.findings.length}</Pill>),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => (
        <Pill tone={row.status === "OK" ? "ok" : row.status === "WARN" ? "warn" : "off"}>{row.status}</Pill>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card
        title="Transaction Health"
        pill={<Pill tone="neutral">READ-ONLY</Pill>}
        sub="Every TMS-native document — invoice, bill, bill payment, customer payment, expense, journal entry, factoring batch, settlement — with posted/balanced/linked/sample-consistency computed at read time. Nothing here is stored; a row clears when the underlying document is actually fixed, never by a click."
      >
        <Row label="Failing">
          <span className="tabular-nums">{failCount}</span>
        </Row>
        <Row label="Warnings">
          <span className="tabular-nums">{warnCount}</span>
        </Row>
        <Row label="Loaded rows">
          <span className="tabular-nums">{rows.length}</span>
        </Row>
        <Row label="Generated">{ctDateTime(generatedAt)}</Row>
      </Card>

      <Card title="Filters" sub="Entity defaults to every active company (not USMCA-only).">
        <label className="flex items-center gap-2 border-t border-gray-200 py-[7px] text-[12px] first:border-t-0">
          <input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
          <span className="text-slate-600">Show only issues (WARN/FAIL)</span>
        </label>
        {entities.length > 0 ? (
          <div className="flex flex-wrap gap-3 border-t border-gray-200 py-[7px] text-[12px]">
            {entities.map((e) => (
              <label key={e.id} className="flex items-center gap-1.5 text-slate-600">
                <input
                  type="checkbox"
                  checked={selectedEntityIds.length === 0 || selectedEntityIds.includes(e.id)}
                  onChange={() => toggleEntity(e.id)}
                />
                {e.code}
              </label>
            ))}
          </div>
        ) : null}
      </Card>

      <Card title="Documents" full sub="Row click opens the document's own existing detail page — there is no separate detail view here.">
        <ParityTable<TxHealthRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.doc_type}:${row.id}`}
          storageKey="system-tx-health-documents"
          onRowClick={(row) => navigate(txHealthDocumentPath(row))}
          emptyText={
            query.isError
              ? "Transaction health unavailable."
              : query.isLoading && rows.length === 0
              ? "Loading documents…"
              : issuesOnly
              ? "No open issues — every document checked is OK."
              : "No documents found."
          }
        />
        {query.data?.next_cursor ? (
          <div className="mt-3">
            <GhostButton onClick={() => setCursor(query.data?.next_cursor ?? null)}>
              {query.isFetching ? "Loading…" : "Load more"}
            </GhostButton>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function QboSyncTab({ data }: { data: SystemData }) {
  const { syncHealth, apAging, recon } = data;
  const apObj = findApObject(recon.data);
  const status = syncHealth.data?.status;
  const connected = status === "healthy" || status === "syncing";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card
        title="QuickBooks Sync"
        pill={syncHealth.isError
          ? <Pill tone="off">UNAVAILABLE</Pill>
          : syncHealth.data
            ? <Pill tone={connected ? "ok" : "warn"}>{connected ? "CONNECTED" : String(status ?? "UNKNOWN").toUpperCase()}</Pill>
            : <Pill tone="neutral">CHECKING</Pill>}
        sub="IH 35 Transportation · pull-only, no write-back."
      >
        {syncHealth.isError ? (
          <p className="mb-2 text-[12px] font-semibold text-red-700" role="alert">Could not load QuickBooks sync health.</p>
        ) : null}
        <Kpi n={fmtUsd(apObj?.balance?.qbo_cents)} u={`QBO A/P${apAging.data ? ` · ${apAging.data.vendors.length} vendors` : ""}`} />
        <Row label="Last successful sync">{ctDateTime(syncHealth.data?.last_successful_sync_at)}</Row>
        <Row label="Pending / errors">
          <span className="tabular-nums">{syncHealth.data ? `${syncHealth.data.pending_count} / ${syncHealth.data.error_count}` : "—"}</span>
        </Row>
        {syncHealth.data?.needs_reconnect ? (
          <Row label="Connection">
            <Pill tone="off">RECONNECT NEEDED{syncHealth.data.reconnect_reason ? ` — ${syncHealth.data.reconnect_reason}` : ""}</Pill>
          </Row>
        ) : null}
        <Row label="Pulled into TMS (accounting.bills)">{fmtUsd(apAging.data?.totals.total_open_cents)}</Row>
        <Row label="QBO write-back">
          <Pill tone="ok">OFF (by design)</Pill>
        </Row>
      </Card>

      <Card title="Notes" sub="How this connection behaves.">
        <div className="space-y-2 text-[12px] text-slate-600">
          <p>QuickBooks is the system-of-record. The TMS pulls A/P (into <span className="font-mono">accounting.bills</span>) and never writes back to QuickBooks — write-back is OFF by design.</p>
          <p>The QBO A/P figure and vendor count above are read live via the QBO reconciliation + A/P aging endpoints. If a value shows "—", the relevant pull/flag is not yet enabled for this entity.</p>
          <p className="text-slate-500">Realm identifier and the A/P daily-pull flag state are owner/admin settings surfaced under Users → QBO Vendor Linkage and the feature-flags admin — not duplicated here.</p>
        </div>
      </Card>
    </div>
  );
}

function ProgramTab({ data }: { data: SystemData }) {
  const { tracker } = data;
  const t = tracker.data;
  type PhaseFilter = "all" | "has_open" | "complete";
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const staged = useStagedListFilters({
    applied: { phaseFilter },
    empty: { phaseFilter: "all" as PhaseFilter },
    onApply: (next) => setPhaseFilter(next.phaseFilter),
  });
  const phaseRows = useMemo(() => {
    const phases = t?.phases ?? [];
    if (phaseFilter === "all") return phases;
    if (phaseFilter === "complete") return phases.filter((p) => p.total > 0 && p.completed >= p.total);
    return phases.filter((p) => p.total === 0 || p.completed < p.total);
  }, [t?.phases, phaseFilter]);
  if (tracker.isError) {
    return (
      <ListErrorState
        title="Couldn't load the program tracker"
        status={0}
        message={(tracker.error as Error)?.message}
        onRetry={() => void tracker.refetch()}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card
        title="Program Tracker"
        sub="Live build status — derived from merges + deploys, not a static field. Full board opens in the Program Tracker module."
        footer={
          <Link to="/program/matrix" className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f2a44] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#0f1729]">
            Open Program Matrix
          </Link>
        }
      >
        <Row label="Active tracked blocks">{t ? <span className="tabular-nums">{activeTrackerCount(t)}</span> : <Pill tone="warn">LIVE COUNT PENDING</Pill>}</Row>
        <Row label="Built &amp; live-verified">{t ? <span className="tabular-nums">{t.view_counts.completed}</span> : "—"}</Row>
        <Row label="In progress (open PR)">{t ? <span className="tabular-nums">{t.view_counts.in_progress}</span> : "—"}</Row>
        <Row label="Pending">{t ? <span className="tabular-nums">{t.view_counts.pending}</span> : "—"}</Row>
        <Row label="Deployed">{t ? <span className="font-mono text-[11.5px]">{t.deployed_sha}</span> : "—"}</Row>
      </Card>

      <Card title="Phases" sub="Rollup by phase (from last reconcile sync).">
        <div className="space-y-2">
            <CollapsedListFilters
              activeFilterCount={phaseFilter === "all" ? 0 : 1}
              onApply={staged.apply}
              onReset={staged.reset}
              onCancel={staged.cancel}
              applyDisabled={!staged.dirty}
              testIdPrefix="system-program"
              dataAttributes={{ "data-system-program-filter-toolbar": "collapsed" }}
            >
              <label className="text-xs font-semibold text-slate-600">
                Phase progress
                <select
                  className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                  value={staged.draft.phaseFilter}
                  onChange={(event) =>
                    staged.setDraft({ phaseFilter: event.target.value as PhaseFilter })
                  }
                  data-testid="system-program-phase-filter"
                >
                  <option value="all">All phases</option>
                  <option value="has_open">Has open work</option>
                  <option value="complete">Complete</option>
                </select>
              </label>
            </CollapsedListFilters>
            <ParityTable<TrackerPhase>
              rows={phaseRows}
              rowKey={(p) => p.key}
              loading={!t && tracker.isLoading}
              emptyText="No phases match the applied filters."
              storageKey="system-program-phases"
              exportFilename="system-program-phases"
              tableTestId="system-program-phases-table"
              columns={[
                { key: "label", label: "Phase", render: (p) => <span className="text-slate-700">{p.label}</span> },
                {
                  key: "total",
                  label: "Total",
                  className: "text-right",
                  cellClass: "text-right tabular-nums text-slate-600",
                  render: (p) => p.total,
                },
                {
                  key: "completed",
                  label: "Done",
                  className: "text-right",
                  cellClass: "text-right tabular-nums text-slate-600",
                  render: (p) => p.completed,
                },
              ]}
            />
        </div>
      </Card>
    </div>
  );
}

function SoftwareTab({ data, qboAvailable }: { data: SystemData; qboAvailable: boolean }) {
  const { health } = data;
  const h = health.data;
  const byName = (n: string) => h?.checks.find((c) => c.name === n);
  const pgOk = byName("postgres.select1")?.ok;
  const migOk = byName("migrations.ledger")?.ok;
  const redisOk = byName("redis.ping")?.ok;
  const r2Ok = byName("r2.head_bucket")?.ok;
  const emailOk = byName("email.queue.depth")?.ok;
  const jobsOk = byName("background_jobs.stale")?.ok;
  const visibleChecks = (h?.checks ?? []).filter((check) => qboAvailable || !check.name.startsWith("qbo."));
  const trio = (a?: boolean, b?: boolean, c?: boolean) => a && b && c;
  if (health.isError) {
    return (
      <ListErrorState
        title="Couldn't load software and service health"
        status={0}
        message={(health.error as Error)?.message}
        onRetry={() => void health.refetch()}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card
        title="Software / Build"
        pill={h ? <Pill tone={h.ok ? "ok" : "off"}>{h.ok ? "HEALTHY" : "DEGRADED"}</Pill> : <Pill tone="neutral">CHECKING</Pill>}
        sub="Deployed version, migrations, and service health (live from /api/v1/healthz)."
      >
        <Row label="Deployed backend">
          <span className="font-mono text-[11.5px]">{h?.version ?? "—"}</span>
        </Row>
        <Row label="Matches main">
          {/* No client-side source for main's HEAD sha — verify drift via CI / deploy pipeline. */}
          <span className="text-slate-500">verify vs merge sha (CI)</span>
        </Row>
        <Row label="Postgres · Migrations · Redis">
          {h ? <Pill tone={trio(pgOk, migOk, redisOk) ? "ok" : "off"}>{trio(pgOk, migOk, redisOk) ? "GREEN" : "RED"}</Pill> : <Pill tone="neutral">—</Pill>}
        </Row>
        <Row label="Object store · Email · Jobs">
          {h ? <Pill tone={trio(r2Ok, emailOk, jobsOk) ? "ok" : "off"}>{trio(r2Ok, emailOk, jobsOk) ? "GREEN" : "RED"}</Pill> : <Pill tone="neutral">—</Pill>}
        </Row>
      </Card>

      <Card title="Service checks" sub="Deep health checks, live.">
        <ParityTable<{ name: string; ok: boolean; tier: "critical" | "warning" }>
            rows={visibleChecks}
            rowKey={(c) => c.name}
            loading={!h}
            emptyText="No health checks returned."
            storageKey="system-service-checks"
            exportFilename="system-service-checks"
            tableTestId="system-service-checks-table"
            columns={[
              {
                key: "name",
                label: "Check",
                render: (c) => <span className="font-mono text-[11px] text-slate-700">{c.name}</span>,
              },
              { key: "tier", label: "Tier", render: (c) => <span className="text-slate-500">{c.tier}</span> },
              {
                key: "ok",
                label: "Status",
                render: (c) => (c.ok ? <Pill tone="ok">OK</Pill> : <Pill tone="off">DOWN</Pill>),
              },
            ]}
        />
      </Card>
    </div>
  );
}

function ClaudeCoderTab({ data, qboAvailable }: { data: SystemData; qboAvailable: boolean }) {
  const { health, recon, tracker } = data;
  const { pushToast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const apObj = findApObject(recon.data);
  const recentMerged = tracker.data?.recent_merged ?? [];
  const copy = async (which: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        pushToast("Could not copy the launch command. Select the command text and copy it yourself.", "error");
        return;
      }
      await navigator.clipboard.writeText(LAUNCH_COMMAND);
      setCopied(which);
      pushToast("Copied. Paste it in your terminal — nothing runs here.", "success");
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      pushToast("Could not copy the launch command. Select the command text and copy it yourself.", "error");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card
        title="Claude Coder"
        pill={<Pill tone="neutral">OWNER ONLY</Pill>}
        sub="Launch Claude Code on your own machine (safe — no terminal runs inside this app), plus a read-only view of what the coder is doing."
        full
      >
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => copy("launch")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f2a44] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#0f1729]"
          >
            Launch Claude Code on my machine
          </button>
          <GhostButton onClick={() => copy("copy")}>Copy launch command</GhostButton>
          <span className="self-center font-mono text-[11.5px] text-slate-500">{LAUNCH_COMMAND}</span>
          {copied ? <span className="self-center text-[11px] text-[#065f46]">Copied — paste it in your terminal (nothing runs here).</span> : null}
        </div>

        <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">Build &amp; agent activity — read only</div>
        {tracker.isError ? (
          <ListErrorState
            title="Couldn't load build and agent activity"
            status={0}
            message={(tracker.error as Error)?.message}
            onRetry={() => void tracker.refetch()}
            className="py-4"
          />
        ) : (
        <ParityTable<{ number: number; title: string; mergedAt: string | null }>
          rows={recentMerged.slice(0, 8)}
          rowKey={(p) => String(p.number)}
          loading={tracker.isLoading && recentMerged.length === 0}
          emptyText="No recently merged PRs."
          storageKey="system-recent-merged-prs"
          exportFilename="system-recent-merged-prs"
          tableTestId="system-recent-merged-prs-table"
          columns={[
            {
              key: "number",
              label: "PR",
              render: (p) => (
                <a
                  href={`https://github.com/tioperfumes07/IH35-TMS/pull/${p.number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-slate-700 underline hover:text-[#1f2a44]"
                >
                  #{p.number}
                </a>
              ),
            },
            { key: "title", label: "Title", render: (p) => <span className="text-slate-700">{p.title}</span> },
            {
              key: "mergedAt",
              label: "Merged",
              render: (p) => <span className="text-slate-500">{ctDateTime(p.mergedAt)}</span>,
            },
          ]}
        />
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          Program Tracker reconciliation snapshot as of {ctDateTime(tracker.data?.recon_synced_at)}. This is not a
          live GitHub feed; it refreshes when a new reconciliation snapshot is published. The service-health mirror
          below remains live.
        </p>

        <div className="mt-3.5 overflow-auto rounded-[10px] bg-[#0f1729] px-4 py-3.5 font-mono text-[11.5px] leading-[1.7] text-[#cbd5e1]">
          <div><span className="text-slate-500"># read-only mirror of the coder lane — no execution happens in this app</span></div>
          <div>
            <span className="text-[#7dd3fc]">deploy</span> backend <span className="text-[#86efac]">{health.data?.version ?? "—"}</span>{" "}
            <span className="text-slate-500">(compare to main via CI)</span>
          </div>
          <div>
            <span className="text-[#7dd3fc]">health</span>{" "}
            {(["postgres.select1", "migrations.ledger", "redis.ping", "r2.head_bucket"] as const).map((n, i) => {
              const ok = health.data?.checks?.find((c) => c.name === n)?.ok;
              const short = n.split(".")[0];
              return (
                <span key={n}>
                  {i > 0 ? " · " : ""}
                  {short} <span className={ok ? "text-[#86efac]" : "text-[#dc2626]"}>{ok == null ? "—" : ok ? "ok" : "down"}</span>
                </span>
              );
            })}
          </div>
          {qboAvailable ? <div>
            <span className="text-[#7dd3fc]">qbo</span> A/P <span className="text-[#86efac]">{fmtUsd(apObj?.balance?.qbo_cents)}</span> → TMS{" "}
            <span className="text-slate-500">{apObj ? (apObj.balance?.in_sync ? "in sync" : "drift") : "pull pending"}</span>
          </div> : null}
        </div>
      </Card>
    </div>
  );
}

// ---- page shell -----------------------------------------------------------------------------------

export function SystemModulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  // TRANSP is the only QBO mirror entity. USMCA/TRK are TMS-native and must not render or query QBO.
  const qboAvailable = selectedCompany?.code === "TRANSP";
  const tab = parseSystemTab(searchParams.get("tab"), qboAvailable);
  const setTab = (next: SystemTabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  useEffect(() => {
    const requested = searchParams.get("tab");
    if (requested && parseSystemTab(requested, qboAvailable) === "overview" && requested !== "overview") {
      const params = new URLSearchParams(searchParams);
      params.delete("tab");
      setSearchParams(params, { replace: true });
    }
  }, [qboAvailable, searchParams, setSearchParams]);

  const visibleTabs = SYSTEM_TABS.filter((candidate) => qboAvailable || !QBO_SYSTEM_TAB_IDS.has(candidate.id));
  const data = useSystemData(selectedCompanyId, qboAvailable);

  return (
    <div className="space-y-3">
      <PageHeader breadcrumb={["Home", "System"]} backHref="/home" title="SYSTEM" subtitle="Owner-only" />
      <SecondaryNavTabs tabs={visibleTabs.map((t) => ({ id: t.id, label: t.label }))} activeId={tab} onChange={(id) => setTab(id as SystemTabId)} />

      <div className="pt-1">
        {tab === "overview" ? <OverviewTab data={data} onOpen={setTab} qboAvailable={qboAvailable} /> : null}
        {tab === "qbo-recon" ? <QboReconTab data={data} /> : null}
        {tab === "qbo-sync" ? <QboSyncTab data={data} /> : null}
        {tab === "program" ? <ProgramTab data={data} /> : null}
        {tab === "software" ? <SoftwareTab data={data} qboAvailable={qboAvailable} /> : null}
        {tab === "ledger-health" ? <LedgerHealthTab data={data} /> : null}
        {tab === "tx-health" ? <TransactionHealthTab /> : null}
        {tab === "claude-coder" ? <ClaudeCoderTab data={data} qboAvailable={qboAvailable} /> : null}
      </div>

      <div className="rounded-[10px] border border-gray-200 bg-[#eef2f7] px-3.5 py-3 text-[11.5px] text-slate-600">
        SYSTEM is Owner-only and is the single home for {qboAvailable ? "QuickBooks Reconciliation, QuickBooks Sync, Program Tracker, and Software/Build" : "Program Tracker and Software/Build"}. {qboAvailable ? "QuickBooks Reconciliation (TMS ↔ QBO tie-out) is deliberately separate from bank reconciliation, which stays in Banking — the two are never combined in one table. " : ""}The Claude Coder area is a launcher plus a read-only activity panel — no command execution occurs inside the production app (auditor/DOT-safe).
      </div>
    </div>
  );
}

export default SystemModulePage;
