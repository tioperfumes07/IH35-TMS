/**
 * Module matrix scoreboard — owner-approved layout (2026-08-08).
 * Box 1 Required: docs/specs/scoreboard/modules/<module>.required.json
 * Boxes 2–3 Audited/Done: GET /api/v1/program/module-matrix (MATRIX-LIVE-RAD)
 * Chrome/picker/wiring columns are Required law (owner 2026-08-08) — part of full linkage.
 * Explicit unavailable banner only when the live API is unavailable; never sample cells.
 * Design lock: docs/specs/scoreboard/MODULE-MATRIX-SCOREBOARD-LOCKED.md
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import {
  GroupRollupTable,
  MatrixBoxTracker,
  MatrixCell4,
  pctClass,
  type GroupRollup,
  type TierMetrics,
} from "./moduleMatrixBoxes";
import maintRequired from "@scoreboard/modules/maintenance.required.json";
import safetyRequired from "@scoreboard/modules/safety.required.json";
import insuranceRequired from "@scoreboard/modules/insurance.required.json";
import legalRequired from "@scoreboard/modules/legal.required.json";
import accountingRequired from "@scoreboard/modules/accounting.required.json";
import bankingRequired from "@scoreboard/modules/banking.required.json";
import dispatchRequired from "@scoreboard/modules/dispatch.required.json";
import settlementsRequired from "@scoreboard/modules/settlements.required.json";
import fuelRequired from "@scoreboard/modules/fuel.required.json";
import driversRequired from "@scoreboard/modules/drivers.required.json";
import fleetRequired from "@scoreboard/modules/fleet.required.json";
import customersRequired from "@scoreboard/modules/customers.required.json";
import vendorsRequired from "@scoreboard/modules/vendors.required.json";
import listsRequired from "@scoreboard/modules/lists.required.json";
import factoringRequired from "@scoreboard/modules/factoring.required.json";
import reportsRequired from "@scoreboard/modules/reports.required.json";
import inventoryRequired from "@scoreboard/modules/inventory.required.json";
import complianceRequired from "@scoreboard/modules/compliance.required.json";
import cashFlowRequired from "@scoreboard/modules/cash-flow.required.json";
import homeRequired from "@scoreboard/modules/home.required.json";
import programRequired from "@scoreboard/modules/program.required.json";
import tasksRequired from "@scoreboard/modules/tasks.required.json";
import form425Required from "@scoreboard/modules/form_425.required.json";
import financeRequired from "@scoreboard/modules/finance.required.json";
import docsRequired from "@scoreboard/modules/docs.required.json";
import systemRequired from "@scoreboard/modules/system.required.json";
import usersRequired from "@scoreboard/modules/users.required.json";
import helpRequired from "@scoreboard/modules/help.required.json";
import driverHubRequired from "@scoreboard/modules/driver-hub.required.json";
import { ProgramModuleNav } from "./ProgramModuleNav";
import { ModuleMatrixSystemView } from "./ModuleMatrixSystemView";
import {
  MATRIX_MODULES_SIDEBAR_ORDER,
  matrixColumnHeaderLabel,
  matrixGroupHeaderLabel,
  matrixModuleLabel,
  parseMatrixModule,
  type MatrixModuleId,
} from "./moduleMatrixCatalog";

type Tri = "done" | "audited" | "unaudited" | "na";

type RequiredColumn = {
  id: string;
  group: string;
  label: string;
};

type RequiredLeaf = {
  id: string;
  tab: string;
  sub?: string;
  route_hint: string;
  required: string[];
};

type RequiredMap = {
  module: string;
  entity_default: string;
  columns: RequiredColumn[];
  leaves: RequiredLeaf[];
};

type LiveCell = {
  state?: Tri | "built" | "live" | "done";
  audited?: boolean;
  built?: boolean;
  live?: boolean;
  done?: boolean;
};

type LiveMatrix = {
  sample: false;
  module?: string;
  entity_default?: string;
  leaves: Array<{ id: string; cells: Record<string, LiveCell> }>;
  groupRollups?: GroupRollup[];
  metrics?: TierMetrics;
  meta?: {
    honesty?: string;
    tipSha?: string;
    probeProgress?: number | null;
    reconAsOf?: string | null;
    feedNote?: string;
  };
};

const REQUIRED_BY_MODULE: Record<MatrixModuleId, RequiredMap> = {
  maintenance: maintRequired as RequiredMap,
  safety: safetyRequired as RequiredMap,
  insurance: insuranceRequired as RequiredMap,
  legal: legalRequired as RequiredMap,
  accounting: accountingRequired as RequiredMap,
  banking: bankingRequired as RequiredMap,
  dispatch: dispatchRequired as RequiredMap,
  settlements: settlementsRequired as RequiredMap,
  fuel: fuelRequired as RequiredMap,
  drivers: driversRequired as RequiredMap,
  fleet: fleetRequired as RequiredMap,
  customers: customersRequired as RequiredMap,
  vendors: vendorsRequired as RequiredMap,
  lists: listsRequired as RequiredMap,
  factoring: factoringRequired as RequiredMap,
  reports: reportsRequired as RequiredMap,
  inventory: inventoryRequired as RequiredMap,
  compliance: complianceRequired as RequiredMap,
  "cash-flow": cashFlowRequired as RequiredMap,
  home: homeRequired as RequiredMap,
  program: programRequired as RequiredMap,
  tasks: tasksRequired as RequiredMap,
  form_425: form425Required as RequiredMap,
  finance: financeRequired as RequiredMap,
  docs: docsRequired as RequiredMap,
  system: systemRequired as RequiredMap,
  users: usersRequired as RequiredMap,
  help: helpRequired as RequiredMap,
  "driver-hub": driverHubRequired as RequiredMap,
};

const MATRIX_POLL_MS = 3000;
const SCOREBOARD_POLL_MS = 3000;

type MatrixRecentPr = {
  number: number;
  title: string;
  state?: string;
  mergedAtCt: string;
  url: string;
};

function formatCtStamp(iso: string | number | Date | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = typeof iso === "number" || iso instanceof Date ? new Date(iso) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")} ${get("dayPeriod")} CT`;
}

async function fetchMatrixRecentMerged(): Promise<{
  items: MatrixRecentPr[];
  source?: "git_log" | "github" | "ledger_committed";
}> {
  // MATRIX-INFINITE-PENDING-FEED: a hung /api fetch (no client-side timeout) left this query's
  // promise permanently unsettled — React Query's retry/error handling only runs on a REJECTED
  // promise, so a stalled connection never surfaced the "unavailable" banner the design doc
  // promises; the board just sat on "PENDING FEED" forever with zero indication anything was
  // wrong. Same class as LV-COMPLIANCE-FLEET-HOS-DRIVER-DETAIL-INFINITE-LOADING (apps/frontend/src
  // /api/mdata.ts getDriver) — bound the read with AbortSignal.timeout so a stall always resolves
  // to a real rejection.
  const r = await fetch(resolveApiUrl("/api/v1/program/audit-scoreboard"), {
    credentials: "include",
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok || r.status === 204) return { items: [] };
  const json = (await r.json()) as {
    recentActivity?: MatrixRecentPr[];
    meta?: { recentActivitySource?: "git_log" | "github" | "ledger_committed" };
  };
  const items = Array.isArray(json.recentActivity) ? json.recentActivity.slice(0, 10) : [];
  return { items, source: json.meta?.recentActivitySource };
}

type Row =
  | { kind: "section"; label: string }
  | {
      kind: "leaf";
      leaf: RequiredLeaf;
      indent: 1 | 2;
      pct: number;
      cells: Array<{ req: boolean; audited: boolean; built: boolean; live: boolean }>;
    };

function cellBoxes(
  leafId: string,
  colId: string,
  required: Set<string>,
  liveByLeaf: Map<string, Record<string, LiveCell>> | null,
): { req: boolean; audited: boolean; built: boolean; live: boolean } {
  if (!required.has(colId)) {
    return { req: false, audited: false, built: false, live: false };
  }
  const live = liveByLeaf?.get(leafId)?.[colId];
  if (live?.live || live?.done || live?.state === "live" || live?.state === "done") {
    return { req: true, audited: true, built: true, live: true };
  }
  if (live?.built || live?.state === "built") {
    return { req: true, audited: true, built: true, live: false };
  }
  if (live?.audited || live?.state === "audited") {
    return { req: true, audited: true, built: false, live: false };
  }
  return { req: true, audited: false, built: false, live: false };
}

function leafPct(cells: Array<{ req: boolean; live: boolean }>): number {
  const owed = cells.filter((c) => c.req);
  if (owed.length === 0) return 0;
  const live = owed.filter((c) => c.live).length;
  return Math.round((live / owed.length) * 100);
}

/** Per-leaf wired / live / queue counts — matches system rollup Built | Live | Queue columns. */
function leafSummaryCounts(
  cells: Array<{ req: boolean; built: boolean; live: boolean }>,
): { built: number; live: number; queue: number } {
  let built = 0;
  let live = 0;
  let queue = 0;
  for (const st of cells) {
    if (!st.req) continue;
    if (st.live) {
      live += 1;
      built += 1;
    } else if (st.built) {
      built += 1;
    } else {
      queue += 1;
    }
  }
  return { built, live, queue };
}

