/**
 * HOMEPAGE LIVE SCENARIO TRACKER §8 — frontend panel.
 *
 * Renders the 9-hop walking skeleton as a live pipeline. Every dot is recomputed on the
 * server at request time; this panel polls every 20s and shows a red STALE banner the moment
 * the response is older than 2x max_age or any source is unhealthy.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchHomeScenarioTracker,
  type HomeScenarioTrackerResult,
  type ScenarioResult,
  type ScenarioStage,
} from "../../api/home";

const STAGES: ScenarioStage[] = ["spec", "built", "merged", "proof", "passed", "complete"];

const STAGE_META: Record<
  ScenarioStage,
  { label: string; color: string; dim: string }
> = {
  spec: { label: "Spec", color: "#64748B", dim: "#94a3b8" },
  built: { label: "Built", color: "#334155", dim: "#64748B" },
  merged: { label: "Merged", color: "#1F2A44", dim: "#475569" },
  proof: { label: "Proof", color: "#CA8A04", dim: "#FCD34D" },
  passed: { label: "Passed", color: "#22c55e", dim: "#86efac" },
  complete: { label: "Complete", color: "#15803d", dim: "#4ade80" },
};

function stageIndex(stage: ScenarioStage): number {
  return STAGES.indexOf(stage);
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
  return `${Math.ceil(ms / 60_000)}min`;
}

type ScenarioRowProps = {
  hop: ScenarioResult;
};

function ScenarioRow({ hop }: ScenarioRowProps) {
  const currentIdx = stageIndex(hop.stage);
  const meta = STAGE_META[hop.stage];

  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{hop.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {hop.lane} · {hop.spec_ref} · JE: {hop.je}
          </div>
        </div>
        <div
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
          style={{ backgroundColor: hop.state === "fix" ? "#ef4444" : meta.color }}
          title={hop.evidence}
        >
          {hop.state === "fix" ? "Fix" : hop.stage}
        </div>
      </div>

      <div className="relative mt-4">
        <div className="flex items-center justify-between">
          {STAGES.map((stage, idx) => {
            const isActive = idx === currentIdx;
            const isPast = idx < currentIdx;
            const sm = STAGE_META[stage];
            const bg = isActive || isPast ? sm.color : "#ffffff";
            const border = isActive ? meta.color : sm.dim;
            const shadow = isActive ? `0 0 0 3px ${sm.dim}` : undefined;

            return (
              <div key={stage} className="flex flex-1 flex-col items-center">
                <div className="h-4 text-[9px] font-semibold text-slate-500">
                  {isActive ? "Now" : ""}
                </div>
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: bg, border: `1px solid ${border}`, boxShadow: shadow }}
                  title={`${sm.label}: ${idx <= currentIdx ? "reached" : "pending"}`}
                />
                <div className="mt-1 text-[9px] font-medium text-slate-500">{sm.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="mt-2 text-[11px] leading-snug text-slate-600"
        title={hop.evidence}
      >
        {hop.evidence}
      </div>
    </div>
  );
}

type Props = {
  companyId?: string | null;
};

export function ScenarioTrackerPanel({ companyId }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const scopeKey = companyId ?? "ALL";

  const {
    data,
    error,
    isLoading,
    isError,
    refetch,
  } = useQuery<HomeScenarioTrackerResult>({
    queryKey: ["home", "scenario-tracker", scopeKey],
    queryFn: () => fetchHomeScenarioTracker(companyId),
    refetchInterval: 20_000,
    staleTime: 0,
    retry: 1,
  });

  const staleInfo = useMemo(() => {
    if (isError) {
      return { stale: true, message: `Tracker unavailable — ${error instanceof Error ? error.message : "fetch failed"}` };
    }
    if (!data) return { stale: false, message: "" };

    const generatedAt = new Date(data.generated_at_utc).getTime();
    const ageMs = now - generatedAt;
    const thresholdMs = data.max_age_seconds * 2 * 1000;
    const old = ageMs > thresholdMs;
    const unhealthy = data.source_health.filter((s) => !s.ok);

    if (old && unhealthy.length) {
      return {
        stale: true,
        message: `STALE — data is ${formatAge(ageMs)} old and source(s) ${unhealthy.map((s) => s.source).join(", ")} are unreachable`,
      };
    }
    if (old) {
      return { stale: true, message: `STALE — data is ${formatAge(ageMs)} old` };
    }
    if (unhealthy.length) {
      return {
        stale: true,
        message: `STALE — source(s) ${unhealthy.map((s) => s.source).join(", ")} unreachable`,
      };
    }
    return { stale: false, message: "" };
  }, [data, error, isError, now]);

  const allRows = useMemo(() => {
    if (!data) return [];
    // P0 2026-08-05: spreading these unguarded threw `TypeError: i.scenarios is not iterable` and,
    // because this panel is mounted unconditionally in OwnerHome, the throw escaped to the page error
    // boundary and took the ENTIRE owner homepage down in production. The payload legitimately omits
    // these arrays when audit.scenario_status has no is_current rows (it is empty on prod: 0 rows).
    // An absent slice must degrade this panel to empty, never crash the page that hosts it.
    return [...(data.hops ?? []), ...(data.scenarios ?? [])];
  }, [data]);

  if (isLoading && !data) {
    return (
      <div className="rounded-sm border border-slate-200 bg-white p-4 shadow-xs">
        <div className="h-4 w-1/3 animate-pulse rounded-sm bg-slate-100" />
        <div className="mt-3 h-24 animate-pulse rounded-sm bg-slate-100" />
      </div>
    );
  }

  return (
    <div
      className={`rounded-sm border border-slate-200 bg-white p-4 shadow-xs ${
        staleInfo.stale ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">End-to-End Scenario Tracker</h2>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {data ? (
              <>
                Live as of {data.generated_at_ct} · scope: {data.entity_scope}
              </>
            ) : (
              "Loading live tracker…"
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* PROG-NAV-01: door to the full pixel-locked board. This panel is the only place the
              owner meets the tracker on the page he lands on, so without this link the full
              24-slice board stayed URL-only. */}
          <Link
            to="/home/scenario-tracker"
            className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
          >
            Open full board
          </Link>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
          >
            Refresh
          </button>
        </div>
      </div>

      {staleInfo.stale && (
        <div className="mt-3 rounded-sm bg-red-600 px-3 py-2 text-xs font-semibold text-white">
          {staleInfo.message}
        </div>
      )}

      {allRows.length > 0 && (
        <div className="mt-4 grid gap-3">
          {allRows.map((hop) => (
            <ScenarioRow key={hop.key} hop={hop} />
          ))}
        </div>
      )}

      {data && data.source_health.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
            Source health
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.source_health.map((s) => (
              <span
                key={s.source}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px]"
                style={{
                  borderColor: s.ok ? "#10b981" : "#ef4444",
                  color: s.ok ? "#047857" : "#b91c1c",
                  backgroundColor: s.ok ? "#ecfdf5" : "#fef2f2",
                }}
                title={s.detail || `${s.source} probed at ${s.probed_at_ct}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: s.ok ? "#10b981" : "#ef4444" }}
                />
                {s.source}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
