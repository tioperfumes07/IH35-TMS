#!/usr/bin/env node
/**
 * UI-STANDARD guard — click-through everywhere (CLAUDE.md, master-sequence item 4, B-A3 2026-07-16):
 * no dead clicks on KpiCard / HomeKpiCard.
 *
 * Target: <KpiCard/> and <HomeKpiCard/> — shared + page-local helpers with those tag names
 * (apps/frontend/src/components/layout/KpiCard.tsx, apps/frontend/src/pages/home/HomeKpiCard.tsx,
 * and local function KpiCard in DispatchOverview / Settlements / Safety / Fleet / ReserveTracker / Docs).
 *
 * A KPI is OK when it has a real navigation prop (to / onClick / onNavigate) OR an honest
 * `disabled` state (no real destination — NOT_AVAILABLE_YET tooltip). A KPI is DEAD when it has
 * neither. No-op onClick handlers (empty body / undefined) are treated as DEAD unless also disabled.
 *
 * Do NOT invent placeholder/nearest-guess routes to shrink the dead count — that is a patch.
 * Prefer wiring a filter/route that returns the same metric's data, else mark disabled.
 *
 * BASELINE is the count of unresolved dead cards. Target is 0. Ratchet only downward.
 * Print inventory: DEAD_CLICK_BASELINE_PRINT=1 node scripts/verify-no-dead-clicks.mjs
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

// Unresolved dead KPI cards (neither nav nor honest disabled). B-A3 closed the ratchet to 0:
// remaining no-destination tiles must use disabled= (with NOT_AVAILABLE_YET), not inert divs.
const BASELINE = 0;

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
const DISABLED_PROP = /\bdisabled(?:\s|=|\/|>)/;
/** Empty / no-op onClick bodies that look clickable but do nothing. */
const NOOP_ONCLICK =
  /\bonClick=\{\s*(?:\(\)\s*=>\s*(?:\{\s*\}|undefined|null|void\s+0)?\s*|undefined|null)\s*\}/;

export function assertGuard({ file, source }) {
  const errors = [];
  const tags = extractTags(source, TAG_NAMES);
  for (const tag of tags) {
    const snippet = tag.replace(/\s+/g, " ").slice(0, 160);
    const isDisabled = DISABLED_PROP.test(tag);
    if (isDisabled) continue;

    if (NOOP_ONCLICK.test(tag)) {
      errors.push(
        `${file}: no-op onClick KPI (empty/undefined handler) without disabled= — wire a real drill-down or mark disabled. Tag: ${snippet}`
      );
      continue;
    }

    if (!NAV_PROP.test(tag)) {
      errors.push(
        `${file}: dead-click KPI card — no to=/onClick=/onNavigate= and no disabled=. Tag: ${snippet}`
      );
    }
  }
  for (const tag of extractTags(source, ["button"])) {
    const hasUndefinedHandler =
      /\bonClick=\{\s*undefined\s*\}/.test(tag) ||
      /\bonClick=\{[^{}]*\?[^{}]*:\s*undefined\s*\}/.test(tag);
    if (!hasUndefinedHandler || DISABLED_PROP.test(tag)) continue;
    const snippet = tag.replace(/\s+/g, " ").slice(0, 160);
    errors.push(
      `${file}: enabled button can receive an undefined onClick — conditionally disable it or render non-button text. Tag: ${snippet}`
    );
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
      n: "KpiCard disabled without nav → 0 (honest)",
      file: "Fixture.tsx",
      src: `<KpiCard label="Avg Age" number="3.2 y" disabled disabledReason="Not available yet" />`,
      want: 0,
    },
    {
      n: "KpiCard disabled shorthand → 0",
      file: "Fixture.tsx",
      src: `<KpiCard label="Severe" value={3} disabled />`,
      want: 0,
    },
    {
      n: "KpiCard no-op onClick → 1",
      file: "Fixture.tsx",
      src: `<KpiCard label="Loads" value={1} onClick={() => {}} />`,
      want: 1,
    },
    {
      n: "KpiCard no-op onClick + disabled → 0",
      file: "Fixture.tsx",
      src: `<KpiCard label="Loads" value={1} onClick={() => {}} disabled />`,
      want: 0,
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
      n: "native button with undefined handler → 1",
      file: "Fixture.tsx",
      src: `<button onClick={undefined}>Save</button>`,
      want: 1,
    },
    {
      n: "native button with conditional handler and disabled → 0",
      file: "Fixture.tsx",
      src: `<button onClick={canSave ? save : undefined} disabled={!canSave}>Save</button>`,
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
  console.log(`unresolved dead-click KpiCard/HomeKpiCard usages: ${total}`);
  for (const e of allErrors) console.log(`  - ${e}`);
  process.exit(total === 0 ? 0 : 1);
}

if (total > BASELINE) {
  console.error(`[${LABEL}] FAILED — ${total} unresolved dead-click KPI card(s), baseline is ${BASELINE}.`);
  for (const e of allErrors) console.error(`  ✗ ${e}`);
  console.error(
    `\nWire a real drill-down (to=/onClick= that filters/navigates to the metric's data), OR mark the tile disabled= with an honest reason. Do NOT invent nearest-guess routes.`
  );
  process.exit(1);
}

if (total < BASELINE) {
  console.log(
    `OK ${LABEL}: ${total} unresolved dead-click KPI cards (< baseline ${BASELINE}). Lower BASELINE to ${total} (DEAD_CLICK_BASELINE_PRINT=1).`
  );
} else {
  console.log(`[${LABEL}] OK — ${total} unresolved dead-click KPI card(s) == baseline ${BASELINE} (all tiles wired or honestly disabled).`);
}
