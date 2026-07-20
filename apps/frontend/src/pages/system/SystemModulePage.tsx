import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { resolveApiUrl } from "../../api/client";
import { getQboReconciliation, type QboReconResponse } from "../../api/qbo-recon";
import { getQboSyncHealth, type QboSyncHealthResponse } from "../../api/qbo-integration";
import { getApAging, type ApAgingSummary } from "../../api/arApAging";
import { getProgramTracker, type ProgramTracker } from "../../api/program-tracker";

/**
 * SYSTEM — Owner-only module. Single home for QuickBooks Reconciliation (TMS↔QBO tie-out — NOT bank
 * reconciliation, which stays in Banking), QuickBooks Sync, Program Tracker, Software/Build health, and
 * Claude Coder (a read-only launcher; NO command execution happens in this app — auditor/DOT-safe).
 * Built field-for-field from the owner-supplied design mockup; palette + module-header law follow §7.
 *
 * NON-FINANCIAL: reads financial data (AP aging, QBO recon/sync health), posts nothing.
 */

// Canonical tab set — the guard (scripts/verify-system-module.mjs) asserts all six labels are present.
export const SYSTEM_TABS = [
  { id: "overview", label: "Overview" },
  { id: "qbo-recon", label: "QuickBooks Reconciliation" },
  { id: "qbo-sync", label: "QuickBooks Sync" },
  { id: "program", label: "Program Tracker" },
  { id: "software", label: "Software / Build" },
  { id: "claude-coder", label: "Claude Coder" },
] as const;

type SystemTabId = (typeof SYSTEM_TABS)[number]["id"];
const SYSTEM_TAB_IDS = new Set<string>(SYSTEM_TABS.map((t) => t.id));

