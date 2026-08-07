// apps/frontend/src/pages/program/AuditScoreboardPage.tsx
//
// Deep-Linkage Certification Scoreboard — the MAIN page of the Program module.
// Renders from the generated data module (sourced from the committed audit ledger),
// with an optional live-metrics overlay from the read-only backend endpoint.
//
// Standard: complete = DoD A–E + VERIFY 1–8, PROD-VERIFIED per entity. Green = live only.
// Palette-locked, no emojis, top-nav tabs. Additive — does not remove the Tracker/Modules pages.

import { Fragment, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ScenarioTrackerHome } from "./scenario-tracker/ScenarioTrackerHome";
import { CLASS_SCOREBOARD } from "./classScoreboard.data";
import { resolveApiUrl } from "../../api/client";
import {
  PROGRAM_SCOREBOARD,
  type ProgramScoreboard,
  type GateState,
} from "./programScoreboard.data";

const GATE_LABELS = ["A", "B", "C", "D", "E", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"];
const VIDX = [5, 6, 7, 8, 9, 10, 11, 12];

const letter = (c: GateState) =>
  c === "NA" ? "—" : c === "PASS" ? "P" : c === "AUDIT" ? "A" : c === "FIX" ? "F" : c === "FAIL" ? "X" : "U";

type RecentPrRow = {
  number: number;
  title: string;
  state?: string;
  mergedAtCt: string;
  url: string;
};

type LiveScoreboard = ProgramScoreboard & {
  meta: ProgramScoreboard["meta"] & {
    lastSyncedCt?: string | null;
    prodReadSource?: "neon_now" | "request_time" | "committed_fallback";
    gateTally?: Record<string, { pass: number; applicable: number; fail: number; unverified: number }>;
  };
  recentActivity?: RecentPrRow[];
};

/** Format an ISO / ledger %cI stamp in America/Chicago, labeled CT — never wall clock. */
function formatLedgerCt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")} ${get("dayPeriod")} CT`;
}

/**
 * WIRE-LIVE Layer 1 — the board refreshes itself; no human reload.
 *
 * The backend was never the frozen half: stampProdReadAt() in program/audit-scoreboard.routes.ts
 * does a real Neon `SELECT now()` per request and labels it neon_now vs request_time honestly.
 * THIS hook was the freeze — it fetched ONCE in a `useEffect(..., [])` with a raw fetch and never
 * asked again, so "live prod read <time>" sat at whatever second the tab was opened.
 *
 * Now a TanStack Query on a 3s interval, refetchIntervalInBackground so a board left open on a wall
 * display keeps moving. The committed snapshot stays as placeholderData, so first paint is instant
 * and an unwired/offline endpoint degrades to the snapshot exactly as before.
 */
const SCOREBOARD_POLL_MS = 3000;

function snapshotFallback(): LiveScoreboard {
  return {
    ...PROGRAM_SCOREBOARD,
    meta: {
      ...PROGRAM_SCOREBOARD.meta,
      // Deterministic Last synced from ledger commit ISO (meta.generatedAt = git log %cI).
      lastSyncedCt: formatLedgerCt(PROGRAM_SCOREBOARD.meta.generatedAt),
    },
    recentActivity: [],
  };
}

async function fetchScoreboard(): Promise<LiveScoreboard | null> {
  const r = await fetch(resolveApiUrl("/api/v1/program/audit-scoreboard"), { credentials: "include" });
  if (!r.ok || r.status === 204) return null;
  const json = await r.json();
  if (!json || !Array.isArray(json.modules)) return null;
  const live = json as LiveScoreboard;
  return {
    ...live,
    meta: { ...live.meta, lastSyncedCt: live.meta?.lastSyncedCt || formatLedgerCt(live.meta?.generatedAt) },
    recentActivity: Array.isArray(live.recentActivity) ? live.recentActivity : [],
  };
}

function useScoreboard(): LiveScoreboard {
  const { data } = useQuery({
    queryKey: ["program", "audit-scoreboard"],
    queryFn: fetchScoreboard,
    refetchInterval: SCOREBOARD_POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    placeholderData: (prev) => prev ?? snapshotFallback(),
    // Never blank a rendered board on a transient blip — keep the last good payload.
    retry: 1,
  });
  return data ?? snapshotFallback();
}

