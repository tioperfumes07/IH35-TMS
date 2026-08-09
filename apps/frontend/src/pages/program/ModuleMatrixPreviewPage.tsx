/**
 * Module matrix scoreboard — owner-approved layout (2026-08-08).
 * Box 1 Required: docs/specs/scoreboard/modules/<module>.required.json
 * Boxes 2–3 Audited/Done: GET /api/v1/program/module-matrix (MATRIX-LIVE-RAD)
 * Chrome/picker/wiring columns are Required law (owner 2026-08-08) — part of full linkage.
 * SAMPLE banner only when the live API is unavailable.
 * Design lock: docs/specs/scoreboard/MODULE-MATRIX-SCOREBOARD-LOCKED.md
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
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
  state: Tri;
  audited?: boolean;
  done?: boolean;
};

type LiveMatrix = {
  sample: false;
  module?: string;
  entity_default?: string;
  leaves: Array<{ id: string; cells: Record<string, LiveCell> }>;
  metrics?: {
    leafCount: number;
    colCount: number;
    requiredCells: number;
    doneCells: number;
    auditedCells: number;
    unauditedCells: number;
    buildQueue: number;
    modulePct: number;
    auditedPct?: number;
  };
  meta?: {
    honesty?: string;
    tipSha?: string;
    probeProgress?: number | null;
    reconAsOf?: string | null;
    feedNote?: string;
  };
};

type MatrixModuleId =
  | "maintenance"
  | "safety"
  | "insurance"
  | "legal"
  | "accounting"
  | "banking"
  | "dispatch"
  | "settlements"
  | "fuel"
  | "drivers"
  | "fleet"
  | "customers"
  | "vendors"
  | "lists"
  | "factoring"
  | "reports"
  | "inventory"
  | "compliance"
  | "cash-flow"
  | "home"
  | "program"
  | "tasks"
  | "form_425"
  | "finance"
  | "docs"
  | "system"
  | "users"
  | "help"
  | "driver-hub";

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

const LIVE_MODULES: MatrixModuleId[] = [
  "maintenance",
  "safety",
  "insurance",
  "legal",
  "accounting",
  "banking",
  "dispatch",
  "settlements",
  "fuel",
  "drivers",
  "fleet",
  "customers",
  "vendors",
  "lists",
  "factoring",
  "reports",
  "inventory",
  "compliance",
  "cash-flow",
  "home",
  "program",
  "tasks",
  "form_425",
  "finance",
  "docs",
  "system",
  "users",
  "help",
  "driver-hub",
];

const MODULES = [
  "Home", "Dispatch", "Drivers", "Fleet", "Trailers", "Maintenance", "Safety", "Insurance",
  "Legal", "Accounting", "Banking", "Settlements", "Fuel", "Factoring", "Customers", "Vendors",
  "Lists", "Reports", "Inventory", "Compliance", "Cash flow", "Finance hub", "Tasks",
  "Notifications", "System", "Program",
] as const;

const MATRIX_POLL_MS = 3000;

function Cell({ state }: { state: Tri }) {
  if (state === "na") {
    return (
      <div className="cell3" aria-label="Not applicable">
        <span className="bx req-n">·</span>
        <span className="bx empty" />
        <span className="bx empty" />
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="cell3" aria-label="Required audited done">
        <span className="bx req-y">✓</span>
        <span className="bx map-y">✓</span>
        <span className="bx done-y">✓</span>
      </div>
    );
  }
  if (state === "audited") {
    return (
      <div className="cell3" aria-label="Required audited not done">
        <span className="bx req-y">✓</span>
        <span className="bx map-w">●</span>
        <span className="bx done-n">✕</span>
      </div>
    );
  }
  return (
    <div className="cell3" aria-label="Required not audited">
      <span className="bx req-y">✓</span>
      <span className="bx map-n">✕</span>
      <span className="bx done-n">✕</span>
    </div>
  );
}

type Row =
  | { kind: "section"; label: string }
  | {
      kind: "leaf";
      leaf: RequiredLeaf;
      indent: 1 | 2;
      pct: number;
      cells: Tri[];
    };

function cellState(
  leafId: string,
  colId: string,
  required: Set<string>,
  liveByLeaf: Map<string, Record<string, LiveCell>> | null,
): Tri {
  if (!required.has(colId)) return "na";
  const live = liveByLeaf?.get(leafId)?.[colId];
  if (live?.state === "done" || live?.state === "audited" || live?.state === "unaudited") {
    return live.state;
  }
  return "unaudited";
}

function leafPct(cells: Tri[]): number {
  const owed = cells.filter((c) => c !== "na");
  if (owed.length === 0) return 0;
  const done = owed.filter((c) => c === "done").length;
  return Math.round((done / owed.length) * 100);
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
  for (const leaf of map.leaves) {
    const section = sectionForLeaf(moduleId, leaf);
    if (section !== lastSection) {
      rows.push({ kind: "section", label: section });
      lastSection = section;
    }
    const req = new Set(leaf.required);
    const cells = map.columns.map((c) => cellState(leaf.id, c.id, req, liveByLeaf));
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

function pctClass(n: number) {
  if (n >= 80) return "hi";
  if (n >= 40) return "mid";
  return "lo";
}

function boardMetrics(map: RequiredMap, rows: Row[], live: LiveMatrix | null) {
  if (live?.metrics) {
    return {
      modulePct: live.metrics.modulePct,
      auditedPct: live.metrics.auditedPct ?? 0,
      leafCount: live.metrics.leafCount || map.leaves.length,
      colCount: live.metrics.colCount || map.columns.length,
      requiredCells: live.metrics.requiredCells,
      doneCells: live.metrics.doneCells,
      auditedCells: live.metrics.auditedCells ?? 0,
      buildQueue: live.metrics.buildQueue,
    };
  }
  let requiredCells = 0;
  let doneCells = 0;
  let auditedCells = 0;
  let buildQueue = 0;
  for (const row of rows) {
    if (row.kind !== "leaf") continue;
    for (const st of row.cells) {
      if (st === "na") continue;
      requiredCells += 1;
      if (st === "done") doneCells += 1;
      else if (st === "audited") {
        auditedCells += 1;
        buildQueue += 1;
      } else buildQueue += 1;
    }
  }
  const modulePct = requiredCells === 0 ? 0 : Math.round((doneCells / requiredCells) * 100);
  const auditedPct =
    requiredCells === 0 ? 0 : Math.round(((doneCells + auditedCells) / requiredCells) * 100);
  return {
    modulePct,
    auditedPct,
    leafCount: map.leaves.length,
    colCount: map.columns.length,
    requiredCells,
    doneCells,
    auditedCells,
    buildQueue,
  };
}

function parseModule(raw: string | null): MatrixModuleId {
  if (raw === "safety") return "safety";
  if (raw === "insurance") return "insurance";
  if (raw === "legal") return "legal";
  if (raw === "accounting") return "accounting";
  if (raw === "banking" || raw === "bank") return "banking";
  if (raw === "dispatch") return "dispatch";
  if (raw === "settlements") return "settlements";
  if (raw === "fuel") return "fuel";
  if (raw === "drivers") return "drivers";
  if (raw === "fleet") return "fleet";
  if (raw === "customers") return "customers";
  if (raw === "vendors") return "vendors";
  if (raw === "lists") return "lists";
  if (raw === "factoring") return "factoring";
  if (raw === "reports") return "reports";
  if (raw === "inventory") return "inventory";
  if (raw === "compliance") return "compliance";
  if (raw === "cash-flow" || raw === "cash_flow" || raw === "cashflow") return "cash-flow";
  if (raw === "home") return "home";
  if (raw === "program") return "program";
  if (raw === "tasks") return "tasks";
  if (raw === "form_425" || raw === "form425c" || raw === "425c") return "form_425";
  if (raw === "finance" || raw === "finance-hub" || raw === "finance_hub") return "finance";
  if (raw === "docs") return "docs";
  if (raw === "system") return "system";
  if (raw === "users") return "users";
  if (raw === "help") return "help";
  if (raw === "driver-hub" || raw === "driver_hub" || raw === "driverhub") return "driver-hub";
  return "maintenance";
}

function titleCase(id: MatrixModuleId): string {
  if (id === "safety") return "Safety";
  if (id === "insurance") return "Insurance";
  if (id === "legal") return "Legal";
  if (id === "accounting") return "Accounting";
  if (id === "banking") return "Banking";
  if (id === "dispatch") return "Dispatch";
  if (id === "settlements") return "Settlements";
  if (id === "fuel") return "Fuel";
  if (id === "drivers") return "Drivers";
  if (id === "fleet") return "Fleet";
  if (id === "customers") return "Customers";
  if (id === "vendors") return "Vendors";
  if (id === "lists") return "Lists";
  if (id === "factoring") return "Factoring";
  if (id === "reports") return "Reports";
  if (id === "inventory") return "Inventory";
  if (id === "compliance") return "Compliance";
  if (id === "cash-flow") return "Cash flow";
  return "Maintenance";
}

async function fetchModuleMatrix(moduleId: MatrixModuleId): Promise<LiveMatrix | null> {
  const r = await fetch(
    resolveApiUrl(`/api/v1/program/module-matrix?module=${moduleId}`),
    { credentials: "include" },
  );
  if (!r.ok) return null;
  const json = (await r.json()) as LiveMatrix;
  if (!json || json.sample !== false || !Array.isArray(json.leaves)) return null;
  return json;
}

export function ModuleMatrixPreviewPage() {
  const [params, setParams] = useSearchParams();
  const moduleId = parseModule(params.get("module"));
  const requiredMap = REQUIRED_BY_MODULE[moduleId];
  const cols = requiredMap.columns;

  const { data: live, isError, isFetched } = useQuery({
    queryKey: ["program", "module-matrix", moduleId],
    queryFn: () => fetchModuleMatrix(moduleId),
    refetchInterval: MATRIX_POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    placeholderData: (prev) => prev ?? undefined,
  });

  const liveOk = Boolean(live && live.sample === false);
  const showSampleBanner = isFetched && (!liveOk || isError);

  const liveByLeaf = useMemo(() => {
    if (!liveOk || !live) return null;
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

  function selectModule(id: MatrixModuleId) {
    const next = new URLSearchParams(params);
    if (id === "maintenance") next.delete("module");
    else next.set("module", id);
    setParams(next, { replace: true });
  }

  function pillClass(label: string): string {
    const id = label.toLowerCase() as MatrixModuleId;
    if (LIVE_MODULES.includes(id)) {
      return id === moduleId ? "mod-pill on" : "mod-pill live";
    }
    return "mod-pill dim";
  }

  return (
    <div className="ih35mm" data-testid="module-matrix-preview" data-module={moduleId}>
      <style>{CSS}</style>

      {showSampleBanner ? (
        <div className="banner" data-testid="module-matrix-sample-banner">
          <b>LIVE FEED UNAVAILABLE.</b> Box 1 Required is still from{" "}
          <code>docs/specs/scoreboard/modules/{moduleId}.required.json</code>
          {" "}({requiredMap.leaves.length} leaves). Audited / Done cannot be projected — showing
          Required + unaudited (✕✕) until <code>GET /api/v1/program/module-matrix</code> responds.
        </div>
      ) : liveOk ? (
        <div className="banner live" data-testid="module-matrix-live-banner">
          <b>REQUEST-TIME FEED.</b> Required = committed map · Audited = leaf×column ledger / GUARD /
          wave / module-completion (not live verify) · Done = <code>live_scenario_probe</code> hops +
          PROD-VERIFIED + Neon completion PASS
          {live?.meta?.tipSha ? <> · tip <code>{live.meta.tipSha}</code></> : null}
          {typeof live?.meta?.probeProgress === "number" ? (
            <> · probe {live.meta.probeProgress}%</>
          ) : null}
          {live?.meta?.reconAsOf ? <> · recon {live.meta.reconAsOf}</> : null}.
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
          One shell · 26 module boards. Columns include linkage, money, <b>pickers / QBO chrome</b>, and
          <b> connectivity / reverse link</b> — full wiring, not chrome-only. Cell = Required · Audited · Done.
        </div>
        <div className="synced">
          Active board: <b>{titleCase(moduleId)}</b> · Entity:{" "}
          <b>{live?.entity_default ?? requiredMap.entity_default}</b> ·{" "}
          <span className="synced-note">
            {liveOk
              ? "Required map imported · Audited/Done from module-matrix API"
              : "Required map imported · waiting on live Audited/Done"}
          </span>
        </div>
      </header>

      <div className="module-rail" data-testid="module-matrix-module-rail">
        <div className="lbl">26 module boards — open one at a time (columns scoped per module)</div>
        {MODULES.map((m) => {
          const id = m.toLowerCase() as MatrixModuleId;
          const liveable = LIVE_MODULES.includes(id);
          if (liveable) {
            return (
              <button
                key={m}
                type="button"
                className={pillClass(m)}
                data-testid={`module-matrix-pill-${id}`}
                onClick={() => selectModule(id)}
              >
                {m}
              </button>
            );
          }
          return (
            <span key={m} className="mod-pill dim" title="Required map not authored yet">
              {m}
            </span>
          );
        })}
      </div>

      <div className="metrics">
        <div className={`metric ${metrics.modulePct >= 40 ? "amb" : "big"}`}>
          <div className="n">{metrics.modulePct}%</div>
          <div className="l">
            {titleCase(moduleId)} module %
            <br />
            (done ÷ required{liveOk ? "" : " · pending feed"})
          </div>
        </div>
        <div className="metric amb">
          <div className="n">{metrics.auditedPct ?? 0}%</div>
          <div className="l">
            Audited coverage
            <br />
            ((done+audited) ÷ required)
          </div>
        </div>
        <div className="metric">
          <div className="n">{metrics.leafCount}</div>
          <div className="l">Leaves on this board<br />(from required JSON)</div>
        </div>
        <div className="metric">
          <div className="n">{metrics.requiredCells}</div>
          <div className="l">Required cells<br />(box 1 green)</div>
        </div>
        <div className="metric good">
          <div className="n">{metrics.doneCells}</div>
          <div className="l">Done cells<br />(live-proven all 3 green)</div>
        </div>
        <div className="metric big">
          <div className="n">{metrics.buildQueue}</div>
          <div className="l">Build queue<br />(required, not done)</div>
        </div>
      </div>

      <h2>
        {titleCase(moduleId)} matrix{" "}
        <span className="sub">left = module tree · top = scoped columns · cell = R / A / D</span>
      </h2>

      <div className="legend">
        <span>
          <span className="tri">
            <span className="bx req-y">✓</span>
            <span className="bx map-n">✕</span>
            <span className="bx done-n">✕</span>
          </span>
          Required · not audited
        </span>
        <span>
          <span className="tri">
            <span className="bx req-y">✓</span>
            <span className="bx map-w">●</span>
            <span className="bx done-n">✕</span>
          </span>
          Audited / in progress
        </span>
        <span>
          <span className="tri">
            <span className="bx req-y">✓</span>
            <span className="bx map-y">✓</span>
            <span className="bx done-y">✓</span>
          </span>
          Done (live)
        </span>
      </div>

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="leaf" rowSpan={2}>
                Tab / sub-tab / create
              </th>
              {groupSpans.map((g) => (
                <th key={g.group} className="grp" colSpan={g.span}>
                  {g.group}
                </th>
              ))}
            </tr>
            <tr>
              {cols.map((c) => (
                <th key={c.id} className="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row.kind === "section") {
                return (
                  <tr key={`s-${row.label}-${i}`} className="section">
                    <td colSpan={1 + cols.length}>{row.label}</td>
                  </tr>
                );
              }
              return (
                <tr key={row.leaf.id}>
                  <td className={`leaf-cell indent-${row.indent}`}>
                    <span className="tab-name">{row.leaf.tab}</span>
                    {row.leaf.sub ? <span className="sub">{row.leaf.sub}</span> : null}
                    <span className={`pct ${pctClass(row.pct)}`}>{row.pct}%</span>
                  </td>
                  {row.cells.map((st, ci) => (
                    <td key={cols[ci].id} className="gc">
                      <Cell state={st} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="note">
        <b>Cell law:</b> Required + not audited → ✓ ✕ ✕. Required + audited/in progress → ✓ ● ✕.
        Complete → ✓ ✓ ✓. <b>Picker +Add new</b>, <b>QBO chrome</b>, <b>Connectivity</b>, and{" "}
        <b>Reverse link</b> are Required columns — they roll into module %. Done green only from
        live_scenario_probe holds (process columns today) — chrome/wiring Done stays red until live probes exist.
      </div>

      <div className="foot">
        Design lock: <code>docs/specs/scoreboard/MODULE-MATRIX-SCOREBOARD-LOCKED.md</code>
        {" · "}
        Required map: <code>docs/specs/scoreboard/modules/{moduleId}.required.json</code>
        {" · "}
        Shared columns: <code>docs/specs/scoreboard/columns.shared.json</code>
        {" · "}
        API: <code>GET /api/v1/program/module-matrix?module={moduleId}</code>
        {" · "}
        <Link to="/program">Scenario tracker</Link>
        {" · "}
        <Link to="/program/legacy-scoreboard">Legacy board</Link>
      </div>
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
.ih35mm .metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:0 0 16px}
.ih35mm .metric{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 13px}
.ih35mm .metric .n{font-size:22px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.ih35mm .metric .l{font-size:10px;color:var(--slate-lt);text-transform:uppercase;letter-spacing:.3px;margin-top:8px;line-height:1.3}
.ih35mm .metric.good .n{color:var(--green)}.ih35mm .metric.amb .n{color:var(--amber)}.ih35mm .metric.big .n{color:var(--red)}
.ih35mm h2{font-size:13.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--slate);margin:22px 0 10px;border-bottom:1px solid var(--line);padding-bottom:8px}
.ih35mm h2 .sub{text-transform:none;letter-spacing:0;color:var(--slate-lt);font-weight:400;font-size:12px;margin-left:8px}
.ih35mm .legend{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 12px;font-size:12px;color:var(--slate)}
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
.ih35mm th,.ih35mm td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);font-size:12.5px;vertical-align:middle}
.ih35mm th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.25px;color:var(--slate-lt)}
.ih35mm th.col{text-align:center;min-width:72px;max-width:88px;white-space:normal;line-height:1.25;padding:8px 4px}
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
.ih35mm .cell3{display:inline-grid;grid-template-columns:repeat(3,16px);gap:2px;justify-content:center}
.ih35mm .cell3 .bx{width:16px;height:16px;font-size:10px}
.ih35mm .note{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-top:16px;font-size:13px;color:#78350f;line-height:1.55}
.ih35mm .foot{color:var(--slate-lt);font-size:11.5px;margin-top:18px;line-height:1.6}
.ih35mm .foot a{color:var(--navy);font-weight:600}
.ih35mm code{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:12px}
@media(max-width:900px){.ih35mm .metrics{grid-template-columns:repeat(2,1fr)}}
`;
