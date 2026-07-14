#!/usr/bin/env node
/**
 * UI-STANDARD guard — click-through everywhere (CLAUDE.md, master-sequence item 4, 2026-07-14):
 * no dead clicks. This guard is deliberately CONSERVATIVE and targets one well-defined, high-traffic
 * "primary card" component family rather than trying to audit every clickable-looking element in the
 * app (which would be noisy and false-positive-prone).
 *
 * Target: <KpiCard/> and <HomeKpiCard/> (apps/frontend/src/components/layout/KpiCard.tsx,
 * apps/frontend/src/pages/home/HomeKpiCard.tsx) — the shared "QuickBooks-style clickable-KPI" stat
 * tile used across primary list/detail pages (Drivers, Users, DispatchOverview, SettlementsPage,
 * DriverProfilePage, DriversListPage, ReserveTracker, FinanceHubPage, FleetTablePage,
 * SafetyEventsPage, DocsHomePage, the home KPI bars). Both components only become navigable when
 * given a `to` (react-router Link) prop — with neither `to` nor `onClick` they render as an inert
 * <div>, i.e. a dead click: a stat tile that looks like every other clickable KPI but does nothing.
 *
 * This is a RATCHET, not a full audit: a large number of pre-existing KpiCard/HomeKpiCard usages
 * (BASELINE below) are already non-navigable and are deliberately grandfathered — flattening them all
 * to `to=` is a separate, larger drill-down-routing effort, not this guard's job. The guard fails only
 * when a NEW dead KpiCard/HomeKpiCard is introduced (count goes up). To lower the baseline after wiring
 * more drill-downs: run `DEAD_CLICK_BASELINE_PRINT=1 node scripts/verify-no-dead-clicks.mjs` and set
 * BASELINE to the printed number.
 *
 * Not a duplicate of scripts/verify-clickable-kpis.mjs: that guard only asserts (a) KpiCard.tsx
 * exposes a `to` prop + renders a <Link>, and (b) apps/frontend/src/pages/home/roles/DefaultHome.tsx
 * alone has >=4 wired KPIs. This guard is a repo-wide ratchet across every KpiCard/HomeKpiCard call
 * site, catching a NEW dead card on any page — broader coverage, not a rebuild of that check.
 *
 * --selftest exercises assertGuard() against inline fixtures (pass + violation).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-dead-clicks";
const ROOTS = ["apps/frontend/src"];
const TAG_NAMES = ["KpiCard", "HomeKpiCard"];

// Frozen count of pre-existing dead (no to=/onClick=) KpiCard/HomeKpiCard usages, computed 2026-07-14
// via DEAD_CLICK_BASELINE_PRINT=1. Grandfathered — ratchet only downward. Do NOT raise without wiring a
// reason (a genuinely non-actionable summary tile) into this comment.
//
// B10 click-through rollout (2026-07-14): 49 -> 23. Wired 26 KPI cards to a REAL, pre-existing
// destination (a route/filter/panel that already exists — never a fabricated page): Drivers.tsx
// (Active/On Leave/Settle Due/Drivers Owe/Escrow), Users.tsx (all 4, via ?tab=), DispatchOverview.tsx
// (Active loads/At-risk-late/Units available), DocsHomePage.tsx (Total Docs/Expiring 30 Days, via local
// filter state), driver-finance/SettlementsPage.tsx (Total Unpaid/This Period/YTD Settlements, via
// ?payment_state=), ReserveTracker.tsx (FARO Reserve Held/Chargebacks Pending/Fees Paid YTD/Active
// Factor -> /factoring/reserves, /factoring/chargebacks-fees, /factoring/factors), FinanceHubPage.tsx
// (made the whole card a Link to the already-real kpi.drill_to, not just the footer), SafetyEventsPage.tsx
// (Total events/Open, via existing statusFilter state), DriverManagerKpiBar.tsx + SafetyKpiBar.tsx (all 6,
// -> /drivers/messages, /dispatch/alerts/late-arrivals, /driver-finance/settlements, /safety/idvr,
// /safety/hos/exceptions, /safety/cert-expiry). The remaining 23 are genuine gaps, NOT fake-wired: either
// the feature/filter genuinely doesn't exist yet (e.g. DriversListPage.tsx DQF-compliance-level filter,
// SettlementsPage "Drivers w/ Debt"/"Pending Acks"/"Held Deductions" have no matching filter param,
// ReserveTracker "Submitted (batches)"/"Advances Received" have no batches-list route — only
// /factoring/batches/new and /factoring/batches/:id exist) or the tile is a genuinely non-actionable
// aggregate (FleetTablePage "Avg Age", DriverProfilePage's 5 DQF summary tiles with no per-status filter
// on DriverDqfPanel, SafetyEventsPage "Severe"/"Commendations" with no matching list-endpoint filter,
// Drivers.tsx "On Loads"/"Available", DispatchOverview "Units needing return", DocsHomePage "Missing
// Required"/"Recent Uploads").
const BASELINE = 23;

/** Brace/quote-aware JSX opening-tag extractor — a `>` inside a `{...}` expression (e.g.
 *  `delta={pct > 0 ? up : down}`) must not prematurely close the tag. Only a `>` at brace depth 0 and
 *  outside a string literal ends the tag. */