export function AuditScoreboardPage() {
  const sb = useScoreboard();
  // Alias *At fields — verify-no-native-datetime-input flags camelCase names ending in At as date fields.
  const prodReadSnapshot = sb.meta.prodReadAt;
  const prodReadSource = sb.meta.prodReadSource ?? "committed_fallback";
  const prodReadLabel =
    prodReadSource === "neon_now"
      ? "live prod read (Neon now)"
      : prodReadSource === "request_time"
        ? "request time (Neon stamp unavailable)"
        : "seeded snapshot (first paint)";
  const generatedOn = sb.meta.generatedAt.slice(0, 10);
  // Last synced = ledger git commit (meta.generatedAt / lastSyncedCt), America/Chicago CT — not wall clock.
  const lastSyncedLabel = sb.meta.lastSyncedCt || formatLedgerCt(sb.meta.generatedAt);
  const recentRows = sb.recentActivity ?? [];

  const metrics = useMemo(() => {
    let prod = 0, audit = 0, fix = 0, fail = 0, unv = 0, certified = 0, vprod = 0, vopen = 0;
    for (const m of sb.modules) {
      for (const c of m.cells) {
        if (c === "PASS") prod++;
        else if (c === "AUDIT") audit++;
        else if (c === "FIX") fix++;
        else if (c === "FAIL") fail++;
        else if (c === "UNV") unv++;
      }
      for (const i of VIDX) {
        const c = m.cells[i];
        if (c === "PASS") vprod++;
        else if (c !== "NA") vopen++;
      }
      const present = m.cells.filter((c) => c !== "NA");
      if (present.length && present.every((c) => c === "PASS")) certified++;
    }
    return { prod, audit, fix, fail, unv, certified, vprod, vopen };
  }, [sb]);

  const gateTally = useMemo(() => {
    const fromMeta = sb.meta.gateTally;
    if (fromMeta && GATE_LABELS.every((g) => fromMeta[g])) return fromMeta;
    const computed: Record<string, { pass: number; applicable: number; fail: number; unverified: number }> = {};
    for (let i = 0; i < GATE_LABELS.length; i++) {
      let pass = 0;
      let applicable = 0;
      let fail = 0;
      let unverified = 0;
      for (const m of sb.modules) {
        const c = m.cells[i] || "UNV";
        if (c === "NA") continue;
        applicable += 1;
        if (c === "PASS") pass += 1;
        else if (c === "FAIL") fail += 1;
        else if (c === "UNV") unverified += 1;
      }
      computed[GATE_LABELS[i]] = { pass, applicable, fail, unverified };
    }
    return computed;
  }, [sb]);

  return (
    <div className="ih35sb">
      <style>{CSS}</style>

      {/* Program module top-nav tabs — Scoreboard is the main/default page */}
      <nav className="tabs">
        <span className="tab active">Scoreboard</span>
        {/* PROG-NAV-01: the live 24-slice board at /home/scenario-tracker was routed but had ZERO
            inbound links anywhere in the app — no rail item (the rail renders only
            SIDEBAR_ITEM_META; getSidebarFlyoutItems is not imported by Sidebar.tsx), no tab, no
            home link. It was reachable only by typing the URL. Added here rather than as a 31st
            sidebar id: the locked 30-item contract + the 30-file Rule 24 module manifest would both
            have to move for a surface that is a view of the Program board, not a module. */}
        <Link className="tab" to="/program/scenario-tracker">Scenario tracker</Link>
        <Link className="tab" to="/program/tracker">Tracker</Link>
        <Link className="tab" to="/program/modules">Module completion</Link>
        <Link className="tab" to="/program/final-additions">Final additions</Link>
      </nav>

      <header className="hd" data-testid="program-scoreboard-header">
        <div className="t">Deep-Linkage Certification Scoreboard</div>
        <div className="s">
          ledger <code>AUDIT-COVERAGE-LIVE.md</code> · main @ <b>{sb.meta.sourceSha}</b> · deployed @ <b>{sb.meta.deployedSha}</b> ·
          {prodReadLabel} <b>{prodReadSnapshot}</b> · generated {generatedOn}.
          <b> Complete = DoD A–E + VERIFY 1–8, PROD-VERIFIED per entity</b> — not five layers. Green = proven live only;
          amber = traced in code, must be exercised live. A code trace or route string is not proof; it must be clicked/called live.
        </div>
        <div className="synced" data-testid="program-scoreboard-last-synced">
          Last synced: <b>{lastSyncedLabel}</b>
          <span className="synced-note"> · from ledger git commit (not wall clock)</span>
        </div>
      </header>

      <section className="recent" data-testid="program-scoreboard-recent-activity">
        <h2>
          Recent activity — last 10 PRs{" "}
          <span className="sub">live from GitHub · times in CT (America/Chicago)</span>
        </h2>
        {recentRows.length === 0 ? (
          <p className="recent-empty">
            No recent PRs returned yet — panel fills from the live GitHub heartbeat on the next API
            response (empty on error; never blocks the board).
          </p>
        ) : (
          <ul className="recent-list">
            {recentRows.map((row) => (
              <li key={row.number} data-testid={`program-scoreboard-recent-pr-${row.number}`}>
                <a href={row.url} target="_blank" rel="noreferrer">
                  #{row.number}
                </a>
                <span className="recent-title">
                  {row.state ? <span className="recent-state">{row.state}</span> : null}
                  {row.title}
                </span>
                <span className="recent-when">{row.mergedAtCt}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="gate-tally" data-testid="program-scoreboard-gate-tally">
        <div className="gate-tally-hd">13-gate tally <span className="sub">pass / applicable · weakest column = next wave</span></div>
        <div className="gate-tally-row">
          {GATE_LABELS.map((g) => {
            const t = gateTally[g] ?? { pass: 0, applicable: 0, fail: 0, unverified: 0 };
            const ratio = t.applicable > 0 ? t.pass / t.applicable : 0;
            const tone = t.applicable === 0 ? "na" : ratio >= 0.85 ? "strong" : ratio >= 0.4 ? "mid" : "weak";
            return (
              <div key={g} className={`gate-cell ${tone}`} data-testid={`program-scoreboard-gate-${g}`}>
                <div className="gate-name">{g}</div>
                <div className="gate-ratio">
                  {t.pass}/{t.applicable}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="metrics">
        <Metric cls="big" n={`${metrics.certified} / 30`} l="Modules certified (all 13 gates per entity)" />
        <Metric cls="good" n={metrics.vprod} l="V2/V3/V4-class gates PROD-VERIFIED" />
        <Metric cls="amb" n={metrics.vopen} l="VERIFY gates open (audit/fix/fail/unv)" />
        <Metric cls="good" n={metrics.prod} l="All gate-cells PROD-VERIFIED live" />
        <Metric cls="amb" n={metrics.audit} l="Gate-cells AUDIT — re-verify live" />
        <Metric cls="" n={metrics.fail} l="Gate-cells FAIL — open defect" />
      </div>

      <div className="legend">
        <Lg c="PASS" t="P — PROD-VERIFIED live" /><Lg c="AUDIT" t="A — traced, re-verify live" />
        <Lg c="FIX" t="F — merged, awaiting deploy" /><Lg c="FAIL" t="X — open defect" />
        <Lg c="UNV" t="U — not exercised / 0 data" /><Lg c="NA" t="— N/A" />
      </div>

      {/* BY-CLASS SCOREBOARD — the other axis of the work.
          The gate tally above is per-MODULE; work is dispatched vertically by defect CLASS across all
          modules, and until now that status lived only in docs/audit/wave-queue.json where nobody
          could see it. Generated by scripts/gen-class-scoreboard.mjs; the queue is the source of truth. */}
      <h2>
        By class{" "}
        <span className="sub">
          {CLASS_SCOREBOARD.summary.total} classes · {CLASS_SCOREBOARD.summary.drained} drained ·{" "}
          {CLASS_SCOREBOARD.summary.building} building · {CLASS_SCOREBOARD.summary.notStarted} not started ·{" "}
          {CLASS_SCOREBOARD.summary.liveDefect} live defect — CC drained / BB building / NN not started / XX live defect
        </span>
      </h2>
      {CLASS_SCOREBOARD.summary.drainedWithoutGuard > 0 ? (
        <div className="clsWarn" data-testid="class-scoreboard-guard-warning">
          {CLASS_SCOREBOARD.summary.drainedWithoutGuard} class(es) marked <strong>drained</strong> name a guard file
          that is not on disk. A class is only drained when its guard exists — these are registry defects
          (usually a stale filename), not proof the class is unguarded.
        </div>
      ) : null}
      <div className="clsGrid" data-testid="class-scoreboard">
        {CLASS_SCOREBOARD.rows.map((r) => (
          <div className={`clsCell ${r.tone}`} key={r.id} title={`${r.id} — ${r.label} · lane ${r.lane} · ${r.instances} instance(s)`}>
            <span className="clsCode">{r.code}</span>
            <span className="clsId">{r.id.replace(/^CLS-/, "")}</span>
            {r.guardMissing ? <span className="clsFlag" title={`guard not found: ${r.guard ?? "none named"}`}>!</span> : null}
          </div>
        ))}
      </div>

      {/* THE STANDARD */}
      <h2>The standard <span className="sub">what "complete" means — every gate below, PROD-VERIFIED, in both entities</span></h2>
      <div className="std">
        <div className="gg">
          <h3>DoD — record level</h3>
          {DOD.map(([k, v]) => (<div className="grow" key={k}><span className="gk">{k}</span><span>{fmt(v)}</span></div>))}
        </div>
        <div className="gg v">
          <h3>VERIFY — system level (the part shallow audits skipped)</h3>
          {VERIFY.map(([k, v]) => (<div className="grow" key={k}><span className="gk">{k}</span><span>{fmt(v)}</span></div>))}
        </div>
      </div>
      <div className="tiers">
        <div className="tk p"><b>PROD-VERIFIED</b><br />Live prod row / endpoint / click-through / passing guard on the deployed SHA. The only tier that counts as done.</div>
        <div className="tk a"><b>[AUDIT — RE-VERIFY LIVE]</b><br />Traced in code at a SHA. Exists + wired, never correct. A to-do, not a pass.</div>
        <div className="tk u"><b>UNVERIFIED — &lt;blocker&gt;</b><br />Named blocker + Step-1 reproduce. "0 data" lives here — never counted as done.</div>
      </div>
      <div className="rules">
        <b>The rules that keep it honest:</b> A count is not a chain — a live number fills a number cell, never upgrades a tier. ·
        A code trace is not a live click — V2/V3/V4 are proven only by exercising them. · Counts may use a full-bypass read;
        app-visibility &amp; every click use the <code>ih35_app</code> app path or the live app, never the owner role. ·
        No <code>--admin</code>, no fake green — CI is the gate. · Additive only — archive/supersede, never delete. ·
        Prod wins on facts; the owner wins on decisions. · A guess is a defect.
      </div>

      {/* REFERENCE CHAIN */}
      <h2>Reference chain — Insurance &amp; Legal claim <span className="sub">the depth every module's V4 must reach — "linked to everything," forward AND reverse</span></h2>
      <div className="refwrap">
        {sb.chain.filter((n) => !n.branch).map((n, i) => (
          <div key={i}>
            <ChainCard n={n} />
            {i < sb.chain.filter((x) => !x.branch).length - 1 && <div className="conn" />}
          </div>
        ))}
        <div className="branchrow">
          {sb.chain.filter((n) => n.branch).map((n, i) => <ChainCard key={i} n={n} />)}
        </div>
        <div className="money">{sb.chainMoney}</div>
        <div className="fanout">{sb.chainReverse}</div>
      </div>

      {/* OWNER DECISION 2026-08-05: the Scenario Tracker lives ONLY on Program, never on Home.
          Mounted here — ONCE, at page level — so /program shows the certification scoreboard AND the
          live end-to-end pipeline together. The dedicated /program/scenario-tracker route stays as
          the full-page view (tab above).

          SCENARIO-TRACKER-DUP: this used to sit inside ChainCard, which renders once per chain node,
          so the tracker mounted 9× — 9 headers, 36 entity chips, and 9 independent 3s useQuery polls
          plus 9 heartbeat intervals all hammering /api/v1/home/scenario-tracker. It is a page-level
          singleton; never move it back inside a mapped child. Guarded by
          scripts/verify-scenario-tracker-single-mount.mjs. */}
      <ScenarioTrackerHome />

      {/* LIVE PROD READ */}
      <h2>Live prod read <span className="sub">{prodReadLabel} · {prodReadSnapshot} · all entities</span></h2>
      <div className="prodpanel">
        {sb.prod.map((p, i) => (
          <div className={`pc ${p.tone ?? ""}`} key={i}>
            <div className="pn">{p.n}</div><div className="pl">{p.label}</div><div className="pd">{p.detail}</div>
          </div>
        ))}
      </div>

      {/* MODULE TABLE */}
      <h2>By module <span className="sub">DoD A·B·C·D·E + VERIFY 1–8 — 13 gates, provenance-honest</span></h2>
      <div className="scroll overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th rowSpan={2}>Tier</th><th rowSpan={2}>Module</th>
              <th className="grp" colSpan={5}>DoD</th>
              <th className="grpv" colSpan={8}>VERIFY (system)</th>
              <th rowSpan={2}>Top open gap · live status</th>
            </tr>
            <tr>{GATE_LABELS.map((g) => <th className="g" key={g}>{g}</th>)}</tr>
          </thead>
          <tbody>
            {sb.modules.map((m) => (
              <tr key={m.module}>
                <td><span className="tier">{m.tier}</span></td>
                <td className="mod">{m.module}</td>
                {m.cells.map((c, i) => (
                  <td className={`gc ${i === 5 ? "vsep" : ""}`} key={i}><span className={`cell ${c}`}>{letter(c)}</span></td>
                ))}
                <td><small className="j">{m.gap}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* WIRING CHECKS */}
      <h2>The wiring checks (V2 · V3 · V4) <span className="sub">all live, never a code-read</span></h2>
      <div className="wiring">
        {WIRING.map(([k, v]) => (<div className="row" key={k}><span className="wk">{k}</span><div>{fmt(v)}</div></div>))}
      </div>

      {/* GUARD */}
      <h2>GUARD / prod live-verified this session</h2>
      <div className="guard">
        {sb.guard.map((g, i) => (
          <div className="row" key={i}><span className={`badge b-${g.tone}`}>{g.badge}</span><div>{fmt(g.text)}</div></div>
        ))}
      </div>

      <div className="note">
        <b>Why {metrics.certified}/30 — honestly.</b> No module has all 13 gates PROD-VERIFIED per entity. The board is mostly
        amber because those gates were traced in code but never exercised live — a code trace is not a pass. The gates the
        last audits skipped — <b>V2 picker+creator, V3 connectivity/wiring, V4 deep linkage</b> — are where the real work is.
        The insurance/legal web flips green the moment a claim is created and its chain is walked end to end, forward and reverse.
      </div>

      <div className="foot">
        Cells: <b>P</b> PROD-VERIFIED · <b>A</b> traced · <b>F</b> fix merged, awaiting deploy · <b>X</b> open defect ·
        <b> U</b> not exercised / 0 data · <b>—</b> N/A. Generated from the ledger @ {sb.meta.sourceSha}
        ({sb.meta.ledgerRows} rows · {sb.meta.failOpen} FAIL+open · {sb.meta.defects} defects). A count is not a chain; a code trace is not a live click.
      </div>
    </div>
  );
}


/** Safe emphasis: **bold**, `code`, newlines. No innerHTML. */
function fmt(s: string): ReactNode {
  const lines = s.split("\n");
  return lines.map((line, li) => (
    <Fragment key={li}>
      {li > 0 ? <br /> : null}
      {fmtInline(line)}
    </Fragment>
  ));
}

function fmtInline(s: string): ReactNode[] {
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  return s.split(re).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <b key={i}>{part.slice(2, -2)}</b>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function Metric({ cls, n, l }: { cls: string; n: string | number; l: string }) {
  return (<div className={`metric ${cls}`}><div className="n">{n}</div><div className="l">{l}</div></div>);
}
function Lg({ c, t }: { c: string; t: string }) {
  return (<span><i className={`dot ${c}`} /> {t}</span>);
}
function ChainCard({ n }: { n: ProgramScoreboard["chain"][number] }) {
  return (
    <div className={`node ${n.hub ? "hub" : ""}`}>
      <div className="nt"><span>{n.title}</span><span className={`chip c-${n.chipTone}`}>{n.chip}</span></div>
      <div className="tbl">{n.table}</div>
      <div className="fk">{n.fk}</div>
    </div>
  );
}

const DOD: [string, string][] = [
  ["A", "**Active path** — route registered + component mounted + reachable nav leaf; no dead/ComingSoon twin."],
  ["B", "**Wizard depth** — every rendered field controlled AND in the submit payload."],
  ["C", "**Linkage forward+reverse** — canonical FKs both ways (memo / uuid-in-name / jsonb-ids = FAIL)."],
  ["D", "**Purpose→economics** — purpose picks the money object; no silent default."],
  ["E", "**Evidence** — live proof, or UNVERIFIED + a named blocker."],
];
const VERIFY: [string, string][] = [
  ["V1", "**Visual / QBO chrome** — ParityDrawer, Due auto, box-in-box, +Create/+Book, drawer-on-drawer."],
  ["V2", "**Universal picker + creator law (7 clauses)** — catalog behind it · **+Add new FIRST row** · opens the creator wizard · same canonical table R=W · new row appears · auto-selected + survives reload · entity-scoped. (Lists too.)"],
  ["V3", "**Connectivity / wiring** — every link / CoA account / List card, clicked, lands on the correct LIVE target; register→source drills; report figures reconcile. 404 / wrong target / empty tab = FAIL."],
  ["V4", "**Deep linkage chains F+R** — the full cross-module web (insurance/legal model), both ways, on live data."],
  ["V5", "**Catalogs / entity scope** — TRANSP AND USMCA; drivers-as-vendors; units by owner/lease; no cross-entity leak."],
  ["V6", "**Economics audit-grade** — header+lines; balanced JE when flag ON; control roles; NO TMS→QBO write-back."],
  ["V7", "**Tab / design law** — every approved leaf; no silent-missing; no invented tabs."],
  ["V8", "**Security / RLS** — FORCE RLS; correct GUC; security_invoker; grants."],
];
const WIRING: [string, string][] = [
  ["V2 picker+creator", "Every combobox: a catalog behind it → **+ Add new is the FIRST row** → click opens the correct **creator wizard** → saves to the SAME canonical table the picker reads → new row **appears + is selected + survives reload** → entity-scoped."],
  ["V2 Lists", "Clicking a Lists catalog card → the **correct list page** → correct data → **+ Create** opens the correct wizard → wired end-to-end (form→POST→canonical) → the created row appears in the list."],
  ["V3 CoA→register→report", "Every Chart-of-Accounts entry: BS accounts → their **register**; P&L accounts → the **correct report** → each register row drills to its **source document** → figures reconcile to Trial Balance / P&L / Balance Sheet."],
  ["V3 connectivity", "Every EntityLink, clicked, lands on the correct **live** target — bill→vendor→vendor detail→back to bill — forward AND reverse. A route string is not proof."],
  ["V4 deep linkage", "The full cross-module web above, walked forward AND reverse on live data (the insurance/legal claim model), reaching a balanced JE where a money terminus exists."],
];

const CSS = `
.ih35sb{--navy:#1f2a44;--navy-dk:#0f1729;--slate:#334155;--slate-lt:#64748b;--bg:#f8fafc;--card:#fff;--line:#e2e8f0;--green:#16a34a;--green-bg:#dcfce7;--red:#dc2626;--red-bg:#fee2e2;--amber:#d97706;--amber-bg:#fef3c7;--accent:var(--navy);--accent-bg:#e8eef7;--gray:#64748b;--gray-bg:#f1f5f9;--verify:var(--slate);--verify-bg:#eef2f7;color:var(--navy);font-size:14px;padding:0 4px 40px}
.ih35sb *{box-sizing:border-box}
.ih35sb .tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:14px}
.ih35sb .tab{padding:9px 16px;font-size:13px;font-weight:600;color:var(--slate-lt);text-decoration:none;border-bottom:2px solid transparent}
.ih35sb .tab.active{color:var(--navy);border-bottom-color:var(--navy)}
.ih35sb .hd{background:var(--navy);color:#fff;padding:16px 20px;border-radius:10px}
.ih35sb .hd .t{font-size:18px;font-weight:700}
.ih35sb .hd .s{color:#94a3b8;font-size:12px;margin-top:6px;line-height:1.55}
.ih35sb .hd .synced{margin-top:10px;font-size:12px;color:#e2e8f0}
.ih35sb .hd .synced b{color:#fff}
.ih35sb .hd .synced-note{color:#94a3b8;font-weight:400}
.ih35sb .recent{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:14px 0 0}
.ih35sb .recent h2{margin:0 0 10px;border:none;padding:0}
.ih35sb .recent-empty{margin:0;font-size:12px;color:var(--slate-lt)}
.ih35sb .recent-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ih35sb .recent-list li{display:grid;grid-template-columns:64px 1fr auto;gap:10px;align-items:baseline;font-size:12px;padding:6px 0;border-top:1px dashed var(--line)}
.ih35sb .recent-list li:first-child{border-top:none}
.ih35sb .recent-list a{font-weight:700;color:var(--navy);text-decoration:none}
.ih35sb .recent-list a:hover{text-decoration:underline}
.ih35sb .recent-title{color:var(--slate);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ih35sb .recent-state{display:inline-block;margin-right:6px;padding:1px 5px;border-radius:3px;background:var(--gray-bg);color:var(--slate);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.02em}
.ih35sb .recent-when{color:var(--slate-lt);white-space:nowrap}
.ih35sb .gate-tally{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:16px 0 0}
.ih35sb .gate-tally-hd{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--slate);margin-bottom:10px}
.ih35sb .gate-tally-hd .sub{text-transform:none;letter-spacing:0;font-weight:400;color:var(--slate-lt);margin-left:8px}
.ih35sb .gate-tally-row{display:grid;grid-template-columns:repeat(13,minmax(0,1fr));gap:6px}
.ih35sb .gate-cell{border-radius:8px;padding:8px 4px;text-align:center;border:1px solid var(--line);background:var(--gray-bg)}
.ih35sb .gate-cell.strong{background:var(--navy);border-color:var(--navy);color:#fff}
.ih35sb .gate-cell.mid{background:var(--accent-bg);border-color:#c5d0e3;color:var(--navy)}
.ih35sb .gate-cell.weak{background:#fff;border-color:#cbd5e1;color:var(--slate)}
.ih35sb .gate-cell.na{opacity:.55}
.ih35sb .gate-name{font-size:10px;font-weight:800;letter-spacing:.02em}
.ih35sb .gate-cell.strong .gate-name{color:#cbd5e1}
.ih35sb .gate-ratio{font-size:12px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums}
.ih35sb .metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:16px 0}
.ih35sb .metric{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 13px}
.ih35sb .metric .n{font-size:22px;font-weight:800;line-height:1}
.ih35sb .metric .l{font-size:10px;color:var(--slate-lt);text-transform:uppercase;letter-spacing:.3px;margin-top:8px;line-height:1.3}
.ih35sb .metric.big .n{color:var(--red)} .ih35sb .metric.good .n{color:var(--green)} .ih35sb .metric.amb .n{color:var(--amber)}
.ih35sb h2{font-size:13.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--slate);margin:26px 0 12px;border-bottom:1px solid var(--line);padding-bottom:8px}
.ih35sb h2 .sub{text-transform:none;letter-spacing:0;color:var(--slate-lt);font-weight:400;font-size:12px;margin-left:8px}
.ih35sb .legend{display:flex;gap:13px;flex-wrap:wrap;margin:10px 0;font-size:12px;color:var(--slate)}
.ih35sb .legend span{display:inline-flex;align-items:center;gap:5px}
.ih35sb .dot{width:11px;height:11px;border-radius:3px;display:inline-block;border:1px solid rgba(0,0,0,.08)}
.ih35sb .clsGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:6px;margin:8px 0 14px}
.ih35sb .clsCell{display:flex;align-items:center;gap:6px;border:1px solid var(--slate-lt);border-radius:2px;padding:5px 7px;font-size:11px;background:#fff}
.ih35sb .clsCell .clsCode{font-weight:700;font-family:ui-monospace,monospace;letter-spacing:.5px}
.ih35sb .clsCell .clsId{color:var(--slate);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ih35sb .clsCell .clsFlag{margin-left:auto;font-weight:700;color:var(--red)}
.ih35sb .clsCell.green{background:var(--green-pill);border-color:#a7d8bf}
.ih35sb .clsCell.amber{background:#fff;border-color:var(--slate-lt)}
.ih35sb .clsCell.amber .clsCode{color:var(--slate)}
.ih35sb .clsCell.grey{background:var(--bg)}
.ih35sb .clsCell.grey .clsCode{color:var(--slate-lt)}
.ih35sb .clsCell.red{background:#fff;border-color:var(--red)}
.ih35sb .clsCell.red .clsCode{color:var(--red)}
.ih35sb .clsWarn{border:1px solid var(--red);border-radius:2px;padding:7px 9px;font-size:12px;color:var(--slate);background:#fff;margin:6px 0}
.ih35sb .std{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ih35sb .gg{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.ih35sb .gg h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--slate)}
.ih35sb .gg.v h3{color:var(--verify)}
.ih35sb .grow{display:flex;gap:9px;padding:5px 0;border-top:1px dashed var(--line);font-size:12px;line-height:1.4}
.ih35sb .grow:first-of-type{border-top:none}
.ih35sb .gk{font-weight:800;min-width:26px;color:var(--navy)} .ih35sb .gg.v .gk{color:var(--verify)}
.ih35sb .tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
.ih35sb .tk{border:1px solid var(--line);border-radius:10px;padding:11px 13px;background:var(--card);font-size:12px;line-height:1.45}
.ih35sb .tk.p{border-left:4px solid var(--green)} .ih35sb .tk.a{border-left:4px solid var(--amber)} .ih35sb .tk.u{border-left:4px solid var(--gray)}
.ih35sb .rules{background:var(--navy-dk);color:#e2e8f0;border-radius:10px;padding:13px 16px;margin-top:10px;font-size:12px;line-height:1.7}
.ih35sb .rules b{color:#fff}
.ih35sb .refwrap{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.ih35sb .node{border:1px solid var(--line);border-radius:9px;padding:9px 12px;background:#fff}
.ih35sb .node.hub{border:2px solid var(--verify);background:var(--verify-bg)}
.ih35sb .node .nt{font-weight:800;font-size:12.5px;display:flex;justify-content:space-between;gap:8px;align-items:center}
.ih35sb .node .tbl{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--slate);margin-top:2px}
.ih35sb .node .fk{font-size:11px;color:var(--slate-lt);margin-top:3px;line-height:1.4}
.ih35sb .chip{font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:20px;white-space:nowrap}
.ih35sb .c-prod{color:var(--green);background:var(--green-bg)} .ih35sb .c-unv{color:var(--gray);background:var(--gray-bg)}
.ih35sb .c-fix{color:var(--accent);background:var(--accent-bg)} .ih35sb .c-fail{color:var(--red);background:var(--red-bg)}
.ih35sb .conn{width:2px;height:15px;background:var(--slate-lt);margin:0 auto}
.ih35sb .branchrow{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px}
.ih35sb .fanout{margin-top:14px;background:var(--verify-bg);border:1px dashed var(--slate-lt);border-radius:9px;padding:10px 12px;font-size:12px;color:var(--slate);line-height:1.5}
.ih35sb .money{margin-top:12px;background:#ecfdf5;border:1px solid #86efac;border-radius:9px;padding:10px 12px;font-size:12px;color:#065f46;line-height:1.5}
.ih35sb .prodpanel{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.ih35sb .pc{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.ih35sb .pc .pn{font-size:18px;font-weight:800} .ih35sb .pc .pl{font-size:11px;color:var(--slate-lt);margin-top:4px;text-transform:uppercase;letter-spacing:.3px}
.ih35sb .pc .pd{font-size:11.5px;color:var(--slate);margin-top:6px;line-height:1.4}
.ih35sb .pc.zero .pn{color:var(--gray)} .ih35sb .pc.flag .pn{color:var(--red)} .ih35sb .pc.good .pn{color:var(--green)}
.ih35sb .scroll{overflow-x:auto;border-radius:10px;border:1px solid var(--line)}
.ih35sb table{width:100%;border-collapse:collapse;background:var(--card);min-width:900px}
.ih35sb th,.ih35sb td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);font-size:12.5px}
.ih35sb th{background:#f1f5f9;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;color:var(--slate-lt)}
.ih35sb th.g{text-align:center;width:26px;padding:6px 3px}
.ih35sb th.grp{text-align:center;color:var(--navy);border-bottom:2px solid var(--line)}
.ih35sb th.grpv{text-align:center;color:var(--verify);border-bottom:2px solid var(--verify)}
.ih35sb tr:last-child td{border-bottom:none}
.ih35sb .mod{font-weight:600;white-space:nowrap}
.ih35sb td.gc{text-align:center;padding:5px 3px} .ih35sb td.vsep{box-shadow:inset 2px 0 0 var(--verify)}
.ih35sb .cell{display:inline-block;width:22px;text-align:center;font-weight:800;font-size:10px;padding:3px 0;border-radius:4px}
.ih35sb .cell.PASS{color:var(--green);background:var(--green-bg)} .ih35sb .cell.AUDIT{color:var(--amber);background:var(--amber-bg)}
.ih35sb .cell.FIX{color:var(--accent);background:var(--accent-bg)} .ih35sb .cell.FAIL{color:var(--red);background:var(--red-bg)}
.ih35sb .cell.UNV{color:var(--gray);background:var(--gray-bg)} .ih35sb .cell.NA{color:#b6c0cd;background:transparent}
.ih35sb .tier{font-size:10.5px;font-weight:700;color:#fff;background:var(--slate);padding:2px 7px;border-radius:20px;display:inline-block}
.ih35sb .wiring,.ih35sb .guard{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:4px 0}
.ih35sb .wiring .row,.ih35sb .guard .row{display:flex;gap:12px;padding:11px 16px;border-bottom:1px solid var(--line);align-items:flex-start;font-size:12.5px;line-height:1.5}
.ih35sb .wiring .row:last-child,.ih35sb .guard .row:last-child{border-bottom:none}
.ih35sb .wk{font-size:10.5px;font-weight:800;color:var(--verify);background:var(--verify-bg);padding:3px 8px;border-radius:5px;white-space:nowrap;margin-top:1px}
.ih35sb .badge{font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:5px;white-space:nowrap;margin-top:1px}
.ih35sb .b-ver{color:var(--green);background:var(--green-bg)} .ih35sb .b-pend{color:var(--accent);background:var(--accent-bg)}
.ih35sb .b-flag{color:var(--amber);background:var(--amber-bg)} .ih35sb .b-fail{color:var(--red);background:var(--red-bg)}
.ih35sb .note{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-top:16px;font-size:13px;color:#78350f;line-height:1.55}
.ih35sb .foot{color:var(--slate-lt);font-size:11.5px;margin-top:20px;line-height:1.6}
.ih35sb code{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:12px}
@media(max-width:900px){.ih35sb .metrics{grid-template-columns:repeat(2,1fr)}.ih35sb .std,.ih35sb .tiers,.ih35sb .prodpanel,.ih35sb .branchrow{grid-template-columns:1fr}}
`;

export default AuditScoreboardPage;
