/**
 * System-wide module matrix — SAME column groups + SAME 4-box ✓/●/✕ chrome as each module board.
 * Rows = modules (Urgent 6 → rest of urgent → WAVE2) · columns = LINK/MONEY/CHROME/WIRE/PROC atoms.
 * Each cell = MatrixCell4 from column Abl rollup (tooltip keeps Audited%·Built%·Live% detail).
 */
import { Fragment, useMemo, createContext, useContext } from "react";
import { EntityLink } from "../../components/shared/EntityLink";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import { ctDateTime } from "../../lib/businessDate";
import {
  MATRIX_MODULES_SIDEBAR_ORDER,
  URGENT_6_MODULE_IDS,
  REST_OF_URGENT_MODULE_IDS,
  VERTICAL_CERTIFY_COL_LABEL,
  FAST_MERGE_STATUS,
  isUrgent6Module,
  isRestOfUrgentModule,
  isUrgent14Module,
  launchWaveForModule,
  matrixColumnHeaderLabel,
  matrixGroupHeaderLabel,
  sortModulesPriority10First,
  FULLY_WIRED_SYSTEM_COLS,
  SHARED_SCOREBOARD_COLUMNS,
  RENDERED_SCOREBOARD_COLUMN_IDS,
} from "./moduleMatrixCatalog";
import { REQUIRED_BY_MODULE } from "./moduleMatrixRequiredMaps";
import {
  MatrixBoxTracker,
  MatrixCell4,
  ablPctToCell4,
  type TierMetrics,
} from "./moduleMatrixBoxes";

type AblPct = {
  requiredCells: number;
  auditedPct: number;
  builtPct: number;
  livePct: number;
};

type SystemColumn = { id: string; label: string; group: string };

type SystemModuleRow = {
  module: string;
  label: string;
  available: boolean;
  metrics: TierMetrics;
  boxAbl: AblPct;
  columnAbl: Record<string, AblPct>;
  closedCells?: number;
  leafCount?: number;
  modalLeafCount?: number;
  clickedCells?: number;
  frozenOps?: number;
  opsClicked?: number;
  missOpsClicked?: number;
  readyAbl?: AblPct;
  fwAbl?: Record<string, AblPct>;
};

type VerifierModuleRollup = {
  l6: { state: string; stamped: number; unstamped: number };
  bound: { state: string; no: number; unknown: number; yes: number };
  proven: { state: string; true: number; false: number };
  evidence_class: { state: string; prose: number; browser: number; http: number; neon: number };
  route_alive: { state: string; dead: number; alive: number; none: number };
  proof_age: { days: number | null };
};

type SystemPayload = {
  sample: false;
  scope: "system";
  columns: SystemColumn[];
  modules: SystemModuleRow[];
  columnAbl: Record<string, AblPct>;
  system: TierMetrics & {
    moduleCount: number;
    modulesAvailable: number;
    boxAbl: AblPct;
    closedCells?: number;
    leafCount?: number;
    modalLeafCount?: number;
    clickedCells?: number;
    frozenOps?: number;
    opsClicked?: number;
    missOpsClicked?: number;
    readyAbl?: AblPct;
    fwAbl?: Record<string, AblPct>;
  };
  meta?: {
    tipSha?: string;
    probeSource?: string;
    honesty?: string;
    workerState?: "running" | "failed" | "never_started";
    workerError?: string;
    workerFailedAt?: string;
  };
  verifierRollup?: {
    asOf: string;
    healthzSha: string | null;
    modules: Record<string, VerifierModuleRollup>;
  };
};

const POLL_MS = 300_000;
const CLIENT_LAST_GOOD_KEY = "ih35-system-matrix-last-v2";
const EMPTY_ABL: AblPct = { requiredCells: 0, auditedPct: 0, builtPct: 0, livePct: 0 };

const GROUP_ORDER = ["linkage", "money", "chrome", "wiring", "process", "economics", "verifier", "other"];

/** Drawn column ids (C25–C31 + V1–V6) — must appear as identifiers in this file. */
const DRAWN_SCOREBOARD_COLUMN_IDS = [
  "gl_delta",
  "subledger_tie",
  "lifecycle_complete",
  "reversal_symmetry",
  "period_guard",
  "entity_isolation",
  "non_empty_proof",
  "l6",
  "bound",
  "proven",
  "evidence_class",
  "route_alive",
  "proof_age",
] as const;

const EMPTY_VERIFIER_ROLLUP: {
  asOf: string;
  healthzSha: string | null;
  modules: Record<string, VerifierModuleRollup>;
} = { asOf: "", healthzSha: null, modules: {} };

const VerifierRollupContext = createContext(EMPTY_VERIFIER_ROLLUP);

function mergeColumns(api: SystemColumn[]): SystemColumn[] {
  const byId = new Map<string, SystemColumn>();
  for (const c of api) byId.set(c.id, c);
  for (const c of SHARED_SCOREBOARD_COLUMNS) {
    if (!byId.has(c.id)) byId.set(c.id, { id: c.id, label: c.label, group: c.group });
  }
  for (const id of RENDERED_SCOREBOARD_COLUMN_IDS) {
    if (!byId.has(id) && DRAWN_SCOREBOARD_COLUMN_IDS.includes(id as (typeof DRAWN_SCOREBOARD_COLUMN_IDS)[number])) {
      const shared = SHARED_SCOREBOARD_COLUMNS.find((c) => c.id === id);
      if (shared) byId.set(id, { id: shared.id, label: shared.label, group: shared.group });
    }
  }
  return [...byId.values()].sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
    return a.id.localeCompare(b.id);
  });
}

const HEX = { red: "#dc2626", slate: "#334155", muted: "#94a3b8", warn: "#b45309" } as const;

