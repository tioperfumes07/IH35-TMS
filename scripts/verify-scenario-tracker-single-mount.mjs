#!/usr/bin/env node
/**
 * SCENARIO-TRACKER-DUP — the Scenario Tracker must mount EXACTLY ONCE per page.
 *
 * Live defect (verified in Chrome on app.ih35dispatch.com/program, 2026-08-06): <ScenarioTrackerHome />
 * was placed inside ChainCard, a component rendered once per chain node via .map(). The page mounted
 * 9 trackers — 9 "End-to-End Scenario Tracker" headers, 36 entity chips (4 per tracker), and 9
 * independent TanStack queries polling /api/v1/home/scenario-tracker every 3s with
 * refetchIntervalInBackground plus 9 five-second heartbeat intervals. That is a 9x read amplification
 * against prod from a single open tab, and it made the static legend sentence containing the word
 * STALE appear 9 times, which read as a staleness failure that did not exist.
 *
 * The rule this guard enforces is structural, not cosmetic: a component that owns a polling query is a
 * page-level singleton. Mounting it inside a mapped child multiplies network load by the collection
 * length — silently, with no visual error, and it scales with data.
 *
 * WHAT IS CHECKED, per file that imports ScenarioTrackerHome:
 *   1. At most ONE <ScenarioTrackerHome /> JSX usage.
 *   2. That usage is not lexically inside a component that is rendered from a .map() in the same file
 *      (the exact shape of the live defect).
 *
 * Deliberately NOT checked: whether two different pages each mount one. That is legitimate — the
 * /program/scenario-tracker route is a full-page view and /program embeds the same tracker once.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps/frontend/src");
const COMPONENT = "ScenarioTrackerHome";

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) out.push(p);
  }
  return out;
}

/**
 * Name of the component whose body lexically contains `index`, else null.
 *
 * The nearest PRECEDING declaration is not enough: a route element sitting in a top-level array after
 * an unrelated component would be misattributed to it (this exact false positive fired on
 * routes/manifest.tsx, where <ScenarioTrackerHome /> is a lazy route element ~90 lines after an
 * already-closed ListsCatalogKeyRoute). So require that the declaration is still OPEN at `index` —
 * i.e. no top-level `}` at column 0 sits between the declaration and the usage.
 */
function enclosingComponent(src, index) {
  const decl = /(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/g;
  let best = null;
  let m;
  while ((m = decl.exec(src)) !== null) {
    if (m.index >= index) break;
    best = { name: m[1] || m[2], start: m.index };
  }
  if (!best) return null;
  // A `}` or `)` starting a line at column 0 between decl and usage means that component already closed.
  if (/\n[)}]/.test(src.slice(best.start, index))) return null;
  return best.name;
}

const offenders = [];

export function auditFile(src, label) {
  const problems = [];
  if (!new RegExp(`\\b${COMPONENT}\\b`).test(src)) return problems;

  const uses = [...src.matchAll(new RegExp(`<${COMPONENT}\\b`, "g"))];
  if (uses.length === 0) return problems;

  if (uses.length > 1) {
    problems.push(`${label}: <${COMPONENT} /> mounted ${uses.length}x in one file — it owns a 3s polling query and must be a page-level singleton (mount it once).`);
  }

  for (const u of uses) {
    const owner = enclosingComponent(src, u.index);
    if (!owner) continue;
    // Is `owner` itself rendered from a .map(...) anywhere in this file?
    const mapped = new RegExp(`\\.map\\((?:[^)]*)\\)?[^;]*<${owner}\\b`, "s").test(src) ||
      new RegExp(`<${owner}\\b[^>]*/>\\s*\\}?\\s*\\)`, "s").test(src) && new RegExp(`\\.map\\(`).test(src) &&
      new RegExp(`\\.map\\([\\s\\S]{0,400}?<${owner}\\b`).test(src);
    if (mapped) {
      problems.push(`${label}: <${COMPONENT} /> is inside <${owner}>, which is rendered from a .map() — the tracker will mount once per item and poll prod once per item. Hoist it to page level.`);
    }
  }
  return problems;
}

// --- selftest -------------------------------------------------------------
if (process.argv.includes("--selftest")) {
  const cases = [
    ["clean page-level single mount", `function Page(){ return (<div>{rows.map((r,i)=><Card key={i} n={r}/>)}<ScenarioTrackerHome /></div>); }`, 0],
    ["the live defect: inside a mapped child", `function Page(){ return (<div>{rows.map((r,i)=><ChainCard key={i} n={r}/>)}</div>); }\nfunction ChainCard({n}){ return (<div><ScenarioTrackerHome /></div>); }`, 1],
    ["two mounts in one file", `function Page(){ return (<div><ScenarioTrackerHome /><ScenarioTrackerHome /></div>); }`, 1],
    ["file that never uses it", `function Page(){ return <div>nothing</div>; }`, 0],
    ["import only, no JSX usage", `import { ScenarioTrackerHome } from "./x";\nfunction Page(){ return <div/>; }`, 0],
    // Regression: routes/manifest.tsx shape — a route element AFTER an already-closed mapped component
    // must not be attributed to that component.
    ["route element after a closed mapped component", `function ListsCatalogKeyRoute(){\n  return <div/>;\n}\nconst routes = [\n  { path: "/x", element: <ScenarioTrackerHome /> },\n];\nconst other = items.map((i)=><ListsCatalogKeyRoute key={i}/>);`, 0],
  ];
  let bad = 0;
  for (const [name, src, expect] of cases) {
    const got = auditFile(src, "t.tsx").length;
    const ok = expect === 0 ? got === 0 : got >= 1;
    if (!ok) { bad++; console.error(`  selftest FAIL: ${name} — expected ${expect ? ">=1" : "0"} problem(s), got ${got}`); }
  }
  if (bad) { console.error(`verify-scenario-tracker-single-mount --selftest: ${bad} case(s) failed`); process.exit(1); }
  console.log(`verify-scenario-tracker-single-mount --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

for (const f of walk(SRC)) {
  const src = readFileSync(f, "utf8");
  offenders.push(...auditFile(src, relative(ROOT, f)));
}

if (offenders.length) {
  console.error("FAIL verify-scenario-tracker-single-mount — SCENARIO-TRACKER-DUP:");
  for (const o of offenders) console.error(`  · ${o}`);
  process.exit(1);
}
console.log("verify-scenario-tracker-single-mount: OK — ScenarioTrackerHome mounts once per page, never inside a mapped child");