function sectionForLeaf(moduleId: MatrixModuleId, leaf: RequiredLeaf): string {
  if (moduleId === "drivers") {
    if (leaf.id === "home") return "Drivers home";
    if (leaf.id.startsWith("profiles.")) return "Profiles";
    return leaf.tab || "Drivers";
  }
  if (moduleId === "settlements") {
    if (leaf.id.startsWith("settlements.")) return "Settlements";
    if (leaf.id === "settlement_close") return "Settlement Close";
    if (leaf.id === "cash_advances") return "Cash Advances";
    if (leaf.id === "pre_settlements") return "Pre-Settlements";
    return "Settlements";
  }
  if (moduleId === "fuel") {
    return leaf.tab || "Fuel";
  }
  if (moduleId === "factoring") {
    if (leaf.id.startsWith("home.")) return "Factoring home";
    if (leaf.id.startsWith("batches.") || leaf.id === "submit.queue") return "Batches & submission";
    if (leaf.id.startsWith("factors.") || leaf.id === "reserves.dashboard" || leaf.id === "faro.import") {
      return "Factor admin & reserves";
    }
    if (leaf.id.startsWith("accounting.")) return "Accounting hops";
    if (leaf.id === "banking.entry") return "Banking hop";
    if (leaf.id === "dispatch.queue") return "Dispatch queue";
    return "Factoring";
  }
  if (moduleId === "lists") {
    if (leaf.id.startsWith("hub.")) return "Lists hub";
    return leaf.tab || "Catalogs";
  }
  if (moduleId === "dispatch") {
    if (leaf.id === "load_board" || leaf.id === "load.detail") return "Load board";
    if (leaf.id === "book_load") return "Book load";
    if (leaf.id === "assignments") return "Assignments";
    if (leaf.id === "settlements" || leaf.id === "pre_settlements") return "Settlements";
    return "Dispatch";
  }
  if (moduleId === "banking") {
    if (leaf.id === "accounts") return "Accounts";
    if (leaf.id.startsWith("transactions.")) return "Transactions";
    if (leaf.id === "reconciliation") return "Reconciliation";
    if (leaf.id === "factoring" || leaf.id === "driver_escrow") return "Virtual banks";
    if (leaf.id === "relay_card") return "Cards";
    if (leaf.id === "reports" || leaf.id === "statement_import" || leaf.id === "plaid" || leaf.id === "settings") {
      return "Import / Settings / Reports";
    }
    return "Banking";
  }
  if (moduleId === "accounting") {
    if (leaf.id === "home") return "Accounting home";
    if (leaf.id.startsWith("bills.")) return "Bills";
    if (leaf.id.startsWith("expenses.")) return "Expenses";
    if (leaf.id.startsWith("bill_payments.") || leaf.id.startsWith("ap.")) return "Bill Payment / AP";
    if (leaf.id === "vendors" || leaf.id === "customers") return "Parties";
    if (leaf.id.startsWith("invoices.") || leaf.id.startsWith("payments.") || leaf.id === "collections") return "AR";
    if (leaf.id.startsWith("factoring.") || leaf.id === "escrow" || leaf.id === "pre_settlements") return "Factoring / settlements";
    if (leaf.id.startsWith("je.") || leaf.id === "register" || leaf.id === "transactions") return "Ledger";
    if (leaf.id.startsWith("coa") || leaf.id.includes("close") || leaf.id === "audit_trail" || leaf.id === "reports") {
      return "Period / CoA / Reports";
    }
    return "Accounting";
  }
  if (moduleId === "legal") {
    if (leaf.id === "landing") return "Legal home";
    if (leaf.id.startsWith("contracts.")) return "Contracts";
    if (leaf.id.startsWith("templates.")) return "Templates";
    if (leaf.id === "policies") return "Policies";
    if (leaf.id === "attorney_review") return "Attorney Review";
    if (leaf.id.startsWith("matters.")) return "Matters";
    if (leaf.id === "reports") return "Reports";
    return "Legal";
  }
  if (moduleId === "insurance") {
    if (leaf.id === "landing") return "Insurance home";
    if (leaf.id.startsWith("policies.")) return "Policies";
    if (leaf.id.startsWith("type_catalog.")) return "Type Catalog";
    if (leaf.id.startsWith("coverage_gaps")) return "Coverage Gaps";
    if (leaf.id.startsWith("claims.")) return "Claims";
    if (leaf.id.startsWith("lawsuits.")) return "Lawsuits";
    return "Insurance";
  }
  if (moduleId === "safety") {
    if (leaf.id.startsWith("driver_files") || leaf.id.startsWith("drug") || leaf.id.startsWith("safety_meet") || leaf.id.startsWith("training")) {
      return "Driver Files & Training";
    }
    if (leaf.id.startsWith("hos") || leaf.id.startsWith("eld")) return "Hours & Fatigue";
    if (leaf.id.startsWith("idvr") || leaf.id.startsWith("dot") || leaf.id.startsWith("driver_scoring") || leaf.id.startsWith("csa") || leaf.id.startsWith("cert")) {
      return "Inspections & FMCSA";
    }
    if (
      leaf.id.startsWith("accident") ||
      leaf.id.startsWith("damage") ||
      leaf.id.startsWith("cargo") ||
      leaf.id.startsWith("trailer") ||
      leaf.id.startsWith("safety_events") ||
      leaf.id.startsWith("photo")
    ) {
      return "Incidents & Claims";
    }
    if (leaf.id.includes("fine") || leaf.id.startsWith("complaint")) return "Fines & Discipline";
    if (leaf.id.startsWith("escrow")) return "Driver Financial Safety";
    if (leaf.id.startsWith("leave") || leaf.id.startsWith("driver_scheduler")) return "Workforce Planning";
    if (leaf.id.startsWith("settings")) return "Settings";
    return "Compliance Docs & Monitoring";
  }
  if (leaf.id.startsWith("wo.")) return "Work Orders";
  if (leaf.id.startsWith("pm.")) return "Preventive";
  if (
    leaf.id.startsWith("in_transit.") ||
    leaf.id.startsWith("arriving_soon.") ||
    leaf.id.startsWith("damage_") ||
    leaf.id.startsWith("driver_reports.") ||
    leaf.id.startsWith("severe_") ||
    leaf.id.startsWith("road_service.") ||
    leaf.id.startsWith("defects.") ||
    leaf.id.startsWith("pre_flight_")
  ) {
    return "Operational queues";
  }
  if (leaf.id.startsWith("parts_inventory.")) return "Parts Inventory";
  return "Master data / programs";
}

