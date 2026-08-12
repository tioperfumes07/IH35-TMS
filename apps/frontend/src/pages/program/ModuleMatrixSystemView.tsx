/**
 * System-wide module matrix rollup — all modules in sidebar order (owner lock 2026-08-10).
 * Option A ribbon metrics (2026-08-11).
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import { MATRIX_MODULES_SIDEBAR_ORDER } from "./moduleMatrixCatalog";

type TierMetrics = {
  requiredCells: number;
  liveCells: number;
  builtOnlyCells: number;
  probeOnlyCells: number;
  auditedOnlyCells: number;
  unauditedCells: number;
  buildQueue: number;
  requiredPct: number;
  auditedOnlyPct: number;
  probeOnlyPct: number;
  builtOnlyPct: number;
  livePct: number;
  certifiedPct: number;
  builtCells: number;
  leafCount: number;
  auditedPct?: number;
  builtPct?: number;
};

type SystemPayload = {
  sample: false;
  scope: "system";
  modules: Array<{
    module: string;
    label: string;
    available: boolean;
    metrics: TierMetrics;
    probeProgress?: number | null;
  }>;
  system: TierMetrics & {
    moduleCount: number;
    modulesAvailable: number;
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
      ) : ok ? (
        <div className="banner live" data-testid="module-matrix-system-live">
          <b>SYSTEM ROLLUP — {sys?.moduleCount ?? 29} MODULES.</b> Option A ribbon — mutually exclusive tiers.
          Certified % = Live ÷ Required only.
          {data?.meta?.tipSha ? <> · tip <code>{data.meta.tipSha}</code></> : null}.
        </div>
      ) : (
        <div className="banner">Loading system matrix rollup…</div>
      )}

      <div className="metrics metrics-ribbon metrics-system">
        <div className="metric">
          <div className="n">{sys?.requiredPct ?? "—"}%</div>
          <div className="l">
            Required
            <br />
            {sys?.requiredCells ?? 0} cells
          </div>
        </div>
        <div className="metric">
          <div className="n">{sys?.auditedOnlyPct ?? "—"}%</div>
          <div className="l">Audited · ledger/GUARD</div>
        </div>
        <div className="metric amb">
          <div className="n">{sys?.probeOnlyPct ?? "—"}%</div>
          <div className="l">Probe hold</div>
        </div>
        <div className="metric amb">
          <div className="n">{sys?.builtOnlyPct ?? "—"}%</div>
          <div className="l">Built wire-sprint</div>
        </div>
        <div className="metric good">
          <div className="n">{sys?.livePct ?? "—"}%</div>
          <div className="l">Live PROD-VERIFIED</div>
        </div>
        <div className="metric big">
          <div className="n">{sys?.certifiedPct ?? "—"}%</div>
          <div className="l">
            Certified
            <br />
            {sys?.liveCells ?? 0} / {sys?.requiredCells ?? 0}
          </div>
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
              <th>Req</th>
              <th>Audit %</th>
              <th>Probe %</th>
              <th>Built %</th>
              <th>Live %</th>
              <th>Cert %</th>
              <th>Queue</th>
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
                  <span className={`pct ${pctClass(row.metrics.auditedOnlyPct)}`}>
                    {row.metrics.auditedOnlyPct}%
                  </span>
                </td>
                <td>
                  <span className={`pct ${pctClass(row.metrics.probeOnlyPct)}`}>
                    {row.metrics.probeOnlyPct}%
                  </span>
                </td>
                <td>
                  <span className={`pct ${pctClass(row.metrics.builtOnlyPct)}`}>
                    {row.metrics.builtOnlyPct}%
                  </span>
                </td>
                <td>
                  <span className={`pct ${pctClass(row.metrics.livePct)}`}>{row.metrics.livePct}%</span>
                </td>
                <td>
                  <span className={`pct ${pctClass(row.metrics.certifiedPct)}`}>
                    {row.metrics.certifiedPct}%
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
                  <span className={`pct ${pctClass(sys.auditedOnlyPct)}`}>{sys.auditedOnlyPct}%</span>
                </td>
                <td>
                  <span className={`pct ${pctClass(sys.probeOnlyPct)}`}>{sys.probeOnlyPct}%</span>
                </td>
                <td>
                  <span className={`pct ${pctClass(sys.builtOnlyPct)}`}>{sys.builtOnlyPct}%</span>
                </td>
                <td>
                  <span className={`pct ${pctClass(sys.livePct)}`}>{sys.livePct}%</span>
                </td>
                <td>
                  <span className={`pct ${pctClass(sys.certifiedPct)}`}>{sys.certifiedPct}%</span>
                </td>
                <td>{sys.buildQueue}</td>
                <td colSpan={1}>
                  {sys.modulesAvailable}/{sys.moduleCount} boards
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </>
  );
}