function verifierColor(columnId: string, state: string): string {
  if (columnId === "proof_age") return state === "none" ? HEX.muted : Number(state) > 30 ? HEX.warn : HEX.slate;
  if (columnId === "l6") {
    if (state === "unstamped") return HEX.red;
    if (state === "stamped") return HEX.slate;
    return HEX.muted;
  }
  if (columnId === "bound") {
    if (state === "no") return HEX.red;
    if (state === "unknown") return HEX.warn;
    if (state === "yes") return HEX.slate;
    return HEX.muted;
  }
  if (columnId === "proven") {
    if (state === "false") return HEX.red;
    if (state === "true") return HEX.slate;
    return HEX.muted;
  }
  if (columnId === "evidence_class") {
    if (state === "prose") return HEX.red;
    if (state === "browser") return HEX.warn;
    if (state === "http" || state === "neon") return HEX.slate;
    return HEX.muted;
  }
  if (columnId === "route_alive") {
    if (state === "dead") return HEX.red;
    if (state === "alive") return HEX.slate;
    return HEX.muted;
  }
  return HEX.muted;
}

function worstRank(columnId: string, state: string): number {
  const tables: Record<string, string[]> = {
    l6: ["unstamped", "none", "stamped"],
    bound: ["no", "unknown", "yes"],
    proven: ["false", "none", "true"],
    evidence_class: ["prose", "browser", "http", "neon", "none"],
    route_alive: ["dead", "none", "alive"],
  };
  const order = tables[columnId];
  if (!order) return 0;
  const i = order.indexOf(state);
  return i === -1 ? 99 : i;
}

function pickWorstModule(
  columnId: string,
  modules: Record<string, VerifierModuleRollup>,
): { moduleId: string; row: VerifierModuleRollup } | null {
  const entries = Object.entries(modules);
  if (!entries.length) return null;
  let best: { moduleId: string; row: VerifierModuleRollup } | null = null;
  let bestRank = 999;
  let bestAge = -1;
  for (const [moduleId, row] of entries) {
    if (columnId === "proof_age") {
      const d = row.proof_age.days ?? -1;
      if (d > bestAge) {
        bestAge = d;
        best = { moduleId, row };
      }
      continue;
    }
    const cell = row[columnId as keyof VerifierModuleRollup] as { state: string };
    const r = worstRank(columnId, cell.state);
    if (r < bestRank) {
      bestRank = r;
      best = { moduleId, row };
    }
  }
  return best;
}

function verifierTitle(columnId: string, row: VerifierModuleRollup, moduleId: string): string {
  if (columnId === "l6") {
    return `${moduleId} V1 L6 worst=${row.l6.state} stamped=${row.l6.stamped} unstamped=${row.l6.unstamped}`;
  }
  if (columnId === "bound") {
    return `${moduleId} V2 BOUND worst=${row.bound.state} no=${row.bound.no} unknown=${row.bound.unknown} yes=${row.bound.yes}`;
  }
  if (columnId === "proven") {
    return `${moduleId} V3 PROVEN worst=${row.proven.state} true=${row.proven.true} false=${row.proven.false}`;
  }
  if (columnId === "evidence_class") {
    const e = row.evidence_class;
    return `${moduleId} V4 EVIDENCE worst=${e.state} prose=${e.prose} browser=${e.browser} http=${e.http} neon=${e.neon}`;
  }
  if (columnId === "route_alive") {
    const r = row.route_alive;
    return `${moduleId} V5 ROUTE worst=${r.state} dead=${r.dead} alive=${r.alive} none=${r.none}`;
  }
  if (columnId === "proof_age") {
    return `${moduleId} V6 AGE maxDays=${row.proof_age.days ?? "n/a"}`;
  }
  return moduleId;
}

function VerifierProofCell({
  moduleId,
  columnId,
  testId,
}: {
  moduleId: string;
  columnId: string;
  testId?: string;
}) {
  const rollup = useContext(VerifierRollupContext);
  const isTotal = moduleId === "__system__";
  const picked = isTotal
    ? pickWorstModule(columnId, rollup.modules)
    : { moduleId, row: rollup.modules[moduleId] };
  const row = picked?.row;
  const labelMod = picked?.moduleId ?? moduleId;
  if (!row) {
    return (
      <span
        data-testid={testId}
        title="verifierRollup has no row for this module — worker/CC-2 stamps, not a missing column"
        style={{ color: HEX.muted, fontSize: 11 }}
      >
        no rollup
      </span>
    );
  }
  let text = "—";
  let state = "none";
  if (columnId === "l6") {
    state = row.l6.state;
    text = `${row.l6.state} ${row.l6.unstamped + row.l6.stamped}`;
  } else if (columnId === "bound") {
    state = row.bound.state;
    text = `${row.bound.state} ${row.bound.no + row.bound.unknown + row.bound.yes}`;
  } else if (columnId === "proven") {
    state = row.proven.state;
    text = `${row.proven.false}F/${row.proven.true}T`;
  } else if (columnId === "evidence_class") {
    state = row.evidence_class.state;
    text = `${row.evidence_class.state}`;
  } else if (columnId === "route_alive") {
    state = row.route_alive.state;
    text = `${row.route_alive.state} ${row.route_alive.dead + row.route_alive.alive}`;
  } else if (columnId === "proof_age") {
    const d = row.proof_age.days;
    state = d == null ? "none" : String(d);
    text = d == null ? "—" : `${d}d`;
  }
  return (
    <span
      data-testid={testId}
      title={verifierTitle(columnId, row, labelMod)}
      style={{ color: verifierColor(columnId, state), fontSize: 11, fontWeight: 600 }}
    >
      {text}
    </span>
  );
}

