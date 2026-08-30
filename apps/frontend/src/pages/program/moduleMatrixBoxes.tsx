/**
 * Shared 4-box tracker + column-group rollup for module boards and All-modules system rollup.
 * Box 3 / Box 4 show BOTH percentages side-by-side (cumulative fill · exclusive tier / cert).
 */
import { useEffect, useRef, useState } from "react";

export type TierMetrics = {
  requiredCells: number;
  liveCells: number;
  builtOnlyCells: number;
  probeOnlyCells: number;
  auditedOnlyCells: number;
  unauditedCells: number;
  builtCells: number;
  auditedCells?: number;
  buildQueue: number;
  requiredPct: number;
  auditedOnlyPct: number;
  probeOnlyPct: number;
  builtOnlyPct: number;
  livePct: number;
  certifiedPct: number;
  modulePct?: number;
  leafCount?: number;
  colCount?: number;
  doneCells?: number;
  auditedPct?: number;
  builtPct?: number;
};

export type GroupRollup = TierMetrics & { group: string; label: string };

/** Cumulative 4-box counts: Audited/Built include higher tiers (fill toward Live). */
export type BoxCounts = {
  required: number;
  audited: number;
  built: number;
  live: number;
};

export function cumulativeBoxCounts(metrics: TierMetrics): BoxCounts {
  const req = metrics.requiredCells || 0;
  const live = metrics.liveCells || 0;
  const builtOnly = metrics.builtOnlyCells || 0;
  const auditedOnly = (metrics.auditedOnlyCells || 0) + (metrics.probeOnlyCells || 0);
  const built = builtOnly + live;
  const audited = auditedOnly + built;
  return {
    required: req,
    audited: Math.min(audited, req),
    built: Math.min(built, req),
    live,
  };
}

export function emptyWhyTitle(st: {
  req: boolean;
  built: boolean;
  live: boolean;
}): string {
  if (!st.req) return "N/A — column not required on this leaf";
  if (st.live) return "LIVE proven — no queue (do not restamp)";
  if (st.built) {
    return "built_unproven · ERRAND — Box 3 green, Box 4 empty. Observe on live SHA. Never verticalize Box 4 stamps.";
  }
  return "not_built · FIX — Box 3 empty. Vertical by column (shared component), not per-module chrome.";
}

export function pctClass(n: number): string {
  if (n >= 80) return "hi";
  if (n >= 40) return "mid";
  return "lo";
}

/** Same 4-box cell chrome on module boards and All-modules system board (owner lock). */
export function MatrixCell4({
  req,
  audited,
  built,
  live,
  title,
  testId,
}: {
  req: boolean;
  audited: boolean;
  built: boolean;
  live: boolean;
  title?: string;
  testId?: string;
}) {
  if (!req) {
    return (
      <div className="cell4" aria-label="Not applicable" title={title} data-testid={testId}>
        <span className="bx req-n">·</span>
        <span className="bx empty" />
        <span className="bx empty" />
        <span className="bx empty" />
      </div>
    );
  }
  const auditedBox = audited ? (built || live ? "map-y" : "map-w") : "map-n";
  return (
    <div
      className="cell4"
      aria-label={`Required audited built ${live ? "live" : "not-live"}`}
      title={title}
      data-testid={testId}
    >
      <span className="bx req-y">✓</span>
      <span className={`bx ${auditedBox}`}>{audited ? (built || live ? "✓" : "●") : "✕"}</span>
      <span className={`bx ${built ? "done-y" : "done-n"}`}>{built ? "✓" : "✕"}</span>
      <span className={`bx ${live ? "live-y" : "done-n"}`}>{live ? "✓" : "✕"}</span>
    </div>
  );
}

/** Rollup Abl% → same 4-box states (100% fill = ✓ on that box; partial audit = ●). */
export function AblFromPct({
  abl,
  liveOk,
  testId,
}: {
  abl: { requiredCells: number; auditedPct: number; builtPct: number; livePct: number };
  liveOk: boolean;
  testId?: string;
}) {
  const boxes = liveOk ? ablPctToCell4(abl) : { req: false, audited: false, built: false, live: false };
  return <MatrixCell4 {...boxes} testId={testId} />;
}

export function ablPctToCell4(abl: {
  requiredCells: number;
  auditedPct: number;
  builtPct: number;
  livePct: number;
}): { req: boolean; audited: boolean; built: boolean; live: boolean } {
  if (!abl || abl.requiredCells <= 0) {
    return { req: false, audited: false, built: false, live: false };
  }
  return {
    req: true,
    audited: abl.auditedPct > 0,
    built: abl.builtPct >= 100,
    live: abl.livePct >= 100,
  };
}

