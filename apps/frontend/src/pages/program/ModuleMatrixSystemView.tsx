/**
 * System-wide module matrix rollup — same 4-box + column-group columns as each module board.
 * Box 3 / Box 4 show both percentages (fill · wire / live · cert) side by side.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import { MATRIX_MODULES_SIDEBAR_ORDER } from "./moduleMatrixCatalog";
import {
  DualPct,
  GroupRollupTable,
  MatrixBoxTracker,
  builtDualPcts,
  liveDualPcts,
  pctClass,
  type GroupRollup,
  type TierMetrics,
} from "./moduleMatrixBoxes";

type SystemPayload = {
  sample: false;
  scope: "system";
  modules: Array<{
    module: string;
    label: string;
    available: boolean;
    metrics: TierMetrics;
    groupRollups?: GroupRollup[];
    probeProgress?: number | null;
  }>;
  system: TierMetrics & {
    moduleCount: number;
    modulesAvailable: number;
  };
  groupRollups?: GroupRollup[];
  meta?: { tipSha?: string; probeSource?: string; honesty?: string };
};

const POLL_MS = 5000;

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
    | (SystemPayload & { error?: string; message?: string; tipSha?: string })
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
  const tip =
    data?.meta?.tipSha ||
    httpErr?.tipSha ||
    undefined;

  const rows =
    data?.modules ??
    MATRIX_MODULES_SIDEBAR_ORDER.map((m) => ({
      module: m.id,
      label: m.label,
      available: false,
      metrics: EMPTY_METRICS,
    }));

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
          <b>SYSTEM ROLLUP — {sys?.moduleCount ?? 29} MODULES.</b> Same 4-box + column groups as each
          module board. Box 3/4 show fill · wire and live · certified side by side.
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
        metrics={sys ?? EMPTY_METRICS}
        liveOk={ok}
        dataUpdatedAt={dataUpdatedAt}
        showChanges={false}
      />

      <GroupRollupTable rollups={data?.groupRollups ?? []} liveOk={ok} />

      <h2>
        All modules — sidebar order{" "}
        <span className="sub">
          same columns as module boards · Box 3/4 dual % · click module to open full board
        </span>
      </h2>

      <div className="scroll scroll-system">
        <div className="overflow-x-auto">
          <table className="system-table" data-testid="module-matrix-system-table">
            <thead>
              <tr>
                <th className="sticky-col">Module</th>
                <th>Leaves</th>
                <th>Required</th>
                <th>Audited %</th>
                <th>Probe %</th>
                <th>Built % (fill · wire)</th>
                <th>Live % (live · cert)</th>
                <th>Certified %</th>
                <th>Queue</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const built = builtDualPcts(row.metrics);
                const live = liveDualPcts(row.metrics);
                return (
                  <tr key={row.module} className={row.available ? "" : "dim-row"}>
                    <td className="sticky-col">
                      <b>{row.label}</b>
                      <span className="mod-id">{row.module}</span>
                    </td>
                    <td>{row.metrics.leafCount ?? 0}</td>
                    <td>{row.metrics.requiredCells}</td>
                    <td>
                      <span className={`pct ${pctClass(row.metrics.auditedOnlyPct)}`}>
                        {ok && row.available ? `${row.metrics.auditedOnlyPct}%` : "—"}
                      </span>
                    </td>
                    <td>
                      <span className={`pct ${pctClass(row.metrics.probeOnlyPct)}`}>
                        {ok && row.available ? `${row.metrics.probeOnlyPct}%` : "—"}
                      </span>
                    </td>
                    <td>
                      <DualPct
                        a={built.fill}
                        b={built.wire}
                        liveOk={ok && row.available}
                        testId={`system-row-${row.module}-built-dual`}
                      />
                    </td>
                    <td>
                      <DualPct
                        a={live.live}
                        b={live.cert}
                        liveOk={ok && row.available}
                        testId={`system-row-${row.module}-live-dual`}
                      />
                    </td>
                    <td>
                      <span className={`pct ${pctClass(row.metrics.certifiedPct)}`}>
                        {ok && row.available ? `${row.metrics.certifiedPct}%` : "—"}
                      </span>
                    </td>
                    <td>{row.metrics.buildQueue}</td>
                    <td>
                      {row.available ? (
                        <Link to={`/program/matrix?module=${row.module}`}>Board →</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {sys ? (
              <tfoot>
                <tr className="system-total">
                  <td className="sticky-col">
                    <b>Software total</b>
                  </td>
                  <td>—</td>
                  <td>{sys.requiredCells}</td>
                  <td>
                    <span className={`pct ${pctClass(sys.auditedOnlyPct)}`}>{sys.auditedOnlyPct}%</span>
                  </td>
                  <td>
                    <span className={`pct ${pctClass(sys.probeOnlyPct)}`}>{sys.probeOnlyPct}%</span>
                  </td>
                  <td>
                    <DualPct
                      a={builtDualPcts(sys).fill}
                      b={builtDualPcts(sys).wire}
                      liveOk
                      testId="system-total-built-dual"
                    />
                  </td>
                  <td>
                    <DualPct
                      a={liveDualPcts(sys).live}
                      b={liveDualPcts(sys).cert}
                      liveOk
                      testId="system-total-live-dual"
                    />
                  </td>
                  <td>
                    <span className={`pct ${pctClass(sys.certifiedPct)}`}>{sys.certifiedPct}%</span>
                  </td>
                  <td>{sys.buildQueue}</td>
                  <td>
                    {sys.modulesAvailable}/{sys.moduleCount} boards
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </>
  );
}
