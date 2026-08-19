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
  URGENT_14_MODULE_IDS,
  isUrgent14Module,
  matrixColumnHeaderLabel,
  matrixGroupHeaderLabel,
  sortModulesPriority10First,
  FULLY_WIRED_SYSTEM_COLS,
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
  // Distinct from per-module boards (esp. moduleId "system") — see LV-SYSTEM-MATRIX-LEAVES-NOT-ITERABLE.
  const { data, error, isError, isFetched, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ["program", "module-matrix", "scope", "system"],
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

  const priorityRows = orderedRows.filter((r) => isUrgent14Module(r.module));
  const restRows = orderedRows.filter((r) => !isUrgent14Module(r.module));

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
    const missC = row.missOpsClicked ?? Math.max(0, frozenOps - opsClicked);
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
              liveOk={ok && row.available}
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
              liveOk={ok && row.available}
              testId={`system-${row.module}-${fw.id}-cell4`}
            />
          </td>
        ))}
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
          <b>FROZEN MAP. READY is the 100.</b> Do not add leaves. Ignore Box 4 Live. MONEY parked.
          READY Live✓ only when Miss C = 0 on frozen ops (non-money) USMCA Clicked+Built. Miss C = true
          unpaid. LINK/MONEY/CHROME/WIRE/PROC kept. Urgent 14 first ({URGENT_14_MODULE_IDS.length}), then
          remainder ({restRows.length}).
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
                <th className="sum-col" rowSpan={2} title="Frozen ops Required (excludes money group)">
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
                <td colSpan={colSpan}>Urgent 14 — owner seq</td>
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