/**
 * Progress percentages must never round an incomplete count up to 100.
 * Exact completion is the only state allowed to display 100%; intermediate
 * values are floored so the percentage cannot contradict the adjacent count.
 */
export function honestProgressPct(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  if (count >= total) return 100;
  return Math.floor((count / total) * 100);
}

/** Box 3 / Box 4 — both percentages side by side. */
export function DualPct({
  a,
  b,
  liveOk,
  testId,
}: {
  a: number;
  b: number;
  liveOk: boolean;
  testId?: string;
}) {
  if (!liveOk) return <span data-testid={testId}>—</span>;
  return (
    <span className="pct-dual" data-testid={testId ?? "matrix-dual-pct"}>
      <span className={`pct ${pctClass(a)}`}>{a}%</span>
      <span className="pct-sep">·</span>
      <span className={`pct ${pctClass(b)}`}>{b}%</span>
    </span>
  );
}

/** Built fill % (includes Live) · wire-only % (Built exclusive). */
export function builtDualPcts(metrics: TierMetrics): { fill: number; wire: number } {
  const counts = cumulativeBoxCounts(metrics);
  return {
    fill: honestProgressPct(counts.built, counts.required),
    wire: metrics.builtOnlyPct ?? honestProgressPct(metrics.builtOnlyCells || 0, counts.required),
  };
}

/** Live % · Certified % (same denominator; certified = Live ÷ Required). */
export function liveDualPcts(metrics: TierMetrics): { live: number; cert: number } {
  const live = metrics.livePct ?? 0;
  const cert = metrics.certifiedPct ?? live;
  return { live, cert };
}

type BoxChange = {
  at: number;
  box: "Required" | "Audited" | "Built" | "Live";
  from: number;
  to: number;
  of: number;
};

const BOX_CHANGE_CAP = 12;
const MATRIX_POLL_MS = 5000;