export function parseSystemTab(raw: string | null): SystemTabId {
  if (raw && SYSTEM_TAB_IDS.has(raw)) return raw as SystemTabId;
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

function useSystemData(companyId: string | null) {
  const enabled = !!companyId;
  const asOf = new Date().toISOString().slice(0, 10);

  const recon = useQuery<QboReconResponse>({
    queryKey: ["system", "qbo-recon", companyId],
    queryFn: () => getQboReconciliation(companyId as string),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  const syncHealth = useQuery<QboSyncHealthResponse>({
    queryKey: ["system", "qbo-sync-health", companyId],
    queryFn: () => getQboSyncHealth(companyId as string),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  const apAging = useQuery<ApAgingSummary>({
    queryKey: ["system", "ap-aging", companyId, asOf],
    queryFn: () => getApAging(companyId as string, asOf),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  const tracker = useQuery<ProgramTracker>({
    queryKey: ["system", "program-tracker"],
    queryFn: getProgramTracker,
    retry: false,
    staleTime: 60_000,
  });
  const health = useQuery({
    queryKey: ["system", "healthz"],
    queryFn: fetchHealth,
    retry: false,
    staleTime: 30_000,
  });

  return { recon, syncHealth, apAging, tracker, health };
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

function OverviewTab({ data, onOpen }: { data: SystemData; onOpen: (id: SystemTabId) => void }) {
  const { recon, syncHealth, apAging, tracker, health } = data;
  const apObj = findApObject(recon.data);
  const reconAlerts = recon.data?.open_findings_count ?? null;
  const syncConnected = syncHealth.data?.status === "healthy" || syncHealth.data?.status === "syncing";
  const syncBroken = syncHealth.data?.status === "error" || syncHealth.data?.needs_reconnect === true;
  const apVendorCount = apAging.data?.vendors.length ?? null;
  const healthGreen = health.data?.ok === true;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* QuickBooks Reconciliation */}
      <Card
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
      </Card>

      {/* QuickBooks Sync */}
      <Card
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
      </Card>

      {/* Program Tracker */}
      <Card
        title="Program Tracker"
        sub="Live build status — derived from merges + deploys, not a static field."
        footer={<GhostButton onClick={() => onOpen("program")}>Open Program Tracker</GhostButton>}
      >
        <Row label="Registered blocks (live)">
          {tracker.data ? <span className="tabular-nums">{tracker.data.registered_total}</span> : <Pill tone="warn">LIVE COUNT PENDING</Pill>}
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
            // B-B: frontend is a separate Render static deploy that can lag the backend. Surface a stale
            // frontend here (previously invisible). Only compare when both are real shas.
            const be = health.data?.version;
            if (!be || be === "—" || __APP_VERSION__ === "dev") return <Pill tone="neutral">—</Pill>;
            const inSync = be === __APP_VERSION__;
            return <Pill tone={inSync ? "ok" : "off"}>{inSync ? "IN SYNC" : "FRONTEND STALE"}</Pill>;
          })()}
        </Row>
        <Row label="Service health">
          {health.data ? <Pill tone={healthGreen ? "ok" : "off"}>{healthGreen ? "GREEN" : "RED"}</Pill> : <Pill tone="neutral">—</Pill>}
        </Row>
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
  const entities = recon.data?.objects.map((o) => o.label).join(" · ");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card
        title="QuickBooks Reconciliation"
        pill={<Pill tone="neutral">TMS ↔ QBO</Pill>}
        sub="Daily tie-out of what the TMS posted against QuickBooks (system-of-record). This is not bank reconciliation — bank statement matching stays in Banking; the two are never combined in one table."
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
        {recon.data && recon.data.objects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="border-b border-gray-200 px-1.5 py-2 text-left">Object</th>
                  <th className="border-b border-gray-200 px-1.5 py-2 text-right">TMS</th>
                  <th className="border-b border-gray-200 px-1.5 py-2 text-right">QBO</th>
                  <th className="border-b border-gray-200 px-1.5 py-2 text-left">In sync</th>
                </tr>
              </thead>
              <tbody>
                {recon.data.objects.map((o) => (
                  <tr key={o.object}>
                    <td className="border-b border-gray-100 px-1.5 py-2 text-slate-700">{o.label}</td>
                    <td className="border-b border-gray-100 px-1.5 py-2 text-right tabular-nums text-slate-600">{o.tms_count}</td>
                    <td className="border-b border-gray-100 px-1.5 py-2 text-right tabular-nums text-slate-600">{o.qbo_remote_count ?? o.qbo_mirror_count}</td>
                    <td className="border-b border-gray-100 px-1.5 py-2">{o.count_in_sync ? <Pill tone="ok">YES</Pill> : <Pill tone="warn">NO</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[12px] text-slate-500">{recon.isError ? "Reconciliation module not enabled (TMS_QBO_RECON_UI_ENABLED OFF)." : "Loading…"}</p>
        )}
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
        pill={syncHealth.data ? <Pill tone={connected ? "ok" : "warn"}>{connected ? "CONNECTED" : String(status ?? "UNKNOWN").toUpperCase()}</Pill> : <Pill tone="neutral">CHECKING</Pill>}
        sub="IH 35 Transportation · pull-only, no write-back."
      >
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
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card
        title="Program Tracker"
        sub="Live build status — derived from merges + deploys, not a static field. Full board opens in the Program Tracker module."
        footer={
          <Link to="/program" className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f2a44] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#0f1729]">
            Open full Program Tracker
          </Link>
        }
      >
        <Row label="Registered blocks (live)">{t ? <span className="tabular-nums">{t.registered_total}</span> : <Pill tone="warn">LIVE COUNT PENDING</Pill>}</Row>
        <Row label="Built &amp; live-verified">{t ? <span className="tabular-nums">{t.view_counts.completed}</span> : "—"}</Row>
        <Row label="In progress (open PR)">{t ? <span className="tabular-nums">{t.view_counts.in_progress}</span> : "—"}</Row>
        <Row label="Pending">{t ? <span className="tabular-nums">{t.view_counts.pending}</span> : "—"}</Row>
        <Row label="Deployed">{t ? <span className="font-mono text-[11.5px]">{t.deployed_sha}</span> : "—"}</Row>
      </Card>

      <Card title="Phases" sub="Rollup by phase (from last reconcile sync).">
        {t && t.phases.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="border-b border-gray-200 px-1.5 py-2 text-left">Phase</th>
                  <th className="border-b border-gray-200 px-1.5 py-2 text-right">Total</th>
                  <th className="border-b border-gray-200 px-1.5 py-2 text-right">Done</th>
                </tr>
              </thead>
              <tbody>
                {t.phases.map((p) => (
                  <tr key={p.key}>
                    <td className="border-b border-gray-100 px-1.5 py-2 text-slate-700">{p.label}</td>
                    <td className="border-b border-gray-100 px-1.5 py-2 text-right tabular-nums text-slate-600">{p.total}</td>
                    <td className="border-b border-gray-100 px-1.5 py-2 text-right tabular-nums text-slate-600">{p.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[12px] text-slate-500">{tracker.isError ? "Tracker unavailable." : "Loading…"}</p>
        )}
      </Card>
    </div>
  );
}

function SoftwareTab({ data }: { data: SystemData }) {
  const { health } = data;
  const h = health.data;
  const byName = (n: string) => h?.checks.find((c) => c.name === n);
  const pgOk = byName("postgres.select1")?.ok;
  const migOk = byName("migrations.ledger")?.ok;
  const redisOk = byName("redis.ping")?.ok;
  const r2Ok = byName("r2.head_bucket")?.ok;
  const emailOk = byName("email.queue.depth")?.ok;
  const jobsOk = byName("background_jobs.stale")?.ok;
  const trio = (a?: boolean, b?: boolean, c?: boolean) => a && b && c;
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
        {h && h.checks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="border-b border-gray-200 px-1.5 py-2 text-left">Check</th>
                  <th className="border-b border-gray-200 px-1.5 py-2 text-left">Tier</th>
                  <th className="border-b border-gray-200 px-1.5 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {h.checks.map((c) => (
                  <tr key={c.name}>
                    <td className="border-b border-gray-100 px-1.5 py-2 font-mono text-[11px] text-slate-700">{c.name}</td>
                    <td className="border-b border-gray-100 px-1.5 py-2 text-slate-500">{c.tier}</td>
                    <td className="border-b border-gray-100 px-1.5 py-2">{c.ok ? <Pill tone="ok">OK</Pill> : <Pill tone="off">DOWN</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[12px] text-slate-500">{health.isError ? "Health endpoint unreachable." : "Loading…"}</p>
        )}
      </Card>
    </div>
  );
}

function ClaudeCoderTab({ data }: { data: SystemData }) {
  const { health, recon, tracker } = data;
  const [copied, setCopied] = useState<string | null>(null);
  const apObj = findApObject(recon.data);
  const recentMerged = tracker.data?.recent_merged ?? [];
  const copy = (which: string) => {
    void navigator.clipboard?.writeText(LAUNCH_COMMAND).catch(() => undefined);
    setCopied(which);
    window.setTimeout(() => setCopied(null), 2500);
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="border-b border-gray-200 px-1.5 py-2 text-left">PR</th>
                <th className="border-b border-gray-200 px-1.5 py-2 text-left">Title</th>
                <th className="border-b border-gray-200 px-1.5 py-2 text-left">Merged</th>
              </tr>
            </thead>
            <tbody>
              {recentMerged.slice(0, 8).map((p) => (
                <tr key={p.number}>
                  <td className="border-b border-gray-100 px-1.5 py-2 font-semibold">
                    <a
                      href={`https://github.com/tioperfumes07/IH35-TMS/pull/${p.number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-700 underline hover:text-[#1f2a44]"
                    >
                      #{p.number}
                    </a>
                  </td>
                  <td className="border-b border-gray-100 px-1.5 py-2 text-slate-700">{p.title}</td>
                  <td className="border-b border-gray-100 px-1.5 py-2 text-slate-500">{ctDateTime(p.mergedAt)}</td>
                </tr>
              ))}
              {recentMerged.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-1.5 py-4 text-center text-slate-400">
                    {tracker.isError ? "Tracker unavailable." : tracker.isLoading ? "Loading…" : "No recently merged PRs."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Live feed of the most recently merged PRs (from the Program Tracker's GitHub sync); the terminal mirror below injects live health/QBO values.
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
              const ok = health.data?.checks.find((c) => c.name === n)?.ok;
              const short = n.split(".")[0];
              return (
                <span key={n}>
                  {i > 0 ? " · " : ""}
                  {short} <span className={ok ? "text-[#86efac]" : "text-[#dc2626]"}>{ok == null ? "—" : ok ? "ok" : "down"}</span>
                </span>
              );
            })}
          </div>
          <div>
            <span className="text-[#7dd3fc]">qbo</span> A/P <span className="text-[#86efac]">{fmtUsd(apObj?.balance?.qbo_cents)}</span> → TMS{" "}
            <span className="text-slate-500">{apObj ? (apObj.balance?.in_sync ? "in sync" : "drift") : "pull pending"}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---- page shell -----------------------------------------------------------------------------------

export function SystemModulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseSystemTab(searchParams.get("tab"));
  const setTab = (next: SystemTabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const { selectedCompanyId } = useCompanyContext();
  const data = useSystemData(selectedCompanyId);

  return (
    <div className="space-y-3">
      <PageHeader breadcrumb={["Home", "System"]} backHref="/home" title="SYSTEM" subtitle="Owner-only" />
      <SecondaryNavTabs tabs={SYSTEM_TABS.map((t) => ({ id: t.id, label: t.label }))} activeId={tab} onChange={(id) => setTab(id as SystemTabId)} />

      <div className="pt-1">
        {tab === "overview" ? <OverviewTab data={data} onOpen={setTab} /> : null}
        {tab === "qbo-recon" ? <QboReconTab data={data} /> : null}
        {tab === "qbo-sync" ? <QboSyncTab data={data} /> : null}
        {tab === "program" ? <ProgramTab data={data} /> : null}
        {tab === "software" ? <SoftwareTab data={data} /> : null}
        {tab === "claude-coder" ? <ClaudeCoderTab data={data} /> : null}
      </div>

      <div className="rounded-[10px] border border-gray-200 bg-[#eef2f7] px-3.5 py-3 text-[11.5px] text-slate-600">
        SYSTEM is Owner-only and is the single home for QuickBooks Reconciliation, QuickBooks Sync, Program Tracker, and Software/Build. QuickBooks Reconciliation (TMS ↔ QBO tie-out) is deliberately separate from bank reconciliation, which stays in Banking — the two are never combined in one table. The Claude Coder area is a launcher plus a read-only activity panel — no command execution occurs inside the production app (auditor/DOT-safe).
      </div>
    </div>
  );
}

export default SystemModulePage;