function buildRows(
  moduleId: MatrixModuleId,
  map: RequiredMap,
  liveByLeaf: Map<string, Record<string, LiveCell>> | null,
): Row[] {
  const rows: Row[] = [];
  let lastSection = "";
  // Hard fail closed: required maps must expose array leaves (never for-of a plain object).
  const requiredLeaves = Array.isArray(map?.leaves) ? map.leaves : [];
  for (const leaf of requiredLeaves) {
    const section = sectionForLeaf(moduleId, leaf);
    if (section !== lastSection) {
      rows.push({ kind: "section", label: section });
      lastSection = section;
    }
    const req = new Set(leaf.required);
    const cells = map.columns.map((c) => cellBoxes(leaf.id, c.id, req, liveByLeaf));
    const indent: 1 | 2 =
      leaf.id.startsWith("wo.source.") || leaf.id.endsWith(".create") ? 2 : 1;
    rows.push({
      kind: "leaf",
      leaf,
      indent,
      pct: leafPct(cells),
      cells,
    });
  }
  return rows;
}

function boardMetrics(map: RequiredMap, rows: Row[], live: LiveMatrix | null): TierMetrics {
  if (live?.metrics) {
    const m = live.metrics;
    return {
      ...m,
      modulePct: m.livePct ?? m.modulePct ?? 0,
      certifiedPct: m.certifiedPct ?? m.livePct ?? 0,
      doneCells: m.liveCells ?? m.doneCells ?? 0,
      builtPct: m.builtOnlyPct ?? m.builtPct ?? 0,
      auditedPct: m.auditedOnlyPct ?? m.auditedPct ?? 0,
      leafCount: m.leafCount || map.leaves.length,
      colCount: m.colCount || map.columns.length,
    };
  }
  let requiredCells = 0;
  let liveCells = 0;
  let builtOnlyCells = 0;
  let probeOnlyCells = 0;
  let auditedOnlyCells = 0;
  let unauditedCells = 0;
  for (const row of rows) {
    if (row.kind !== "leaf") continue;
    for (const st of row.cells) {
      if (!st.req) continue;
      requiredCells += 1;
      if (st.live) liveCells += 1;
      else if (st.built) builtOnlyCells += 1;
      else if (st.audited) auditedOnlyCells += 1;
      else unauditedCells += 1;
    }
  }
  const pct = (n: number) => (requiredCells === 0 ? 0 : Math.round((n / requiredCells) * 100));
  const livePct = pct(liveCells);
  return {
    requiredCells,
    liveCells,
    builtOnlyCells,
    probeOnlyCells,
    auditedOnlyCells,
    unauditedCells,
    builtCells: builtOnlyCells + liveCells,
    auditedCells: auditedOnlyCells + probeOnlyCells,
    buildQueue: requiredCells - liveCells,
    requiredPct: requiredCells === 0 ? 0 : 100,
    auditedOnlyPct: pct(auditedOnlyCells),
    probeOnlyPct: pct(probeOnlyCells),
    builtOnlyPct: pct(builtOnlyCells),
    livePct,
    certifiedPct: livePct,
    modulePct: livePct,
    leafCount: map.leaves.length,
    colCount: map.columns.length,
    doneCells: liveCells,
    builtPct: pct(builtOnlyCells),
    auditedPct: pct(auditedOnlyCells + probeOnlyCells),
  };
}