function readClientLastGood(): SystemPayload | undefined {
  try {
    const raw = sessionStorage.getItem(CLIENT_LAST_GOOD_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SystemPayload;
    if (parsed?.scope === "system" && parsed.system && Array.isArray(parsed.modules) && parsed.modules.length > 0) {
      return parsed;
    }
  } catch {
    /* quota / private mode */
  }
  return undefined;
}

function writeClientLastGood(payload: SystemPayload): void {
  try {
    if (payload.meta?.honesty?.includes("REQUIRED-FALLBACK")) return;
    sessionStorage.setItem(CLIENT_LAST_GOOD_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

class SystemMatrixHttpError extends Error {
  status: number;
  tipSha?: string;
  constructor(status: number, message: string, tipSha?: string) {
    super(message);
    this.status = status;
    this.tipSha = tipSha;
  }
}

async function fetchSystemMatrix(): Promise<SystemPayload> {
  // MATRIX-INFINITE-PENDING-FEED: a hung /api fetch (no client-side timeout) left this query's
  // promise permanently unsettled — React Query's retry/error handling only runs on a REJECTED
  // promise, so a stalled connection never surfaced the "unavailable" state; the rollup just sat
  // on "PENDING FEED" forever with zero indication anything was wrong. Same class as
  // LV-COMPLIANCE-FLEET-HOS-DRIVER-DETAIL-INFINITE-LOADING (apps/frontend/src/api/mdata.ts
  // getDriver) — bound the read with AbortSignal.timeout so a stall always resolves to a real
  // rejection instead of hanging.
  const r = await fetch(resolveApiUrl("/api/v1/program/module-matrix?scope=system"), {
    credentials: "include",
    signal: AbortSignal.timeout(20_000),
  });
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("json")) {
    throw new SystemMatrixHttpError(
      r.status || 502,
      `non-JSON matrix response (${ct || "no content-type"}) — proxy 502 HTML will not parse`,
    );
  }
  const json = (await r.json().catch(() => null)) as
    | (SystemPayload & { error?: string; message?: string; tipSha?: string; meta?: { tipSha?: string } })
    | null;
  if (!r.ok) {
    throw new SystemMatrixHttpError(
      r.status,
      json?.message || json?.error || `HTTP ${r.status}`,
      json?.tipSha || json?.meta?.tipSha,
    );
  }
  if (!json || json.scope !== "system" || !json.system) {
    throw new SystemMatrixHttpError(502, "Malformed system matrix payload");
  }
  const honesty = json.meta?.honesty ?? "";
  if (!honesty.includes("REQUIRED-SEED")) {
    writeClientLastGood(json);
  }
  return json;
}

const EMPTY_METRICS: TierMetrics = {
  requiredCells: 0,
  liveCells: 0,
  builtOnlyCells: 0,
  probeOnlyCells: 0,
  auditedOnlyCells: 0,
  unauditedCells: 0,
  buildQueue: 0,
  requiredPct: 0,
  auditedOnlyPct: 0,
  probeOnlyPct: 0,
  builtOnlyPct: 0,
  livePct: 0,
  certifiedPct: 0,
  builtCells: 0,
  leafCount: 0,
};

function isModalishLeaf(id: string, tab: string, sub?: string): boolean {
  return /create|modal|drawer|wizard|popup/i.test(`${id} ${tab} ${sub ?? ""}`);
}

/** Instant paint when the API 502s/hangs — Required counts only; Built/Live/Clicked stay 0. */
export function buildSystemMatrixRequiredFallback(): SystemPayload {
  const colMeta = new Map<string, SystemColumn>();
  const modules: SystemModuleRow[] = [];
  let sysReq = 0;
  let sysLeaves = 0;
  let sysModals = 0;
  const sysCol = new Map<string, number>();

  for (const entry of MATRIX_MODULES_SIDEBAR_ORDER) {
    const map = REQUIRED_BY_MODULE[entry.id];
    if (!map) continue;
    const columnAbl: Record<string, AblPct> = {};
    let req = 0;
    for (const col of map.columns) {
      if (!colMeta.has(col.id)) {
        colMeta.set(col.id, { id: col.id, label: col.label, group: col.group || "other" });
      }
      const n = map.leaves.reduce((acc, lf) => acc + (lf.required.includes(col.id) ? 1 : 0), 0);
      columnAbl[col.id] = { requiredCells: n, auditedPct: 0, builtPct: 0, livePct: 0 };
      sysCol.set(col.id, (sysCol.get(col.id) ?? 0) + n);
      req += n;
    }
    const leaves = map.leaves.length;
    const modals = map.leaves.filter((lf) => isModalishLeaf(lf.id, lf.tab, lf.sub)).length;
    sysReq += req;
    sysLeaves += leaves;
    sysModals += modals;
    const metrics: TierMetrics = {
      ...EMPTY_METRICS,
      requiredCells: req,
      unauditedCells: req,
      leafCount: leaves,
      requiredPct: req === 0 ? 0 : 100,
      buildQueue: req,
    };
    modules.push({
      module: entry.id,
      label: entry.label,
      available: true,
      metrics,
      boxAbl: { requiredCells: req, auditedPct: 0, builtPct: 0, livePct: 0 },
      columnAbl,
      closedCells: 0,
      leafCount: leaves,
      modalLeafCount: modals,
      clickedCells: 0,
      frozenOps: 0,
      opsClicked: 0,
      missOpsClicked: 0,
      readyAbl: EMPTY_ABL,
      fwAbl: Object.fromEntries(FULLY_WIRED_SYSTEM_COLS.map((fw) => [fw.id, EMPTY_ABL])),
    });
  }

  const columns = mergeColumns([...colMeta.values()]);
  const columnAbl: Record<string, AblPct> = {};
  for (const c of columns) {
    columnAbl[c.id] = { requiredCells: sysCol.get(c.id) ?? 0, auditedPct: 0, builtPct: 0, livePct: 0 };
  }
  const boxAbl: AblPct = { requiredCells: sysReq, auditedPct: 0, builtPct: 0, livePct: 0 };
  const emptyFw = Object.fromEntries(FULLY_WIRED_SYSTEM_COLS.map((fw) => [fw.id, EMPTY_ABL]));

  return {
    sample: false,
    scope: "system",
    columns,
    modules,
    columnAbl,
    system: {
      ...EMPTY_METRICS,
      requiredCells: sysReq,
      unauditedCells: sysReq,
      leafCount: sysLeaves,
      requiredPct: sysReq === 0 ? 0 : 100,
      buildQueue: sysReq,
      moduleCount: modules.length,
      modulesAvailable: modules.length,
      boxAbl,
      closedCells: 0,
      modalLeafCount: sysModals,
      clickedCells: 0,
      frozenOps: 0,
      opsClicked: 0,
      missOpsClicked: 0,
      readyAbl: EMPTY_ABL,
      fwAbl: emptyFw,
    },
    meta: {
      probeSource: "committed_fallback",
      honesty:
        "REQUIRED-FALLBACK — API did not return JSON. Box 1 from committed required.json; Built/Live/Clicked are 0 until the API recovers. Not launch truth.",
    },
  };
}

function ablTitle(abl: AblPct): string {
  if (abl.requiredCells <= 0) return "N/A — column not required on this module";
  return `Req ${abl.requiredCells} · Audited ${abl.auditedPct}% · Built ${abl.builtPct}% · Live ${abl.livePct}% · per-cell why (not_built=FIX vs built_unproven=ERRAND) is on the module board`;
}

function moduleMissC(row: SystemModuleRow | undefined): number {
  if (!row) return -1;
  const frozenOps = row.frozenOps ?? 0;
  const opsClicked = row.opsClicked ?? 0;
  return (
    row.missOpsClicked ??
    Math.max(0, frozenOps - Number(row.metrics?.liveCells ?? opsClicked))
  );
}

function AblCell4({
  abl,
  liveOk,
  testId,
}: {
  abl: AblPct;
  liveOk: boolean;
  testId?: string;
}) {
  const boxes = liveOk ? ablPctToCell4(abl) : { req: false, audited: false, built: false, live: false };
  return <MatrixCell4 {...boxes} title={ablTitle(abl)} testId={testId} />;
}

export function ModuleMatrixSystemView() {
  // Distinct from per-module boards (esp. moduleId "system") — see LV-SYSTEM-MATRIX-LEAVES-NOT-ITERABLE.
  const { data, error, isError, isFetched, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ["program", "module-matrix", "scope", "system"],
    queryFn: fetchSystemMatrix,
    placeholderData: () => readClientLastGood() ?? buildSystemMatrixRequiredFallback(),
    refetchInterval: (q) => {
      const honesty = (q.state.data as SystemPayload | undefined)?.meta?.honesty ?? "";
      if (honesty.includes("REQUIRED-SEED")) return 8_000;
      return q.state.status === "error" ? 8_000 : POLL_MS;
    },
    refetchIntervalInBackground: false,
    staleTime: 300_000,
    retry: 1,
  });

  const sys = data?.system;
  const hasLastGoodNumbers = Boolean(
    sys && ((sys.builtCells ?? 0) > 0 || (sys.liveCells ?? 0) > 0 || (sys.boxAbl?.builtPct ?? 0) > 0),
  );
  const workerState = data?.meta?.workerState;
  const projectionFailed = workerState === "failed";
  const workerNeverStarted =
    workerState === "never_started" && Boolean(data?.meta?.honesty?.includes("REQUIRED-SEED")) && !hasLastGoodNumbers;
  const buildingFeed =
    !projectionFailed &&
    !workerNeverStarted &&
    !hasLastGoodNumbers &&
    Boolean(data?.meta?.honesty?.includes("REQUIRED-SEED"));
  const fallbackFeed =
    !hasLastGoodNumbers &&
    !buildingFeed &&
    !projectionFailed &&
    (data?.meta?.probeSource === "committed_fallback" ||
      data?.meta?.honesty?.includes("REQUIRED-FALLBACK") === true);
  const apiLive = Boolean(data?.system) && !fallbackFeed && !buildingFeed && !projectionFailed && !workerNeverStarted && !isError;
  const ok = Boolean(data?.system);
  const httpErr = error instanceof SystemMatrixHttpError ? error : null;
  const tip = data?.meta?.tipSha || httpErr?.tipSha || undefined;

  const columns = mergeColumns(data?.columns ?? []);
  const groupSpans = useMemo(() => {
    const spans: Array<{ group: string; span: number }> = [];
    for (const c of columns) {
      const last = spans[spans.length - 1];
      if (last && last.group === c.group) last.span += 1;
      else spans.push({ group: c.group, span: 1 });
    }
    return spans;
  }, [columns]);

  const orderedRows = useMemo(() => {
    const source =
      data?.modules ??
      MATRIX_MODULES_SIDEBAR_ORDER.map((m) => ({
        module: m.id,
        label: m.label,
        available: false,
        metrics: EMPTY_METRICS,
        boxAbl: EMPTY_ABL,
        columnAbl: {} as Record<string, AblPct>,
      }));
    return sortModulesPriority10First(source);
  }, [data?.modules]);

  const u6Rows = orderedRows.filter((r) => isUrgent6Module(r.module));
  const restUrgentRows = orderedRows.filter((r) => isRestOfUrgentModule(r.module));
  const restRows = orderedRows.filter((r) => !isUrgent6Module(r.module) && !isRestOfUrgentModule(r.module));

  // Feed the tracker with the API's exact integer tallies. Reconstructing counts from rounded
  // percentages can paint 3444/3446 as 3446/3446 and contradict the exact Software total row.
  const trackerMetrics: TierMetrics = useMemo(() => {
    if (!sys?.boxAbl) return EMPTY_METRICS;
    const req = sys.boxAbl.requiredCells || sys.requiredCells || 0;
    const live = sys.liveCells;
    const builtCum = sys.builtCells;
    const auditedCum =
      sys.liveCells + sys.builtOnlyCells + sys.probeOnlyCells + sys.auditedOnlyCells;
    const builtOnly = Math.max(0, builtCum - live);
    const auditedOnly = Math.max(0, auditedCum - builtCum);
    return {
      ...EMPTY_METRICS,
      ...sys,
      requiredCells: req,
      liveCells: live,
      builtOnlyCells: builtOnly,
      auditedOnlyCells: auditedOnly,
      probeOnlyCells: 0,
      unauditedCells: Math.max(0, req - auditedCum),
      builtCells: builtCum,
      livePct: sys.boxAbl.livePct,
      certifiedPct: sys.boxAbl.livePct,
      builtOnlyPct: req ? Math.round((builtOnly / req) * 100) : 0,
      auditedOnlyPct: req ? Math.round((auditedOnly / req) * 100) : 0,
      buildQueue: Math.max(0, req - live),
    };
  }, [sys]);

  const colSpan = 1 + columns.length + 11 + FULLY_WIRED_SYSTEM_COLS.length;
  const verifierRollup = data?.verifierRollup ?? EMPTY_VERIFIER_ROLLUP;

  const renderModuleRow = (row: SystemModuleRow) => {
    const built = row.metrics?.builtCells ?? Math.round(((row.boxAbl?.builtPct ?? 0) / 100) * (row.boxAbl?.requiredCells ?? 0));
    const live = row.metrics?.liveCells ?? Math.round(((row.boxAbl?.livePct ?? 0) / 100) * (row.boxAbl?.requiredCells ?? 0));
    const queue = row.metrics?.buildQueue ?? Math.max(0, (row.boxAbl?.requiredCells ?? 0) - live);
    const closed = row.closedCells ?? 0;
    const leaves = row.leafCount ?? row.metrics?.leafCount ?? 0;
    const modals = row.modalLeafCount ?? 0;
    const clicked = row.clickedCells ?? 0;
    const frozenOps = row.frozenOps ?? 0;
    const opsClicked = row.opsClicked ?? 0;
    const missC =
      row.missOpsClicked ??
      Math.max(0, frozenOps - Number(row.metrics?.liveCells ?? opsClicked));
    return (
      <tr key={row.module} className={row.available ? "" : "dim-row"} data-testid={`system-row-${row.module}`}>
        <td className="sticky-col">
          <b>{row.label}</b>
          <span className="mod-id">{row.module}</span>
        </td>
        {columns.map((c) => {
          const abl = row.columnAbl?.[c.id] ?? EMPTY_ABL;
          return (
            <td key={c.id} className="gc">
              {c.group === "verifier" ? (
                <VerifierProofCell
                  moduleId={row.module}
                  columnId={c.id}
                  testId={`system-${row.module}-${c.id}-cell4`}
                />
              ) : (
                <AblCell4 abl={abl} liveOk={row.available} testId={`system-${row.module}-${c.id}-cell4`} />
              )}
            </td>
          );
        })}
        <td className="sum-val amb">{row.available ? built : "—"}</td>
        <td className="sum-val good">{row.available ? live : "—"}</td>
        <td className="sum-val big">
          {row.available ? (
            <>
              {queue}{" "}
              <EntityLink kind="program_matrix_module" id={row.module} label="Board →" className="board-link" />
            </>
          ) : (
            "—"
          )}
        </td>
        <td className="sum-val amb">{row.available ? closed : "—"}</td>
        <td className="sum-val">{row.available ? leaves : "—"}</td>
        <td className="sum-val">{row.available ? modals : "—"}</td>
        <td className="sum-val good pin-clicked">{row.available ? clicked : "—"}</td>
        <td className="sum-val">{row.available ? frozenOps : "—"}</td>
        <td className="sum-val">{row.available ? opsClicked : "—"}</td>
        <td className="sum-val big">{row.available ? missC : "—"}</td>
        <td className="gc">
          {row.available ? (
            <AblCell4
              abl={row.readyAbl ?? EMPTY_ABL}
              liveOk={row.available}
              testId={`system-${row.module}-ready-cell4`}
            />
          ) : (
            "—"
          )}
        </td>
        {FULLY_WIRED_SYSTEM_COLS.map((fw) => (
          <td key={fw.id} className="gc">
            <AblCell4
              abl={row.fwAbl?.[fw.id] ?? EMPTY_ABL}
              liveOk={row.available}
              testId={`system-${row.module}-${fw.id}-cell4`}
            />
          </td>
        ))}
      </tr>
    );
  };

  return (
    <VerifierRollupContext.Provider value={verifierRollup}>
    <>
      {projectionFailed ? (
        <div className="banner" data-testid="module-matrix-system-projection-failed" role="alert">
          <b>SCOREBOARD PROJECTION FAILED — Boxes 2/3/4 are not computable. This is not progress and not launch truth.</b>{" "}
          {data?.meta?.workerError ? <code>{data.meta.workerError}</code> : null}
          {data?.meta?.workerFailedAt ? <> · {ctDateTime(data.meta.workerFailedAt)}</> : null}
        </div>
      ) : workerNeverStarted ? (
        <div className="banner" data-testid="module-matrix-system-worker-never-started" role="alert">
          <b>SCOREBOARD WORKER NEVER SPAWNED — Boxes 2/3/4 are not computable.</b>
        </div>
      ) : buildingFeed ? (
        <div className="banner" data-testid="module-matrix-system-building">
          <b>Scoreboard is computing in the background — the API is up.</b> You are seeing Required
          cell counts only until the worker finishes. This is not a 502 and not launch truth.
        </div>
      ) : httpErr?.status === 401 ? (
        <div className="banner" data-testid="module-matrix-system-session-expired" role="alert">
          <b>SESSION EXPIRED — sign in again.</b> The scoreboard API returned HTTP 401. This is not an
          outage and not launch truth. Boxes 2/3/4 are hidden until you have a session.
        </div>
      ) : fallbackFeed || (isFetched && isError && !hasLastGoodNumbers) ? (
        <div className="banner" data-testid="module-matrix-system-unavailable">
          <b>API FEED UNAVAILABLE — showing Required skeleton.</b> Could not load{" "}
          <code>GET /api/v1/program/module-matrix?scope=system</code>
          {httpErr ? (
            <>
              {" "}
              · HTTP {httpErr.status}
              {httpErr.message ? <> · {httpErr.message}</> : null}
            </>
          ) : (
            <> · waiting for JSON (proxy 502 / hang). Box 1 is committed maps. Built/Live/Clicked stay 0 until the API recovers — not launch truth.</>
          )}
          {tip ? (
            <>
              {" "}
              · tip <code>{tip}</code>
            </>
          ) : null}
          .
        </div>
      ) : apiLive ? (
        <div className="banner live" data-testid="module-matrix-system-live">
          <b>Clicked count ≠ Fully-Wired launch.</b> The big Clicked number is credited cells.
          Columns <b>1 Place … 11 Guard</b> already exist on this board — 4th ✓ = Box 4 Live on that
          item's mapped Required cells (same as Miss C). Column <b>12 Clicked</b> is 4/4 only when
          Clicked = every Required cell. Partial = yellow/red until 100%.
          Urgent 6 = accounting → banking → settlements → factoring → dispatch → vendors. Finish leftover
          Live cells <b>vertically by column</b> ({VERTICAL_CERTIFY_COL_LABEL}), then rest of urgent
          (customers → drivers → fleet → lists). FAST-MERGE {FAST_MERGE_STATUS} (4–5 min).
          Five scenario events are not a 5th Box and not new Required.json leaves (maps
          frozen). They are named hops on Program: revrec · invoice+evidence · bank-path · real fuel ·
          factoring advance. CC-1 still owes them when Miss C is 0.
          Do not add a 5th Verified Box. Owner 2026-08-28: C25–C31 are seven Required columns (group economics), not one consolidated “13 GL Δ” strip. Ignore Box 4 keyword fan-out. Money
          cells count in Frozen / Miss C / READY. Miss C = Required cells that are not Box 4 Live (Clicked
          100% does not zero Miss C). READY Live✓ when Miss C = 0.
          Launch ladder columns (Wave / Vertical COL / FAST-MERGE / FW 1–11 / Live 12 / Certify) sit on
          this board so the plan cannot be forgotten. Grid order: U6 → rest of urgent → WAVE2 remainder
          ({restRows.length}).
          {tip ? (
            <>
              {" "}
              · tip <code>{tip}</code>
            </>
          ) : null}
          <span data-testid="module-matrix-verifier-freshness">
            {" "}
            · V1–V6 live asOf <code>{verifierRollup.asOf || "—"}</code> healthzSha{" "}
            <code>{verifierRollup.healthzSha || "—"}</code>
            {" "}
            · red V after prose-193 is live truth (not a frozen rollup)
          </span>
          {dataUpdatedAt ? (
            <>
              {" "}
              · refreshed{" "}
              {new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Chicago",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              }).format(new Date(dataUpdatedAt))}{" "}
              CT
              {isFetching ? " (polling…)" : null}
            </>
          ) : null}
          .
        </div>
      ) : (
        <div className="banner">Loading system matrix rollup…</div>
      )}

      <div className="launch-ladder-wrap" data-testid="module-matrix-launch-ladder">
        <h2 data-testid="module-matrix-launch-ladder-heading">
          Launch ladder{" "}
          <span className="sub">
            own columns (not Required.json) · U6 then rest of urgent · FAST-MERGE {FAST_MERGE_STATUS} ·
            vertical {VERTICAL_CERTIFY_COL_LABEL} · Certify = Miss C 0 + FW 1–12
          </span>
        </h2>
        <table className="launch-ladder" data-testid="module-matrix-launch-ladder-table">
          <thead>
            <tr>
              <th>Seq</th>
              <th>Wave</th>
              <th>Module</th>
              <th title="Drain one column across U6, then the next column">Vertical COL</th>
              <th title="docs/bus/FAST-MERGE-4MIN-LAW.md">FAST-MERGE</th>
              <th title="Fully-Wired items 1–11 (Built / Box 3)">FW 1–11</th>
              <th title="Fully-Wired item 12 = Box 4 Live">Live 12</th>
              <th title="CERTIFY only when Miss C is 0 on this module">Certify</th>
            </tr>
          </thead>
          <tbody>
            {[...URGENT_6_MODULE_IDS, ...REST_OF_URGENT_MODULE_IDS].map((mod, i) => {
              const row = orderedRows.find((r) => r.module === mod);
              const missC = moduleMissC(row);
              const builtPct = row?.boxAbl?.builtPct ?? 0;
              const livePct = row?.boxAbl?.livePct ?? 0;
              const certify = apiLive && missC === 0;
              const band = launchWaveForModule(mod);
              return (
                <tr key={mod} data-testid={`launch-ladder-row-${mod}`}>
                  <td>{i + 1}</td>
                  <td className={band === "U6" ? "wave-u6" : "wave-rest"}>{band}</td>
                  <td>
                    <b>{row?.label ?? mod}</b>
                    <span className="mod-id">{mod}</span>
                    {row ? (
                      <EntityLink kind="program_matrix_module" id={row.module} label="Board →" className="board-link" />
                    ) : null}
                  </td>
                  <td className="vert-col">{VERTICAL_CERTIFY_COL_LABEL}</td>
                  <td>ON · 4min</td>
                  <td>{row?.available ? `${builtPct}%` : "—"}</td>
                  <td>{row?.available ? `${livePct}%` : "—"}</td>
                  <td className={certify ? "certify-yes" : "certify-open"}>
                    {apiLive ? (certify ? "CERTIFY" : `OPEN Miss C ${missC}`) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <MatrixBoxTracker
        boardKey="system"
        metrics={trackerMetrics}
        liveOk={ok}
        dataUpdatedAt={dataUpdatedAt}
        showChanges={false}
      />

      {sys ? (
        <div className="metrics metrics-secondary" data-testid="module-matrix-system-ready-kpis">
          <div className={`metric ${apiLive && (sys.missOpsClicked ?? 0) === 0 ? "good" : "amb"}`}>
            <div className="n" data-testid="module-matrix-kpi-frozen">
              {ok ? `${sys.opsClicked ?? 0} of ${sys.frozenOps ?? 0}` : "—"}
            </div>
            <div className="l">
              Frozen
              <br />
              ops Clicked of frozen cells
            </div>
          </div>
          <div className={`metric ${apiLive && (sys.missOpsClicked ?? 0) > 0 ? "big" : apiLive ? "good" : "amb"}`}>
            <div className="n" data-testid="module-matrix-kpi-miss-c">
              {ok ? `${sys.missOpsClicked ?? 0} of ${sys.frozenOps ?? 0}` : "—"}
            </div>
            <div className="l">
              Miss C
              <br />
              unpaid Live of frozen (money in)
            </div>
          </div>
          <p className="miss-c-stale-work" data-testid="module-matrix-miss-c-stale-work">
            If this Miss C count did not drop after a merge, Clicked-only work does not lower Miss C.
            Only Box 4 Live on frozen cells (including money) lowers it.
          </p>
          <div className="metric">
            <div className="n">{ok ? (sys.closedCells ?? "—") : "—"}</div>
            <div className="l">
              Named
              <br />
              ledger `leaf:col` allowlist
            </div>
          </div>
          <div className="metric">
            <div className="n">{ok ? (sys.leafCount ?? "—") : "—"}</div>
            <div className="l">
              Leaves
              <br />
              required.json surfaces
            </div>
          </div>
          <div className="metric">
            <div className="n">{ok ? (sys.modalLeafCount ?? "—") : "—"}</div>
            <div className="l">
              Modals
              <br />
              create/drawer/wizard leaves
            </div>
          </div>
          <div className="metric good">
            <div className="n">{ok ? (sys.clickedCells ?? "—") : "—"}</div>
            <div className="l">
              Clicked
              <br />
              Chrome USMCA all cells
            </div>
          </div>
        </div>
      ) : null}
      <p className="foot" data-testid="module-matrix-kpi-glossary">
        <b>Named</b> = PROD-VERIFIED rows with an explicit <code>leaf:col</code> (not Box 4 fan-out).{" "}
        <b>Leaves</b> = required-map surfaces (tabs/pages), not cells. <b>Modals</b> = those leaves whose
        id looks like create/modal/drawer/wizard. <b>Clicked</b> = Chrome USMCA click credit (1–3 exact
        cells; same as column 12 Clicked). Frozen / Miss C include money. Miss C is unpaid Live, not unpaid Clicked.
      </p>

      <div className="legend" data-testid="module-matrix-system-legend">
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

      <h2 data-testid="module-matrix-proof-strip-heading">
        L6 · Clicked · Guard — Urgent 6 and Urgent 14{" "}
        <span className="sub">
          Always on screen. The wide board still has every column; scroll it for LINK/MONEY. Empty cells say
          &quot;no rollup&quot; until CC-2 stamps and the matrix worker lands — that is not a missing column.
        </span>
      </h2>
      <div className="scroll" data-testid="module-matrix-proof-strip">
        <table className="proof-strip-table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Wave</th>
              <th>V1 L6</th>
              <th>Clicked</th>
              <th>Ops click</th>
              <th>Miss C</th>
              <th>11 Guard</th>
              <th>12 Clicked</th>
            </tr>
          </thead>
          <tbody>
            {orderedRows
              .filter((r) => isUrgent6Module(r.module) || isUrgent14Module(r.module))
              .map((row) => {
                const clicked = row.clickedCells ?? 0;
                const frozenOps = row.frozenOps ?? 0;
                const opsClicked = row.opsClicked ?? 0;
                const missC =
                  row.missOpsClicked ??
                  Math.max(0, frozenOps - Number(row.metrics?.liveCells ?? opsClicked));
                return (
                  <tr key={`proof-${row.module}`} data-testid={`proof-row-${row.module}`}>
                    <td>
                      <b>{row.label}</b>
                      <span className="mod-id">{row.module}</span>
                    </td>
                    <td>{launchWaveForModule(row.module)}</td>
                    <td>
                      <VerifierProofCell moduleId={row.module} columnId="l6" testId={`proof-${row.module}-l6`} />
                    </td>
                    <td className="sum-val good">{row.available ? clicked : "—"}</td>
                    <td>{row.available ? opsClicked : "—"}</td>
                    <td className="sum-val big">{row.available ? missC : "—"}</td>
                    <td className="gc">
                      <AblCell4
                        abl={row.fwAbl?.fw11_guard ?? EMPTY_ABL}
                        liveOk={row.available}
                        testId={`proof-${row.module}-fw11`}
                      />
                    </td>
                    <td className="gc">
                      <AblCell4
                        abl={row.fwAbl?.fw12_live ?? EMPTY_ABL}
                        liveOk={row.available}
                        testId={`proof-${row.module}-fw12`}
                      />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <h2 data-testid="module-matrix-system-heading">
        All modules matrix{" "}
        <span className="sub">
          U6 → rest of urgent → WAVE2 · left = module · top = same columns · cell = R / A / B / L
        </span>
      </h2>

      <div className="scroll scroll-system">
        <div className="overflow-x-auto">
          <table className="system-table system-column-board" data-testid="module-matrix-system-table">
            <thead>
              <tr>
                <th className="sticky-col leaf" rowSpan={2}>
                  Module
                </th>
                {groupSpans.map((g) => (
                  <th key={g.group} className="grp" colSpan={g.span} title={g.group}>
                    {matrixGroupHeaderLabel(g.group)}
                  </th>
                ))}
                <th className="sum-col" rowSpan={2} data-testid="module-matrix-system-built-col">
                  Built
                </th>
                <th className="sum-col" rowSpan={2}>
                  Live
                </th>
                <th className="sum-col" rowSpan={2}>
                  Queue
                </th>
                <th className="sum-col" rowSpan={2} title="Named `leaf:col` allowlist — not Box 4">
                  Named
                </th>
                <th className="sum-col" rowSpan={2} title="Required-map leaf count">
                  Leaves
                </th>
                <th className="sum-col" rowSpan={2} title="Leaves whose id/tab looks like create/modal/drawer/wizard">
                  Modals
                </th>
                <th className="sum-col pin-clicked" rowSpan={2} title="Clicked Chrome — USMCA only">
                  Clicked
                </th>
                <th className="sum-col" rowSpan={2} title="Frozen Required (all groups including money)">
                  Frozen
                </th>
                <th className="sum-col" rowSpan={2} title="USMCA Clicked on frozen ops cells">
                  Ops click
                </th>
                <th className="sum-col" rowSpan={2} title="True missing — frozen ops cells with no USMCA Clicked">
                  Miss C
                </th>
                <th className="sum-col" rowSpan={2} title="Live ✓ only at 100% Frozen=Ops click and Built. Not Box 4.">
                  READY
                </th>
                <th className="grp" colSpan={FULLY_WIRED_SYSTEM_COLS.length} title="fully_wired">
                  {matrixGroupHeaderLabel("fully_wired")}
                </th>
              </tr>
              <tr>
                {columns.map((c) => (
                  <th key={c.id} className="col" title={c.label}>
                    {matrixColumnHeaderLabel(c.id, c.label)}
                  </th>
                ))}
                {FULLY_WIRED_SYSTEM_COLS.map((fw) => (
                  <th key={fw.id} className="col" title={fw.label}>
                    {fw.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="section" data-testid="module-matrix-system-section-u6">
                <td colSpan={colSpan}>Urgent 6 — certify now (accounting → banking → settlements → factoring → dispatch → vendors)</td>
              </tr>
              {u6Rows.map((row) => (
                <Fragment key={row.module}>{renderModuleRow(row)}</Fragment>
              ))}
              <tr className="section" data-testid="module-matrix-system-section-rest-urgent">
                <td colSpan={colSpan}>
                  Urgent 14 remainder (customers → drivers → fleet → lists) — leftover unique FINDING only; never recertify
                </td>
              </tr>
              {restUrgentRows.map((row) => (
                <Fragment key={row.module}>{renderModuleRow(row)}</Fragment>
              ))}
              <tr className="section" data-testid="module-matrix-system-section-rest">
                <td colSpan={colSpan}>WAVE 2 remainder — after rest of urgent</td>
              </tr>
              {restRows.map((row) => (
                <Fragment key={row.module}>{renderModuleRow(row)}</Fragment>
              ))}
            </tbody>
            {sys ? (
              <tfoot>
                <tr className="system-total">
                  <td className="sticky-col">
                    <b>Software total</b>
                    <span className="mod-id">
                      {sys.modulesAvailable}/{sys.moduleCount} boards
                    </span>
                  </td>
                  {columns.map((c) => (
                    <td key={c.id} className="gc">
                      {c.group === "verifier" ? (
                        <VerifierProofCell
                          moduleId="__system__"
                          columnId={c.id}
                          testId={`system-total-${c.id}-cell4`}
                        />
                      ) : (
                        <AblCell4
                          abl={data?.columnAbl?.[c.id] ?? EMPTY_ABL}
                          liveOk={ok}
                          testId={`system-total-${c.id}-cell4`}
                        />
                      )}
                    </td>
                  ))}
                  <td className="sum-val amb">{sys.builtCells ?? "—"}</td>
                  <td className="sum-val good">{sys.liveCells ?? "—"}</td>
                  <td className="sum-val big">{sys.buildQueue ?? "—"}</td>
                  <td className="sum-val amb">{sys.closedCells ?? "—"}</td>
                  <td className="sum-val">{sys.leafCount ?? "—"}</td>
                  <td className="sum-val">{sys.modalLeafCount ?? "—"}</td>
                  <td className="sum-val good pin-clicked">{sys.clickedCells ?? "—"}</td>
                  <td className="sum-val">{sys.frozenOps ?? "—"}</td>
                  <td className="sum-val">{sys.opsClicked ?? "—"}</td>
                  <td className="sum-val big">{sys.missOpsClicked ?? "—"}</td>
                  <td className="gc">
                    <AblCell4
                      abl={data?.system?.readyAbl ?? EMPTY_ABL}
                      liveOk={ok}
                      testId="system-total-ready-cell4"
                    />
                  </td>
                  {FULLY_WIRED_SYSTEM_COLS.map((fw) => (
                    <td key={fw.id} className="gc">
                      <AblCell4
                        abl={data?.system?.fwAbl?.[fw.id] ?? EMPTY_ABL}
                        liveOk={ok}
                        testId={`system-total-${fw.id}-cell4`}
                      />
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </>
    </VerifierRollupContext.Provider>
  );
}
