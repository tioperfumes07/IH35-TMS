/**
 * System-wide module matrix — same column groups as each module board.
 * Rows = modules · columns = LINK/MONEY/CHROME/WIRE/PROC atoms.
 * Each cell = Audited% · Built% · Live% (Box 2/3/4 cumulative fill).
 */
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import { MATRIX_MODULES_SIDEBAR_ORDER, matrixColumnHeaderLabel, matrixGroupHeaderLabel } from "./moduleMatrixCatalog";
import {
  MatrixBoxTracker,
  pctClass,
  type TierMetrics,
} from "./moduleMatrixBoxes";

type AblPct = {
  requiredCells: number;
  auditedPct: number;
  builtPct: number;
  livePct: number;
};

type SystemColumn = { id: string; label: string; group: string };

type SystemPayload = {
  sample: false;
  scope: "system";
  columns: SystemColumn[];
  modules: Array<{
    module: string;
    label: string;
    available: boolean;
    metrics: TierMetrics;
    boxAbl: AblPct;
    columnAbl: Record<string, AblPct>;
  }>;
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

/** Triple % for Box 2 / 3 / 4 — audited · built · live */
function TripleAbl({ abl, liveOk, testId }: { abl: AblPct; liveOk: boolean; testId?: string }) {
  if (!liveOk || abl.requiredCells <= 0) {
    return (
      <span className="abl-triple dim" data-testid={testId}>
        —
      </span>
    );
  }
  return (
    <span className="abl-triple" data-testid={testId} title={`Req ${abl.requiredCells}`}>
      <span className={`abl a ${pctClass(abl.auditedPct)}`}>{abl.auditedPct}%</span>
      <span className="abl-sep">·</span>
      <span className={`abl b ${pctClass(abl.builtPct)}`}>{abl.builtPct}%</span>
      <span className="abl-sep">·</span>
      <span className={`abl l ${pctClass(abl.livePct)}`}>{abl.livePct}%</span>
    </span>
  );
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

  const rows =
    data?.modules ??
    MATRIX_MODULES_SIDEBAR_ORDER.map((m) => ({
      module: m.id,
      label: m.label,
      available: false,
      metrics: EMPTY_METRICS,
      boxAbl: EMPTY_ABL,
      columnAbl: {} as Record<string, AblPct>,
    }));

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
    };
  }, [sys]);

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
          <b>SYSTEM ROLLUP — {sys?.moduleCount ?? 29} MODULES.</b> Same columns as each module board
          (LINK · MONEY · CHROME · WIRE). Each cell ={" "}
          <b>Audited% · Built% · Live%</b> (Box 2/3/4 fill ÷ Required).
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

      <div className="legend" data-testid="module-matrix-abl-legend">
        <span>
          Cell format: <b>Audited% · Built% · Live%</b> (Box 2 · 3 · 4 cumulative fill)
        </span>
        <span className="abl-triple demo">
          <span className="abl a hi">86%</span>
          <span className="abl-sep">·</span>
          <span className="abl b mid">82%</span>
          <span className="abl-sep">·</span>
          <span className="abl l lo">3%</span>
        </span>
      </div>

      <h2>
        All modules × all columns{" "}
        <span className="sub">scroll → · click module name for full leaf board</span>
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
                <th className="sum-col" rowSpan={2} title="Module Box 2 · 3 · 4">
                  Module
                  <br />
                  A · B · L
                </th>
                <th className="sum-col" rowSpan={2}>
                  Open
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
              {rows.map((row) => (
                <tr key={row.module} className={row.available ? "" : "dim-row"}>
                  <td className="sticky-col">
                    <b>{row.label}</b>
                    <span className="mod-id">{row.module}</span>
                  </td>
                  {columns.map((c) => {
                    const abl = row.columnAbl?.[c.id] ?? EMPTY_ABL;
                    return (
                      <td key={c.id} className="gc abl-cell">
                        <TripleAbl
                          abl={abl}
                          liveOk={ok && row.available}
                          testId={`system-${row.module}-${c.id}-abl`}
                        />
                      </td>
                    );
                  })}
                  <td className="sum-val abl-cell">
                    <TripleAbl
                      abl={row.boxAbl ?? EMPTY_ABL}
                      liveOk={ok && row.available}
                      testId={`system-${row.module}-total-abl`}
                    />
                  </td>
                  <td>
                    {row.available ? (
                      <Link to={`/program/matrix?module=${row.module}`}>Board →</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
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
                    <td key={c.id} className="gc abl-cell">
                      <TripleAbl
                        abl={data?.columnAbl?.[c.id] ?? EMPTY_ABL}
                        liveOk={ok}
                        testId={`system-total-${c.id}-abl`}
                      />
                    </td>
                  ))}
                  <td className="sum-val abl-cell">
                    <TripleAbl
                      abl={sys.boxAbl ?? EMPTY_ABL}
                      liveOk={ok}
                      testId="system-total-abl"
                    />
                  </td>
                  <td>—</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </>
  );
}
