import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ProgramModuleNav } from "../ProgramModuleNav";
import { fetchScenarioTracker } from "./api";
import { HOP_IDENTITY, SCENARIO_IDENTITY, mergeLiveItem } from "./registry";
import { ScenarioPipeline } from "./ScenarioPipeline";
import { evaluateScenarioTrackerStaleness, formatLiveAsOfCt } from "./staleness";
import { stageIndex, type EntityScope, type ScenarioTrackerItem, type ScenarioTrackerResponse } from "./types";
import "./scenario-tracker.css";

/**
 * WIRE-LIVE Layer 1 — the board moves on its own within 3s, no human reload.
 *
 * Was a hand-rolled setTimeout loop at 20s that only advanced while the tab was focused, so a board
 * left open on a wall display drifted arbitrarily far behind prod. Now a TanStack Query at 3s with
 * refetchIntervalInBackground, on the app's shared query client.
 *
 * BACK-OFF: once every hop AND scenario is green, the interval returns false and polling STOPS — a
 * finished board must not hammer prod forever. It resumes automatically the moment anything is
 * not-green, because the predicate is recomputed from each response.
 */
const POLL_MS = 3000;
const ENTITIES: EntityScope[] = ["ALL", "TRANSP", "USMCA", "TRK"];

/** Green = reached `passed` (stage index 4) or better AND not sitting in a fix state. */
function itemIsGreen(item: ScenarioTrackerItem): boolean {
  return stageIndex(item.stage) >= 4 && item.state === "done";
}

export function allHopsGreen(payload: ScenarioTrackerResponse | undefined | null): boolean {
  if (!payload) return false;
  const all = [...(payload.hops ?? []), ...(payload.scenarios ?? [])];
  // An empty payload is NOT "all green" — treating it as green would stop polling on a failed read.
  return all.length > 0 && all.every(itemIsGreen);
}

function laneClass(lane: string): string {
  if (lane === "money") return "money";
  if (lane === "screens" || lane === "screen") return "screens";
  return "screens";
}

function hopDotClass(stale: boolean, state: string, stageIdx: number): string {
  if (stale) return "";
  if (state === "fix") return "live-amber";
  if (state === "done" || stageIdx >= 4) return "live-green";
  if (stageIdx >= 1) return "live-blue";
  return "";
}

