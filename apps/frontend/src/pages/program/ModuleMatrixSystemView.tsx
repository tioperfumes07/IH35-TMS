/**
 * System-wide module matrix rollup — all modules in sidebar order (owner lock 2026-08-10).
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import { MATRIX_MODULES_SIDEBAR_ORDER } from "./moduleMatrixCatalog";

type SystemPayload = {
  sample: false;
  scope: "system";
  modules: Array<{
    module: string;
    label: string;
    available: boolean;
    metrics: {
      requiredCells: number;
      liveCells: number;
      builtCells: number;
      auditedCells: number;
      buildQueue: number;
      livePct: number;
      builtPct: number;
      auditedPct: number;
      leafCount: number;
    };
    probeProgress?: number | null;
  }>;
  system: {
    moduleCount: number;
    modulesAvailable: number;
    requiredCells: number;
    liveCells: number;
    builtCells: number;
    auditedCells: number;
    buildQueue: number;
    livePct: number;
    builtPct: number;
    auditedPct: number;
  };
  meta?: { tipSha?: string; probeSource?: string; honesty?: string };
};

const POLL_MS = 5000;

async function fetchSystemMatrix(): Promise<SystemPayload | null> {
  const r = await fetch(resolveApiUrl("/api/v1/program/module-matrix?scope=system"), {
    credentials: "include",
  });
  if (!r.ok) return null;
  const json = (await r.json()) as SystemPayload;
  if (!json || json.scope !== "system") return null;
  return json;
}

function pctClass(n: number) {
  if (n >= 80) return "hi";
  if (n >= 40) return "mid";
  return "lo";
}

export function ModuleMatrixSystemView() {
  const { data, isError, isFetched } = useQuery({
    queryKey: ["program", "module-matrix", "system"],
    queryFn: fetchSystemMatrix,
    refetchInterval: POLL_MS,
    staleTime: 0,
  });

  const ok = Boolean(data?.system);
  const sys = data?.system;

  return (
    <>
      {isFetched && (!ok || isError) ? (
        <div className="banner" data-testid="module-matrix-system-unavailable">
          <b>SYSTEM ROLLUP UNAVAILABLE.</b> Could not load{" "}
          <code>GET /api/v1/program/module-matrix?scope=system</code>.
        </div>
      ) : data?.meta?.probeSource === "committed_stale" ? (
        <div className="banner" data-testid="module-matrix-system-stale">
          <b>STALE BUILT PROBES.</b> Box 3 Built may use committed snapshots — Live (Box 4) still from
          PROD-VERIFIED ledger only.
          {data.meta.tipSha ? <> · tip <code>{data.meta.tipSha}</code></> : null}.
        </div>
      ) : ok ? (
        <div className="banner live" data-testid="module-matrix-system-live">
          <b>SYSTEM ROLLUP — ALL {sys?.moduleCount ?? 29} MODULES.</b> Summed Required / Built / Live cells
          across sidebar order. Software certification % = Box 4 Live ÷ Required.
          {data?.meta?.tipSha ? <> · tip <code>{data.meta.tipSha}</code></> : null}.
        </div>
      ) : (
        <div className="banner">Loading system matrix rollup…</div>
      )}

      <div className="metrics metrics-system">
        <div className="metric big">
          <div className="n">{sys?.livePct ?? "—"}%</div>
          <div className="l">
            Software Live % (Box 4)
            <br />
            {sys?.liveCells ?? 0} / {sys?.requiredCells ?? 0} cells
          </div>
        </div>
        <div className="metric amb">
          <div className="n">{sys?.builtPct ?? "—"}%</div>
          <div className="l">
            Software Built % (Box 3)
            <br />
            {sys?.builtCells ?? 0} wired cells
          </div>
        </div>
        <div className="metric">
          <div className="n">{sys?.auditedPct ?? "—"}%</div>
          <div className="l">Audited coverage (Box 2 path)</div>
        </div>
        <div className="metric">
          <div className="n">{sys?.requiredCells ?? "—"}</div>
          <div className="l">Total required cells</div>
        </div>
        <div className="metric good">
          <div className="n">{sys?.liveCells ?? "—"}</div>
          <div className="l">Live-verified cells</div>
        </div>
        <div className="metric big">
          <div className="n">{sys?.buildQueue ?? "—"}</div>
          <div className="l">Build queue (not Live)</div>
        </div>
      </div>

      <h2>
        All modules — sidebar order{" "}
        <span className="sub">click module to open full board · scroll → for wide view</span>
      </h2>

      <div className="scroll scroll-system">
        <table className="system-table">
          <thead>
            <tr>
              <th className="sticky-col">Module</th>
              <th>Leaves</th>
              <th>Required</th>
              <th>Audited %</th>
              <th>Built %</th>
              <th>Live %</th>
              <th>Live cells</th>
              <th>Built cells</th>
              <th>Queue</th>
              <th>Probe</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {(data?.modules ?? MATRIX_MODULES_SIDEBAR_ORDER.map((m) => ({
              module: m.id,
              label: m.label,
              available: false,
              metrics: {
                requiredCells: 0,
                liveCells: 0,
                builtCells: 0,
                auditedCells: 0,
                buildQueue: 0,
                livePct: 0,
                builtPct: 0,
                auditedPct: 0,
                leafCount: 0,
              },
            }))).map((row) => (
              <tr key={row.module} className={row.available ? "" : "dim-row"}>
                <td className="sticky-col">
                  <b>{row.label}</b>
                  <span className="mod-id">{row.module}</span>
                </td>
                <td>{row.metrics.leafCount}</td>
                <td>{row.metrics.requiredCells}</td>
                <td>
                  <span className={`pct ${pctClass(row.metrics.auditedPct)}`}>{row.metrics.auditedPct}%</span>
                </td>
                <td>
                  <span className={`pct ${pctClass(row.metrics.builtPct)}`}>{row.metrics.builtPct}%</span>
                </td>
                <td>
                  <span className={`pct ${pctClass(row.metrics.livePct)}`}>{row.metrics.livePct}%</span>
                </td>
                <td>{row.metrics.liveCells}</td>
                <td>{row.metrics.builtCells}</td>
                <td>{row.metrics.buildQueue}</td>
                <td>
                  {"probeProgress" in row && typeof row.probeProgress === "number"
                    ? `${row.probeProgress}%`
                    : "—"}
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
                </td>
                <td>—</td>
                <td>{sys.requiredCells}</td>
                <td>
                  <span className={`pct ${pctClass(sys.auditedPct)}`}>{sys.auditedPct}%</span>
                </td>
                <td>
                  <span className={`pct ${pctClass(sys.builtPct)}`}>{sys.builtPct}%</span>
                </td>
                <td>
                  <span className={`pct ${pctClass(sys.livePct)}`}>{sys.livePct}%</span>
                </td>
                <td>{sys.liveCells}</td>
                <td>{sys.builtCells}</td>
                <td>{sys.buildQueue}</td>
                <td colSpan={2}>
                  {sys.modulesAvailable}/{sys.moduleCount} boards loaded
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </>
  );
}