export function MatrixBoxTracker({
  boardKey,
  metrics,
  liveOk,
  dataUpdatedAt,
  showChanges = true,
}: {
  boardKey: string;
  metrics: TierMetrics;
  liveOk: boolean;
  dataUpdatedAt?: number;
  showChanges?: boolean;
}) {
  const counts = cumulativeBoxCounts(metrics);
  const prevRef = useRef<BoxCounts | null>(null);
  const [changes, setChanges] = useState<BoxChange[]>([]);
  const builtDual = builtDualPcts(metrics);
  const liveDual = liveDualPcts(metrics);

  useEffect(() => {
    if (!liveOk || counts.required === 0) return;
    const prev = prevRef.current;
    prevRef.current = counts;
    if (!prev) return;
    const at = dataUpdatedAt || Date.now();
    const next: BoxChange[] = [];
    const pairs: Array<{ box: BoxChange["box"]; from: number; to: number }> = [
      { box: "Required", from: prev.required, to: counts.required },
      { box: "Audited", from: prev.audited, to: counts.audited },
      { box: "Built", from: prev.built, to: counts.built },
      { box: "Live", from: prev.live, to: counts.live },
    ];
    for (const p of pairs) {
      if (p.from !== p.to) {
        next.push({ at, box: p.box, from: p.from, to: p.to, of: counts.required });
      }
    }
    if (!next.length) return;
    setChanges((cur) => [...next, ...cur].slice(0, BOX_CHANGE_CAP));
  }, [liveOk, counts.required, counts.audited, counts.built, counts.live, dataUpdatedAt]);

  useEffect(() => {
    prevRef.current = null;
    setChanges([]);
  }, [boardKey]);

  const tiles: Array<{
    key: string;
    box: string;
    label: string;
    count: number;
    of: number;
    testId: string;
    extraClass?: string;
    dual?: { a: number; b: number; hint: string };
  }> = [
    {
      key: "1",
      box: "Box 1",
      label: "Required",
      count: liveOk ? counts.required : 0,
      of: counts.required || metrics.requiredCells,
      testId: "module-matrix-tier-req",
    },
    {
      key: "2",
      box: "Box 2",
      label: "Audited",
      count: liveOk ? counts.audited : 0,
      of: counts.required || metrics.requiredCells,
      testId: "module-matrix-tier-audit",
    },
    {
      key: "3",
      box: "Box 3",
      label: "Built",
      count: liveOk ? counts.built : 0,
      of: counts.required || metrics.requiredCells,
      testId: "module-matrix-tier-built",
      extraClass: "module-matrix-built-cells-metric",
      dual: {
        a: builtDual.fill,
        b: builtDual.wire,
        hint: "fill · wire-only",
      },
    },
    {
      key: "4",
      box: "Box 4",
      label: "Live",
      count: liveOk ? counts.live : 0,
      of: counts.required || metrics.requiredCells,
      testId: "module-matrix-tier-live",
      dual: {
        a: liveDual.live,
        b: liveDual.cert,
        hint: "live · certified",
      },
    },
  ];

  return (
    <div className="box-tracker" data-testid="module-matrix-box-tracker">
      <div className="metrics metrics-ribbon metrics-boxes" data-testid="module-matrix-tier-ribbon">
        {tiles.map((t) => {
          const pct = honestProgressPct(t.count, t.of);
          const full = liveOk && t.of > 0 && t.count === t.of;
          const cls = !liveOk ? "" : full ? "good" : pct >= 40 ? "amb" : "big";
          return (
            <div
              key={t.key}
              className={`metric ${cls}${t.extraClass ? ` ${t.extraClass}` : ""}`}
              data-testid={t.testId}
            >
              <div className="box-tag">{t.box}</div>
              <div className="n">{liveOk ? `${t.count} of ${t.of}` : "—"}</div>
              <div className="l">
                {t.label}
                <br />
                {liveOk ? (
                  t.dual ? (
                    <>
                      <DualPct a={t.dual.a} b={t.dual.b} liveOk={liveOk} testId={`${t.testId}-dual-pct`} />
                      <span className="dual-hint"> {t.dual.hint}</span>
                    </>
                  ) : (
                    `${pct}% green`
                  )
                ) : (
                  "pending feed"
                )}
              </div>
            </div>
          );
        })}
      </div>
      {showChanges ? (
        <div className="box-changes" data-testid="module-matrix-box-changes">
          <div className="box-changes-hd">
            Live changes (this board){" "}
            <span className="sub">polls every {MATRIX_POLL_MS / 1000}s · shows count moves</span>
          </div>
          {changes.length === 0 ? (
            <div className="box-changes-empty">
              No count changes yet since you opened this module — when Built goes 49 → 50 it will
              appear here with the time.
            </div>
          ) : (
            <ul className="box-changes-list">
              {changes.map((c, i) => (
                <li key={`${c.at}-${c.box}-${c.to}-${i}`}>
                  <span className="t">{new Date(c.at).toLocaleTimeString()}</span>
                  <span className="b">{c.box}</span>
                  <span className="d">
                    {c.from} → <b>{c.to}</b> of {c.of} green
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function GroupRollupTable({ rollups, liveOk }: { rollups: GroupRollup[]; liveOk: boolean }) {
  if (!rollups.length) return null;
  return (
    <>
      <h2>
        Column groups{" "}
        <span className="sub">same columns as module boards · Box 3/4 show fill · wire / live · cert</span>
      </h2>
      <div className="scroll scroll-groups overflow-x-auto">
        <table className="group-table" data-testid="module-matrix-group-rollups">
          <thead>
            <tr>
              <th>Group</th>
              <th>Required</th>
              <th>Audited %</th>
              <th>Probe %</th>
              <th>Built % (fill · wire)</th>
              <th>Live % (live · cert)</th>
              <th>Certified %</th>
            </tr>
          </thead>
          <tbody>
            {rollups
              .slice()
              .sort((a, b) => {
                const order = [
                  "linkage",
                  "money",
                  "chrome",
                  "wiring",
                  "process",
                  "economics",
                  "verifier",
                  "fully_wired",
                  "other",
                ];
                return (order.indexOf(a.group) === -1 ? 99 : order.indexOf(a.group)) -
                  (order.indexOf(b.group) === -1 ? 99 : order.indexOf(b.group));
              })
              .map((g) => {
              const built = builtDualPcts(g);
              const live = liveDualPcts(g);
              return (
                <tr key={g.group}>
                  <td>
                    <b>{g.label}</b>
                    <span className="mod-id">{g.group}</span>
                  </td>
                  <td>{g.requiredCells}</td>
                  <td>
                    <span className={`pct ${pctClass(g.auditedOnlyPct)}`}>
                      {liveOk ? `${g.auditedOnlyPct}%` : "—"}
                    </span>
                  </td>
                  <td>
                    <span className={`pct ${pctClass(g.probeOnlyPct)}`}>
                      {liveOk ? `${g.probeOnlyPct}%` : "—"}
                    </span>
                  </td>
                  <td>
                    <DualPct a={built.fill} b={built.wire} liveOk={liveOk} testId={`group-${g.group}-built-dual`} />
                  </td>
                  <td>
                    <DualPct a={live.live} b={live.cert} liveOk={liveOk} testId={`group-${g.group}-live-dual`} />
                  </td>
                  <td>
                    <span className={`pct ${pctClass(g.certifiedPct)}`}>
                      {liveOk ? `${g.certifiedPct}%` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
