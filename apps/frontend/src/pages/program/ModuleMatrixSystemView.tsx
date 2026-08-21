/**
 * System-wide module matrix — SAME column groups + SAME 4-box ✓/●/✕ chrome as each module board.
 * Rows = modules (priority 10 first, then remainder) · columns = LINK/MONEY/CHROME/WIRE/PROC atoms.
 * Each cell = MatrixCell4 from column Abl rollup (tooltip keeps Audited%·Built%·Live% detail).
 */
import { Fragment, useMemo } from "react";
import { EntityLink } from "../../components/shared/EntityLink";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import {
  MATRIX_MODULES_SIDEBAR_ORDER,
  URGENT_16_MODULE_IDS,
  isUrgent16Module,
  matrixColumnHeaderLabel,
  matrixGroupHeaderLabel,
  sortModulesPriority10First,
  FULLY_WIRED_SYSTEM_COLS,
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
  meta?: { tipSha?: string; probeSource?: string; honesty?: string };
};

const POLL_MS = 300_000;
const EMPTY_ABL: AblPct = { requiredCells: 0, auditedPct: 0, builtPct: 0, livePct: 0 };

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
  const GROUP_ORDER = ["linkage", "money", "chrome", "wiring", "process", "other"];
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

  const columns = [...colMeta.values()].sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
    return a.id.localeCompare(b.id);
  });
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
  return `Req ${abl.requiredCells} · Audited ${abl.auditedPct}% · Built ${abl.builtPct}% · Live ${abl.livePct}%`;
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
    placeholderData: buildSystemMatrixRequiredFallback,
    refetchInterval: (q) => (q.state.status === "error" ? 60_000 : POLL_MS),
    refetchIntervalInBackground: false,
    staleTime: 300_000,
    retry: 1,
  });

  const fallbackFeed =
    data?.meta?.probeSource === "committed_fallback" ||
    data?.meta?.honesty?.includes("REQUIRED-FALLBACK") === true;
  const apiLive = Boolean(data?.system) && !fallbackFeed && !isError;
  const ok = Boolean(data?.system);
  const sys = data?.system;
  const httpErr = error instanceof SystemMatrixHttpError ? error : null;
  const tip = data?.meta?.tipSha || httpErr?.tipSha || undefined;

  const columns = data?.columns ?? [];
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

  const priorityRows = orderedRows.filter((r) => isUrgent16Module(r.module));
  const restRows = orderedRows.filter((r) => !isUrgent16Module(r.module));

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
              <AblCell4 abl={abl} liveOk={row.available} testId={`system-${row.module}-${c.id}-cell4`} />
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
        <td className="sum-val good">{row.available ? clicked : "—"}</td>
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
    <>
      {fallbackFeed || (isFetched && isError) ? (
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
          <b>Clicked count ≠ 12 Clicked green.</b> The big Clicked number is credited cells.
          Columns <b>1–11</b> 4th ✓ = Chrome Clicked on that item's mapped Required cells (not keyword
          Live). Column <b>12 Clicked</b> is 4/4 only when Clicked = every Required cell. Partial =
          yellow/red until 100%.
          Urgent-6 100% = Fully-Wired 1–12 on accounting→customers→drivers→vendors→dispatch→safety.
          Do not add leaves. Ignore Box 4 keyword fan-out. Money cells count in Frozen / Miss C / READY. Miss C = Required cells that are not Box 4 Live (Clicked 100% does not zero Miss C). READY Live✓ when Miss C = 0.
          Urgent 16 A–Z first ({URGENT_16_MODULE_IDS.length}), then remainder A–Z ({restRows.length}).
          {tip ? (
            <>
              {" "}
              · tip <code>{tip}</code>
            </>
          ) : null}
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

      <h2 data-testid="module-matrix-system-heading">
        All modules matrix{" "}
        <span className="sub">
          urgent 16 A–Z → rest A–Z · left = module · top = same columns · cell = R / A / B / L
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
                <th className="sum-col" rowSpan={2} title="Clicked Chrome — USMCA only">
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
              <tr className="section" data-testid="module-matrix-system-section-priority-10">
                <td colSpan={colSpan}>Urgent 16 — A–Z</td>
              </tr>
              {priorityRows.map((row) => (
                <Fragment key={row.module}>{renderModuleRow(row)}</Fragment>
              ))}
              <tr className="section" data-testid="module-matrix-system-section-rest">
                <td colSpan={colSpan}>Remaining modules</td>
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
                      <AblCell4
                        abl={data?.columnAbl?.[c.id] ?? EMPTY_ABL}
                        liveOk={ok}
                        testId={`system-total-${c.id}-cell4`}
                      />
                    </td>
                  ))}
                  <td className="sum-val amb">{sys.builtCells ?? "—"}</td>
                  <td className="sum-val good">{sys.liveCells ?? "—"}</td>
                  <td className="sum-val big">{sys.buildQueue ?? "—"}</td>
                  <td className="sum-val amb">{sys.closedCells ?? "—"}</td>
                  <td className="sum-val">{sys.leafCount ?? "—"}</td>
                  <td className="sum-val">{sys.modalLeafCount ?? "—"}</td>
                  <td className="sum-val good">{sys.clickedCells ?? "—"}</td>
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
  );
}