export function ScenarioTrackerHome() {
  const [entity, setEntity] = useState<EntityScope>("USMCA");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const trackerQuery = useQuery({
    queryKey: ["scenario-tracker", entity],
    queryFn: ({ signal }) => fetchScenarioTracker(entity, signal),
    refetchInterval: (query) => (allHopsGreen(query.state.data) ? false : POLL_MS),
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: 1,
  });

  const payload = trackerQuery.data ?? null;
  const fetchFailed = trackerQuery.isError;

  // Move the age clock on every settled fetch so "Live as of" tracks the real read.
  useEffect(() => {
    if (trackerQuery.dataUpdatedAt || trackerQuery.errorUpdatedAt) setNowMs(Date.now());
  }, [trackerQuery.dataUpdatedAt, trackerQuery.errorUpdatedAt]);

  // Heartbeat clock so age crosses the 2×max_age threshold without waiting for the next poll.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  // Loading (no payload yet) must NOT pretend the request failed or "missing generated_at" —
  // that painted a permanent "STALE — scenario-tracker unreachable (fetch failed)" banner and
  // dashed Now values while the first poll was still in flight (LV-PROGRAM-SCENARIO-TRACKER-FETCH-FAILED).
  const staleness = useMemo(() => {
    if (!fetchFailed && !payload) {
      return { stale: false as const };
    }
    return evaluateScenarioTrackerStaleness({
      nowMs,
      generatedAtUtc: payload?.generated_at_utc,
      maxAgeSeconds: payload?.max_age_seconds ?? 20,
      fetchFailed,
      sourceHealth: payload?.source_health,
    });
  }, [nowMs, payload, fetchFailed]);

  const stale = staleness.stale;
  const liveByKey = useMemo(() => {
    const m = new Map<string, (typeof payload extends null ? never : NonNullable<typeof payload>)["hops"][number]>();
    for (const h of payload?.hops ?? []) m.set(h.key, h);
    for (const s of payload?.scenarios ?? []) m.set(s.key, s);
    return m;
  }, [payload]);

  const hops = HOP_IDENTITY.map((id) => mergeLiveItem(id, liveByKey.get(id.key), stale));
  const scenarios = SCENARIO_IDENTITY.map((id) => ({
    kind: id.kind,
    links: id.links,
    item: mergeLiveItem(id, liveByKey.get(id.key), stale),
  }));

  return (
    <div className="st-wrap" data-testid="scenario-tracker-home">
      {/* PROG-NAV-01: Module matrix must be a top-bar tab, not a buried footer link. */}
      <ProgramModuleNav active="scenario" />
      <header className="st-header">
        <h1>IH35-TMS — End-to-End Scenario Tracker</h1>
        <p>Every business process as a vertical slice — and the full lifecycle each one travels, start to certified.</p>
        <div className="st-live-row">
          <span className="st-live" data-testid="scenario-tracker-live-as-of">
            {stale ? "Not live" : formatLiveAsOfCt(payload?.generated_at_ct)}
          </span>
          <div className="st-entity-chips" data-testid="scenario-tracker-entity-chips">
            {ENTITIES.map((e) => (
              <button
                key={e}
                type="button"
                className={`st-chip${entity === e ? " active" : ""}`}
                data-testid={`scenario-tracker-entity-${e}`}
                onClick={() => setEntity(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="st-legacy-link">
          <Link to="/home">Role home</Link>
          {" · "}
          <Link to="/home/ops">Role ops dashboard</Link>
          {entity === "TRANSP" ? (
            <>
              {" · "}
              <Link to="/app/homepage">QBO-style home</Link>
            </>
          ) : null}
        </div>
      </header>

      {stale ? (
        <div className="st-stale-banner" data-testid="scenario-tracker-stale-banner" role="alert">
          {staleness.stale ? staleness.banner : "STALE"}
          {staleness.stale && staleness.failedSources.length > 1
            ? ` (+${staleness.failedSources.length - 1} more)`
            : ""}
        </div>
      ) : null}

      <div className="st-engine">
        <b>One engine, every transaction.</b> No feature writes its own GL math — every economic event calls the{" "}
        <b>shared poster</b>, which produces a balanced journal entry + its document + both-way linkage automatically.
        <div className="flow">
          <code>event</code> → <code>shared poster</code> → <code>balanced JE (DR = CR)</code> + <code>document</code> +{" "}
          <code>links: financial ⇄ operational</code>
        </div>
      </div>

      <div className="st-life">
        <div className="lt">The lifecycle every process travels</div>
        <div className="steps">
          {["Spec", "Built", "Merged", "Proof", "Passed", "Complete"].map((label, i) => (
            <span key={label} className="st">
              {i > 0 ? <span className="arr">→</span> : null}
              <span className="b">{i + 1}</span>
              {label}
            </span>
          ))}
        </div>
        <div className="hint">
          Spec = locked in blueprint · Built = code written · Merged = on main + migration applied on Neon · Proof = GUARD
          clicks it live &amp; checks Neon · Passed = live-verified · Complete = certified. Status is derived live — never
          a committed snapshot.
        </div>
      </div>

      <h2 className="st-h2">Part A — The money slice: one freight load, 9 hops</h2>
      <p className="st-sub">The walking skeleton. Each hop shows what&apos;s being done, its spec, and its exact position in the lifecycle.</p>
      <div className="st-hops" data-testid="scenario-tracker-hops">
        {hops.map((hop, idx) => {
          const stageIdx = stageIndex(hop.stage);
          return (
            <div key={hop.key} className="st-hop" data-testid={`scenario-hop-${hop.key}`}>
              <div className={`st-dot ${hopDotClass(stale, hop.state, stageIdx)}`}>{idx + 1}</div>
              <div className={`st-card${hop.blocked ? " blocked" : ""}`}>
                <div className="st-top">
                  {hop.href ? (
                    <Link className="st-nm" to={hop.href} data-testid={`scenario-hop-link-${hop.key}`}>
                      {hop.title}
                    </Link>
                  ) : (
                    <span className="st-nm">{hop.title}</span>
                  )}
                  <span className={`st-lane ${laneClass(hop.lane)}`}>{hop.lane === "money" ? "Money" : "Screens"}</span>
                </div>
                {hop.doing ? (
                  <div className="st-doing">
                    <b>Doing:</b> {hop.doing}
                  </div>
                ) : null}
                {hop.je ? <div className="st-je">{hop.je}</div> : null}
                {hop.je_contract ? (
                  <div className="st-je-contract">
                    Contract: {hop.je_contract.lines.map((l) => `${l.side} ${l.account_role}`).join(" / ")}
                    {hop.je_contract.must_balance ? " · DR=CR" : ""}
                  </div>
                ) : null}
                {hop.spec_ref ? (
                  <div className="st-spec">
                    <b>Spec:</b> {hop.spec_ref}
                    {hop.evidence && !stale ? ` · ${hop.evidence}` : ""}
                  </div>
                ) : null}
                {hop.blocked ? <div className="st-blk">▸ {hop.blocked}</div> : null}
                <ScenarioPipeline item={hop} stale={stale} />
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="st-h2">Part B — Every other end-to-end process (same engine)</h2>
      <p className="st-sub">Each is its own vertical slice, each on the same 6-stage lifecycle.</p>
      <div className="st-grid" data-testid="scenario-tracker-scenarios">
        {scenarios.map(({ kind, links, item }) => (
          <div key={item.key} className={`st-sc ${kind}`} data-testid={`scenario-card-${item.key}`}>
            {item.href ? (
              <Link className="t" to={item.href} data-testid={`scenario-card-link-${item.key}`}>
                {item.title}
              </Link>
            ) : (
              <div className="t">{item.title}</div>
            )}
            {item.trigger ? (
              <div className="trig">
                <b>Trigger:</b> {item.trigger}
              </div>
            ) : null}
            {item.je ? <div className="st-je">{item.je}</div> : null}
            {item.je_contract ? (
              <div className="st-je-contract">
                Contract: {item.je_contract.lines.map((l) => `${l.side} ${l.account_role}`).join(" / ")}
              </div>
            ) : null}
            {links ? (
              <div className="st-lk">
                <b>Links:</b> {links}
              </div>
            ) : null}
            {item.spec_ref ? (
              <div className="st-spec">
                <b>Spec:</b> {item.spec_ref}
                {item.evidence && !stale ? ` · ${item.evidence}` : ""}
              </div>
            ) : null}
            <ScenarioPipeline item={item} stale={stale} />
          </div>
        ))}
      </div>

      <div className="st-note">
        <b>Honest by construction.</b> A dot is filled only when that stage is true <em>right now</em> from live probes.
        Grey pipelines while STALE are not current — the red banner means do not trust the numbers until the heartbeat is
        green again.
      </div>
      <p className="st-foot">
        One posting engine · Spec → Built → Merged → Proof → Passed → Complete · poll every {POLL_MS / 1000}s · CT.
      </p>
    </div>
  );
}
