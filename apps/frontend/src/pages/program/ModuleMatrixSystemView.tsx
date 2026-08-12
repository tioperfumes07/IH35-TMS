/**
 * System-wide module matrix — SAME column groups + SAME 4-box ✓/●/✕ chrome as each module board.
 * Rows = modules (priority 10 first, then remainder) · columns = LINK/MONEY/CHROME/WIRE/PROC atoms.
 * Each cell = MatrixCell4 from column Abl rollup (tooltip keeps Audited%·Built%·Live% detail).
 */
import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import {
  MATRIX_MODULES_SIDEBAR_ORDER,
  PRIORITY_10_MODULE_IDS,
  isPriority10Module,
  matrixColumnHeaderLabel,
  matrixGroupHeaderLabel,
  sortModulesPriority10First,
} from "./moduleMatrixCatalog";
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
  };
  meta?: { tipSha?: string; probeSource?: string; honesty?: string };
};

const POLL_MS = 5000;
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
  const r = await fetch(resolveApiUrl("/api/v1/program/module-matrix?scope=system"), {
    credentials: "include",
  });
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
  const { data, error, isError, isFetched, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ["program", "module-matrix", "system"],
    queryFn: fetchSystemMatrix,
    refetchInterval: POLL_MS,
    staleTime: 0,
    retry: 1,
  });

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

  const priorityRows = orderedRows.filter((r) => isPriority10Module(r.module));
  const restRows = orderedRows.filter((r) => !isPriority10Module(r.module));

  // Feed 4-box tracker with cumulative counts reconstructed from boxAbl %
  const trackerMetrics: TierMetrics = useMemo(() => {
    if (!sys?.boxAbl) return EMPTY_METRICS;
    const req = sys.boxAbl.requiredCells || sys.requiredCells || 0;
    const live = Math.round((sys.boxAbl.livePct / 100) * req);
    const builtCum = Math.round((sys.boxAbl.builtPct / 100) * req);
    const auditedCum = Math.round((sys.boxAbl.auditedPct / 100) * req);
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

  const colSpan = 1 + columns.length + 3;

  const renderModuleRow = (row: SystemModuleRow) => {
    const built = row.metrics?.builtCells ?? Math.round(((row.boxAbl?.builtPct ?? 0) / 100) * (row.boxAbl?.requiredCells ?? 0));
    const live = row.metrics?.liveCells ?? Math.round(((row.boxAbl?.livePct ?? 0) / 100) * (row.boxAbl?.requiredCells ?? 0));
    const queue = row.metrics?.buildQueue ?? Math.max(0, (row.boxAbl?.requiredCells ?? 0) - live);
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
              <AblCell4 abl={abl} liveOk={ok && row.available} testId={`system-${row.module}-${c.id}-cell4`} />
            </td>
          );
        })}
        <td className="sum-val amb">{row.available ? built : "—"}</td>
        <td className="sum-val good">{row.available ? live : "—"}</td>
        <td className="sum-val big">
          {row.available ? (
            <>
              {queue}{" "}
              <Link to={`/program/matrix?module=${row.module}`} className="board-link">
                Board →
              </Link>
            </>
          ) : (
            "—"
          )}
        </td>
      </tr>
    );
  };

  return (
    <>
      {isFetched && (!ok || isError) ? (
        <div className="banner" data-testid="module-matrix-system-unavailable">
          <b>SYSTEM ROLLUP UNAVAILABLE.</b> Could not load{" "}
          <code>GET /api/v1/program/module-matrix?scope=system</code>
          {httpErr ? (
            <>
              {" "}
              · HTTP {httpErr.status}
              {httpErr.message ? <> · {httpErr.message}</> : null}
            </>
          ) : null}
          {tip ? (
            <>
              {" "}
              · tip <code>{tip}</code>
            </>
          ) : null}
          .
        </div>
      ) : ok ? (
        <div className="banner live" data-testid="module-matrix-system-live">
          <b>ALL MODULES — SAME 4-BOX MATRIX.</b> Same LINK · MONEY · CHROME · WIRE columns and ✓/●/✕
          cells as each module board. Rows: <b>priority 10 first</b> ({PRIORITY_10_MODULE_IDS.length}), then
          remainder ({restRows.length}). Hover a cell for Audited% · Built% · Live% detail.
          {tip ? (
            <>
              {" "}
              · tip <code>{tip}</code>
            </>
          ) : null}
          {dataUpdatedAt ? (
            <>
              {" "}
              · refreshed {new Date(dataUpdatedAt).toLocaleTimeString()}
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
          priority 10 → rest · left = module · top = same columns · cell = R / A / B / L
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
              </tr>
              <tr>
                {columns.map((c) => (
                  <th key={c.id} className="col" title={c.label}>
                    {matrixColumnHeaderLabel(c.id, c.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="section" data-testid="module-matrix-system-section-priority-10">
                <td colSpan={colSpan}>Priority 10 — most urgent</td>
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
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </>
  );
}