function extractTags(src, tagNames) {
  const results = [];
  const re = new RegExp(`<(?:${tagNames.join("|")})\\b`, "g");
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    let i = m.index + m[0].length;
    let depth = 0;
    let inString = null;
    for (; i < src.length; i += 1) {
      const ch = src[i];
      if (inString) {
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "{") {
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        continue;
      }
      if (ch === ">" && depth === 0) {
        i += 1;
        break;
      }
    }
    results.push(src.slice(start, i));
  }
  return results;
}

const NAV_PROP = /\b(to|onClick|onNavigate)=/;

export function assertGuard({ file, source }) {
  const errors = [];
  const tags = extractTags(source, TAG_NAMES);
  for (const tag of tags) {
    if (!NAV_PROP.test(tag)) {
      errors.push(`${file}: dead-click KPI card — no to=/onClick= navigation prop. Tag: ${tag.replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }
  return errors;
}

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e);
    const st = fs.statSync(full);
    if (st.isDirectory()) out = out.concat(walk(full));
    else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) out.push(full);
  }
  return out;
}

function selftest() {
  const cases = [
    {
      n: "KpiCard with to= → 0",
      file: "Fixture.tsx",
      src: `<KpiCard label="Loads" number={12} to="/loads?status=open" />`,
      want: 0,
    },
    {
      n: "HomeKpiCard with onClick= → 0",
      file: "Fixture.tsx",
      src: `<HomeKpiCard label="Loads" number={12} onClick={() => nav("/loads")} />`,
      want: 0,
    },
    {
      n: "KpiCard with neither → 1 (dead click)",
      file: "Fixture.tsx",
      src: `<KpiCard label="Loads" number={12} accent="#334155" />`,
      want: 1,
    },
    {
      n: "HomeKpiCard multi-line, inline comparison expr in a prop, no nav → 1",
      file: "Fixture.tsx",
      src: `<HomeKpiCard\n  label="Late Loads"\n  number={count}\n  delta={pct > 0 ? "up" : "down"}\n  isLoading={loading}\n  isError={false}\n  error={null}\n  onRetry={refetch}\n/>`,
      want: 1,
    },
    {
      n: "HomeKpiCard multi-line WITH to= after an inline comparison expr → 0 (tag not truncated early)",
      file: "Fixture.tsx",
      src: `<HomeKpiCard\n  label="Late Loads"\n  number={count}\n  delta={pct > 0 ? "up" : "down"}\n  isLoading={loading}\n  isError={false}\n  error={null}\n  onRetry={refetch}\n  to="/loads?late=1"\n/>`,
      want: 0,
    },
    {
      n: "unrelated component (Button) → 0",
      file: "Fixture.tsx",
      src: `<Button onClick={undefined}>Save</Button>`,
      want: 0,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard({ file: c.file, source: c.src }).length;
    const ok = n === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n}, want=${c.want})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const files = ROOTS.flatMap((r) => walk(path.join(ROOT, r)));
let allErrors = [];
for (const abs of files) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
  const source = fs.readFileSync(abs, "utf8");
  allErrors = allErrors.concat(assertGuard({ file: rel, source }));
}

const total = allErrors.length;

if (process.env.DEAD_CLICK_BASELINE_PRINT) {
  console.log(`dead-click KpiCard/HomeKpiCard usages: ${total}`);
  for (const e of allErrors) console.log(`  - ${e}`);
  process.exit(0);
}

if (total > BASELINE) {
  console.error(`[${LABEL}] FAILED — ${total} dead-click KPI card(s) found, baseline is ${BASELINE}.`);
  for (const e of allErrors) console.error(`  ✗ ${e}`);
  console.error(`\nA NEW KpiCard/HomeKpiCard usage was added without a to=/onClick= navigation prop. Wire a drill-down route, or if the tile is genuinely non-actionable, this is intentional — re-run with DEAD_CLICK_BASELINE_PRINT=1 and raise BASELINE with a reason.`);
  process.exit(1);
}

if (total < BASELINE) {
  console.log(`OK ${LABEL}: ${total} dead-click KPI cards (< baseline ${BASELINE}). You wired up some drill-downs — please lower BASELINE to ${total} (DEAD_CLICK_BASELINE_PRINT=1) so the ratchet tightens.`);
} else {
  console.log(`[${LABEL}] OK — ${total} dead-click KPI card(s) == baseline ${BASELINE} (frozen; no NET-NEW dead clicks).`);
}