function titleCase(id: MatrixModuleId): string {
  return matrixModuleLabel(id);
}

async function fetchModuleMatrix(moduleId: MatrixModuleId): Promise<LiveMatrix | null> {
  // MATRIX-INFINITE-PENDING-FEED: see fetchMatrixRecentMerged's comment above — same missing-
  // timeout gap, same fix.
  const r = await fetch(
    resolveApiUrl(`/api/v1/program/module-matrix?module=${moduleId}`),
    { credentials: "include", signal: AbortSignal.timeout(20_000) },
  );
  if (!r.ok) return null;
  const json = (await r.json()) as LiveMatrix;
  if (!json || json.sample !== false || !Array.isArray(json.leaves)) return null;
  return json;
}

export function ModuleMatrixPreviewPage() {
  const [params, setParams] = useSearchParams();
  const scopeParam = params.get("scope");
  const moduleParam = params.get("module");
  const showSystem =
    scopeParam === "system" ||
    scopeParam === "all" ||
    (!moduleParam && !scopeParam);
  const moduleId = (
    showSystem ? "home" : parseMatrixModule(moduleParam)
  ) as MatrixModuleId;
  const activeModuleId = showSystem ? null : moduleId;
  const requiredMap = REQUIRED_BY_MODULE[moduleId];
  const cols = requiredMap.columns;

  // Query key MUST stay distinct from ModuleMatrixSystemView's scope=system rollup key.
  // Colliding on ["program","module-matrix","system"] lets the rollup payload (no leaf array)
  // poison the System *module* board → ErrorBoundary "_.leaves is not iterable".
  const { data: recentMerged } = useQuery({
    queryKey: ["program", "audit-scoreboard", "matrix-recent"],
    queryFn: fetchMatrixRecentMerged,
    refetchInterval: SCOREBOARD_POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: 1,
  });
  const recentRows = recentMerged?.items ?? [];
  const recentSource = recentMerged?.source;
  const recentSourceLabel =
    recentSource === "git_log"
      ? "live git log (request-time)"
      : recentSource === "github"
        ? "live GitHub pulls API"
        : recentSource === "ledger_committed"
          ? "committed ledger snapshot (may lag tip — not live)"
          : recentMerged
            ? "source unknown"
            : "loading";

  const { data: live, isError, isFetched, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ["program", "module-matrix", "module", moduleId],
    queryFn: () => fetchModuleMatrix(moduleId),
    refetchInterval: MATRIX_POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    placeholderData: (prev) => prev ?? undefined,
    enabled: !showSystem,
  });

  const liveOk = Boolean(
    live && live.sample === false && Array.isArray(live.leaves),
  );
  const showUnavailableBanner = isFetched && (!liveOk || isError);

  const liveByLeaf = useMemo(() => {
    if (!liveOk || !live || !Array.isArray(live.leaves)) return null;
    const m = new Map<string, Record<string, LiveCell>>();
    for (const leaf of live.leaves) {
      m.set(leaf.id, leaf.cells ?? {});
    }
    return m;
  }, [live, liveOk]);

  const rows = useMemo(
    () => buildRows(moduleId, requiredMap, liveByLeaf),
    [moduleId, requiredMap, liveByLeaf],
  );
  const metrics = boardMetrics(requiredMap, rows, liveOk ? live! : null);

  const groupSpans = useMemo(() => {
    const groups: Array<{ group: string; span: number }> = [];
    for (const c of cols) {
      const last = groups[groups.length - 1];
      if (last && last.group === c.group) last.span += 1;
      else groups.push({ group: c.group, span: 1 });
    }
    return groups;
  }, [cols]);

  function selectSystem() {
    const next = new URLSearchParams(params);
    next.set("scope", "system");
    next.delete("module");
    setParams(next, { replace: true });
  }

  function selectModule(id: MatrixModuleId) {
    const next = new URLSearchParams(params);
    next.delete("scope");
    next.set("module", id);
    setParams(next, { replace: true });
  }

  function pillClass(id: MatrixModuleId | "system", active: boolean): string {
    if (id === "system") return active ? "mod-pill on" : "mod-pill live";
    return active ? "mod-pill on" : "mod-pill live";
  }

  return (
    <div className="ih35mm" data-testid="module-matrix-preview" data-module={moduleId}>
      <style>{CSS}</style>

      {showSystem ? null : showUnavailableBanner ? (
        <div className="banner" data-testid="module-matrix-unavailable-banner">
          <b>LIVE FEED UNAVAILABLE.</b> Box 1 Required is still from{" "}
          <code>docs/specs/scoreboard/modules/{moduleId}.required.json</code>
          {" "}({requiredMap.leaves.length} leaves). Audited / Done cannot be projected — showing
          Required + unaudited (✕✕) until <code>GET /api/v1/program/module-matrix</code> responds.
        </div>
      ) : liveOk ? (
        <div className="banner live" data-testid="module-matrix-live-banner">
          <b>REQUEST-TIME FEED — NOT module-completion green.</b> Required ={" "}
          <code>*.required.json</code> · Audited = ledger/GUARD (not verify) ·{" "}
          <b>Built (Box 3)</b> = wire-sprint guard shipped only · <b>Probes</b> = Audited ● only ·{" "}
          <b>Live (Box 4)</b> = PROD-VERIFIED click-through
          only · <code>complete:true</code> / scenario dots ≠ linkage done
          {live?.meta?.tipSha ? <> · tip <code>{live.meta.tipSha}</code></> : null}
          {typeof live?.meta?.probeProgress === "number" ? (
            <> · probe {live.meta.probeProgress}%</>
          ) : null}
          {live?.meta?.reconAsOf ? <> · recon {live.meta.reconAsOf}</> : null}
          {dataUpdatedAt ? (
            <>
              {" "}
              · refreshed{" "}
              <span data-testid="module-matrix-last-refresh">
                {formatCtStamp(dataUpdatedAt)}
              </span>
              {isFetching ? " (polling…)" : null}
            </>
          ) : null}
          .
        </div>
      ) : (
        <div className="banner" data-testid="module-matrix-loading-banner">
          Loading live Audited / Done projection…
        </div>
      )}

      <ProgramModuleNav active="matrix" />

      <header className="hd">
        <div className="t">Program — Module matrix scoreboards</div>
        <div className="s">
          One shell · 29 module boards + system rollup. <b>All modules</b> uses the same columns and
          4-box ✓/●/✕ cells — priority 10 first, then the rest. Columns include linkage, money,{" "}
          <b>pickers / QBO chrome</b>, and <b>connectivity / reverse link</b>.
        </div>
        <div className="synced">
          Active board:{" "}
          <b>{showSystem ? "All modules (system rollup)" : titleCase(moduleId)}</b>
          {!showSystem ? (
            <>
              {" "}
              · Entity: <b>{live?.entity_default ?? requiredMap.entity_default}</b> ·{" "}
              <span className="synced-note">
                {liveOk
                  ? "Required map imported · 4-box feed from module-matrix API"
                  : "Required map imported · waiting on live feed"}
              </span>
            </>
          ) : (
            <>
              {" "}
              · <span className="synced-note">Priority 10 first · then remainder · same Cell4 chrome</span>
            </>
          )}
        </div>
      </header>

      <section className="recent" data-testid="module-matrix-recent-activity">
        <h2>
          Recent activity — last 10 merged PRs{" "}
          <span className="sub" data-testid="module-matrix-recent-source">
            {recentSourceLabel} · merge times in CT (America/Chicago)
          </span>
        </h2>
        {recentSource === "ledger_committed" ? (
          <div className="clsWarn" data-testid="module-matrix-recent-stale-warning">
            Showing the committed scoreboard snapshot — live git log / GitHub did not answer. This can
            lag tip; it is not a live feed.
          </div>
        ) : null}
        {recentRows.length === 0 ? (
          <p className="recent-empty" data-testid="module-matrix-recent-empty">
            No recent PRs from git log, GitHub, or the committed ledger — empty is honest, not a fake
            green panel.
          </p>
        ) : (
          <ul className="recent-list">
            {recentRows.map((row) => (
              <li key={row.number || row.title} data-testid={`module-matrix-recent-pr-${row.number}`}>
                {row.url ? (
                  <a href={row.url} target="_blank" rel="noreferrer">
                    #{row.number}
                  </a>
                ) : (
                  <span>#{row.number || "—"}</span>
                )}
                <span className="recent-title">
                  {row.state ? <span className="recent-state">{row.state}</span> : null}
                  {row.title}
                </span>
                <span className="recent-when">{row.mergedAtCt || "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="module-rail" data-testid="module-matrix-module-rail">
        <div className="lbl">
          Sidebar order — All modules (system rollup) + 29 module boards · cell = R / A / B / L
        </div>
        <button
          type="button"
          className={pillClass("system", showSystem)}
          data-testid="module-matrix-pill-system"
          onClick={selectSystem}
        >
          All modules
        </button>
        {MATRIX_MODULES_SIDEBAR_ORDER.map((m) => (
          <button
            key={m.id}
            type="button"
            className={pillClass(m.id, !showSystem && activeModuleId === m.id)}
            data-testid={`module-matrix-pill-${m.id}`}
            onClick={() => selectModule(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {showSystem ? (
        <ModuleMatrixSystemView />
      ) : (
        <>
      <MatrixBoxTracker
        boardKey={moduleId}
        metrics={metrics}
        liveOk={liveOk}
        dataUpdatedAt={dataUpdatedAt}
      />
      <GroupRollupTable rollups={live?.groupRollups ?? []} liveOk={liveOk} />

      <div className="metrics metrics-secondary">
        <div className="metric">
          <div className="n">{metrics.leafCount}</div>
          <div className="l">Leaves<br />on board</div>
        </div>
        <div className="metric">
          <div className="n">{(metrics as { modalLeafCount?: number }).modalLeafCount ?? "—"}</div>
          <div className="l">Modals<br />create/drawer</div>
        </div>
        <div className="metric">
          <div className="n">{(metrics as { closedCells?: number }).closedCells ?? "—"}</div>
          <div className="l">Named<br />`leaf:col`</div>
        </div>
        <div className="metric">
          <div className="n">{(metrics as { clickedCells?: number }).clickedCells ?? "—"}</div>
          <div className="l">Clicked<br />Chrome 1–3</div>
        </div>
        <div className="metric">
          <div className="n">{metrics.unauditedCells}</div>
          <div className="l">Unaudited cells<br />not started</div>
        </div>
        <div className="metric big">
          <div className="n">{metrics.buildQueue}</div>
          <div className="l">Build queue<br />(required − live)</div>
        </div>
      </div>

      <h2>
        {titleCase(moduleId)} matrix{" "}
        <span className="sub">left = module tree · top = scoped columns · cell = R / A / B / L</span>
      </h2>

      <div className="legend">
        <span>
          <span className="tri4">
            <span className="bx req-y">✓</span>
            <span className="bx map-n">✕</span>
            <span className="bx done-n">✕</span>
            <span className="bx done-n">✕</span>
          </span>
          Required · not audited
        </span>
        <span>
          <span className="tri4">
            <span className="bx req-y">✓</span>
            <span className="bx map-w">●</span>
            <span className="bx done-n">✕</span>
            <span className="bx done-n">✕</span>
          </span>
          Audited (Box 2)
        </span>
        <span>
          <span className="tri4">
            <span className="bx req-y">✓</span>
            <span className="bx map-y">✓</span>
            <span className="bx done-y">✓</span>
            <span className="bx done-n">✕</span>
          </span>
          Built wired (Box 3) · not Live
        </span>
        <span>
          <span className="tri4">
            <span className="bx req-y">✓</span>
            <span className="bx map-y">✓</span>
            <span className="bx done-y">✓</span>
            <span className="bx live-y">✓</span>
          </span>
          Live verified (Box 4)
        </span>
      </div>

      <div className="scroll">
        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th className="leaf" rowSpan={2}>
                Tab / sub-tab / create
              </th>
              {groupSpans.map((g) => (
                <th key={g.group} className="grp" colSpan={g.span} title={g.group}>
                  {matrixGroupHeaderLabel(g.group)}
                </th>
              ))}
              <th className="sum-col" rowSpan={2} data-testid="module-matrix-leaf-built-cells">
                Built
              </th>
              <th className="sum-col" rowSpan={2}>
                Live
              </th>
              <th className="sum-col" rowSpan={2}>
                Queue
              </th>
            </tr>
            <tr>
              {cols.map((c) => (
                <th key={c.id} className="col" title={c.label}>
                  {matrixColumnHeaderLabel(c.id, c.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row.kind === "section") {
                return (
                  <tr key={`s-${row.label}-${i}`} className="section">
                    <td colSpan={1 + cols.length + 3}>{row.label}</td>
                  </tr>
                );
              }
              const leafCounts = leafSummaryCounts(row.cells);
              return (
                <tr key={row.leaf.id}>
                  <td className={`leaf-cell indent-${row.indent}`}>
                    <span className="tab-name">{row.leaf.tab}</span>
                    {row.leaf.sub ? <span className="sub">{row.leaf.sub}</span> : null}
                    <span className={`pct ${pctClass(row.pct)}`}>{row.pct}%</span>
                  </td>
                  {row.cells.map((st, ci) => (
                    <td key={cols[ci].id} className="gc">
                      <MatrixCell4 {...st} />
                    </td>
                  ))}
                  <td className="sum-val amb">{leafCounts.built}</td>
                  <td className="sum-val good">{leafCounts.live}</td>
                  <td className="sum-val big">{leafCounts.queue}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="module-total">
              <td className="leaf-cell">
                <b>Module total</b>
              </td>
              {cols.map((c) => (
                <td key={c.id} className="gc">
                  —
                </td>
              ))}
              <td className="sum-val amb">
                <b>{metrics.builtCells ?? 0}</b>
              </td>
              <td className="sum-val good">
                <b>{metrics.liveCells ?? metrics.doneCells ?? 0}</b>
              </td>
              <td className="sum-val big">
                <b>{metrics.buildQueue}</b>
              </td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      <div className="note">
        <b>4-box law + Option A ribbon (2026-08-11):</b> Ribbon tiers are mutually exclusive (sum = Required).
        Audited = ledger/GUARD only · Probe = density ● · Built = wire-sprint guard · Certified = Live =
        PROD-VERIFIED. Group table breaks down linkage / money / chrome / wiring / process.
      </div>

      <div className="foot">
        Design lock: <code>docs/specs/scoreboard/MODULE-MATRIX-SCOREBOARD-LOCKED.md</code>
        {" · "}
        Order: <code>docs/specs/scoreboard/matrix-module-order.json</code>
        {" · "}
        Required map: <code>docs/specs/scoreboard/modules/{moduleId}.required.json</code>
        {" · "}
        API: <code>GET /api/v1/program/module-matrix?module={moduleId}</code>
        {" · "}
        <Link to="/program/matrix?scope=system">All modules rollup</Link>
        {" · "}
        <Link to="/program">Scenario tracker</Link>
      </div>
        </>
      )}
    </div>
  );
}

export default ModuleMatrixPreviewPage;

const CSS = `
.ih35mm{--navy:#1f2a44;--navy-dk:#0f1729;--slate:#334155;--slate-lt:#64748b;--bg:#f8fafc;--card:#fff;--line:#e2e8f0;--green:#16a34a;--green-bg:#dcfce7;--red:#dc2626;--red-bg:#fee2e2;--amber:#d97706;--amber-bg:#fef3c7;--accent-bg:#e8eef7;--gray-bg:#f1f5f9;color:var(--navy);font-size:14px;padding:0 4px 40px}
.ih35mm *{box-sizing:border-box}
.ih35mm .banner{background:var(--amber-bg);border:1px solid #fde68a;color:#78350f;border-radius:10px;padding:10px 14px;font-size:12.5px;margin-bottom:14px;line-height:1.5}
.ih35mm .banner.live{background:var(--green-bg);border-color:#86efac;color:#14532d}
.ih35mm .banner.live b{color:#166534}
.ih35mm .banner b{color:#92400e}
.ih35mm .hd{background:linear-gradient(135deg,var(--navy),var(--navy-dk));color:#fff;padding:16px 20px;border-radius:10px}
.ih35mm .hd .t{font-size:18px;font-weight:700}
.ih35mm .hd .s{color:#94a3b8;font-size:12px;margin-top:6px;line-height:1.55}
.ih35mm .hd .synced{margin-top:10px;font-size:12px;color:#e2e8f0}
.ih35mm .hd .synced b{color:#fff}
.ih35mm .hd .synced-note{color:#94a3b8}
.ih35mm .module-rail{display:flex;flex-wrap:wrap;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:14px 0}
.ih35mm .module-rail .lbl{width:100%;font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--slate-lt);margin-bottom:2px}
.ih35mm .mod-pill{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:var(--gray-bg);color:var(--slate);cursor:default;font-family:inherit}
.ih35mm button.mod-pill{cursor:pointer}
.ih35mm .mod-pill.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.ih35mm .mod-pill.live{background:#fff;color:var(--navy);border-color:var(--navy)}
.ih35mm .mod-pill.dim{opacity:.55}
.ih35mm .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 16px}
.ih35mm .metrics-ribbon{grid-template-columns:repeat(2,1fr)}
.ih35mm .metrics-boxes{grid-template-columns:repeat(2,1fr)}
@media(min-width:700px){.ih35mm .metrics-boxes{grid-template-columns:repeat(4,1fr)}}
@media(min-width:900px){.ih35mm .metrics-ribbon:not(.metrics-boxes){grid-template-columns:repeat(3,1fr)}}
@media(min-width:1200px){.ih35mm .metrics-ribbon:not(.metrics-boxes){grid-template-columns:repeat(6,1fr)}}
.ih35mm .metrics-secondary{grid-template-columns:repeat(3,1fr);margin-top:-6px}
.ih35mm .metric .box-tag{font-size:10px;font-weight:800;letter-spacing:.35px;text-transform:uppercase;color:var(--slate-lt);margin-bottom:4px}
.ih35mm .box-tracker{margin:0 0 16px}
.ih35mm .box-changes{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-top:10px}
.ih35mm .box-changes-hd{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.35px;color:var(--slate);margin-bottom:8px}
.ih35mm .box-changes-hd .sub{text-transform:none;letter-spacing:0;font-weight:400;color:var(--slate-lt);margin-left:6px}
.ih35mm .box-changes-empty{font-size:12.5px;color:var(--slate-lt);line-height:1.45}
.ih35mm .box-changes-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ih35mm .box-changes-list li{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline;font-size:12.5px;font-variant-numeric:tabular-nums;border-bottom:1px solid var(--line);padding-bottom:6px}
.ih35mm .box-changes-list li:last-child{border-bottom:0;padding-bottom:0}
.ih35mm .box-changes-list .t{color:var(--slate-lt);min-width:72px}
.ih35mm .box-changes-list .b{font-weight:800;color:var(--navy);min-width:64px}
.ih35mm .box-changes-list .d{color:var(--slate)}
.ih35mm .box-changes-list .d b{color:var(--green)}
.ih35mm .group-table{min-width:720px}
.ih35mm .scroll-groups{margin-bottom:16px}
.ih35mm .pct{display:inline-block;font-size:11px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--gray-bg);color:var(--slate);font-variant-numeric:tabular-nums}
.ih35mm .pct.hi{background:var(--green-bg);color:var(--green)}
.ih35mm .pct.mid{background:var(--amber-bg);color:var(--amber)}
.ih35mm .pct.lo{background:var(--red-bg);color:var(--red)}
.ih35mm .pct-dual{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.ih35mm .pct-sep{color:var(--slate-lt);font-weight:700;font-size:11px}
.ih35mm .dual-hint{display:block;font-size:9px;font-weight:600;letter-spacing:.2px;text-transform:none;color:var(--slate-lt);margin-top:4px}
@media(min-width:1100px){.ih35mm .metrics:not(.metrics-ribbon):not(.metrics-secondary){grid-template-columns:repeat(8,1fr)}}
.ih35mm .metric{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 13px}
.ih35mm .metric .n{font-size:22px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.ih35mm .metric .l{font-size:10px;color:var(--slate-lt);text-transform:uppercase;letter-spacing:.3px;margin-top:8px;line-height:1.3}
.ih35mm .metric.good .n{color:var(--green)}.ih35mm .metric.amb .n{color:var(--amber)}.ih35mm .metric.big .n{color:var(--red)}
.ih35mm h2{font-size:13.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--slate);margin:28px 0 14px;border-bottom:1px solid var(--line);padding-bottom:10px}
.ih35mm h2 .sub{text-transform:none;letter-spacing:0;color:var(--slate-lt);font-weight:400;font-size:12px;margin-left:8px}
.ih35mm .legend{display:flex;gap:18px;flex-wrap:wrap;margin:0 0 16px;font-size:12px;color:var(--slate)}
.ih35mm .legend span{display:inline-flex;align-items:center;gap:6px}
.ih35mm .tri{display:inline-grid;grid-template-columns:repeat(3,14px);gap:2px}
.ih35mm .bx{width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,.08);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;line-height:1}
.ih35mm .bx.req-y,.ih35mm .bx.map-y,.ih35mm .bx.done-y{background:var(--green-bg);color:var(--green);border-color:#86efac}
.ih35mm .bx.map-w{background:var(--amber-bg);color:var(--amber);border-color:#fde68a}
.ih35mm .bx.req-n{background:transparent;color:#cbd5e1;border-color:transparent}
.ih35mm .bx.map-n,.ih35mm .bx.done-n{background:var(--red-bg);color:var(--red);border-color:#fecaca}
.ih35mm .bx.empty{background:transparent;border-color:transparent}
.ih35mm .scroll{overflow-x:auto;border-radius:10px;border:1px solid var(--line);background:var(--card)}
.ih35mm table{width:100%;border-collapse:collapse;min-width:1100px}
.ih35mm th,.ih35mm td{padding:9px 11px;text-align:left;border-bottom:1px solid var(--line);font-size:12.5px;vertical-align:middle}
.ih35mm th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.25px;color:var(--slate-lt)}
.ih35mm th.col{text-align:center;min-width:80px;max-width:96px;white-space:normal;line-height:1.2;padding:8px 5px;font-size:9.5px;letter-spacing:.12px}
.ih35mm th.grp{font-size:10px;letter-spacing:.35px;padding:6px 4px}
.ih35mm th.grp{text-align:center;color:var(--navy);border-bottom:2px solid var(--line);background:var(--accent-bg)}
.ih35mm th.leaf{min-width:220px;text-align:left}
.ih35mm td.leaf-cell{white-space:nowrap}
.ih35mm td.leaf-cell .tab-name{font-weight:700;color:var(--navy)}
.ih35mm td.leaf-cell .sub{color:var(--slate-lt);font-size:11.5px;margin-left:6px}
.ih35mm td.leaf-cell.indent-1{padding-left:18px}
.ih35mm td.leaf-cell.indent-2{padding-left:32px}
.ih35mm td.leaf-cell .pct{display:inline-block;margin-left:8px;font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--gray-bg);color:var(--slate);font-variant-numeric:tabular-nums}
.ih35mm td.leaf-cell .pct.hi{background:var(--green-bg);color:var(--green)}
.ih35mm td.leaf-cell .pct.mid{background:var(--amber-bg);color:var(--amber)}
.ih35mm td.leaf-cell .pct.lo{background:var(--red-bg);color:var(--red)}
.ih35mm td.gc{text-align:center;padding:6px 4px}
.ih35mm tr.section td{background:#f8fafc;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.35px;color:var(--slate)}
.ih35mm th.sum-col,.ih35mm td.sum-val{text-align:center;min-width:64px;padding:10px 12px;background:#f8fafc;font-variant-numeric:tabular-nums;font-weight:700}
.ih35mm td.sum-val.amb{color:var(--amber)}.ih35mm td.sum-val.good{color:var(--green)}.ih35mm td.sum-val.big{color:var(--red)}
.ih35mm tr.module-total td{background:var(--accent-bg);border-top:2px solid var(--line)}
.ih35mm .tri4{display:inline-grid;grid-template-columns:repeat(4,14px);gap:2px}
.ih35mm .cell4{display:inline-grid;grid-template-columns:repeat(4,16px);gap:2px;justify-content:center}
.ih35mm .cell4 .bx{width:16px;height:16px;font-size:10px}
.ih35mm .bx.live-y{background:#e2e8f0;color:#1F2A44;border-color:#94a3b8}
.ih35mm .scroll-system{overflow-x:auto;max-width:100%}
.ih35mm .system-table{min-width:1280px}
.ih35mm .system-table .sticky-col{position:sticky;left:0;background:var(--card);z-index:1;min-width:140px}
.ih35mm .system-table .mod-id{display:block;font-size:10px;color:var(--slate-lt);font-weight:400}
.ih35mm .system-column-board{min-width:1600px}
.ih35mm .system-table .board-link{font-size:10px;font-weight:600;margin-left:4px}
.ih35mm tr.system-total td{background:var(--accent-bg);font-weight:700}
.ih35mm tr.dim-row td{opacity:.55}
.ih35mm .cell3{display:inline-grid;grid-template-columns:repeat(3,16px);gap:2px;justify-content:center}
.ih35mm .cell3 .bx{width:16px;height:16px;font-size:10px}
.ih35mm .note{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-top:16px;font-size:13px;color:#78350f;line-height:1.55}
.ih35mm .foot{color:var(--slate-lt);font-size:11.5px;margin-top:18px;line-height:1.6}
.ih35mm .foot a{color:var(--navy);font-weight:600}
.ih35mm .recent{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:0 0 14px}
.ih35mm .recent h2{margin:0 0 10px;border-bottom:1px solid var(--line);padding-bottom:8px}
.ih35mm .recent-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.ih35mm .recent-list li{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:baseline;font-size:12.5px}
.ih35mm .recent-list a{color:var(--navy);font-weight:700}
.ih35mm .recent-title{color:var(--slate)}
.ih35mm .recent-state{display:inline-block;margin-right:8px;font-size:10px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;color:var(--slate-lt)}
.ih35mm .recent-when{font-variant-numeric:tabular-nums;color:var(--navy);font-weight:700;white-space:nowrap}
.ih35mm .recent-empty{margin:0;font-size:12.5px;color:var(--slate-lt)}
.ih35mm .clsWarn{background:var(--amber-bg);border:1px solid #fde68a;color:#78350f;border-radius:8px;padding:8px 10px;font-size:12px;margin:0 0 10px}
.ih35mm code{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:12px}
@media(max-width:900px){.ih35mm .metrics{grid-template-columns:repeat(2,1fr)}}
`;
