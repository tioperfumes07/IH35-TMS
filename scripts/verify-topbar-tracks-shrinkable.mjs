#!/usr/bin/env node
/**
 * TOPBAR-01 — the top-bar grid TRACKS must be able to shrink, and it must stack before it overlaps.
 *
 * The defect, verified live on prod 2026-07-29: gridTemplateColumns was "1fr auto 1fr". A bare `1fr`
 * is `minmax(auto, 1fr)` — the `auto` floor means the TRACK will not shrink below its content, so the
 * side columns overflowed into the fixed `auto` middle and the chrome rendered on top of itself.
 * The company switcher sat at x:410 y:51 w:164 h:26 and document.elementFromPoint() at its exact
 * centre returned an <svg>: the button was physically unclickable and operator clicks landed on
 * Notifications or the help link. Entities could not be switched at all below ~1400px.
 *
 * All three grid children already carried `min-w-0` when this broke. That is exactly why the earlier
 * attempt failed and why this guard checks the TRACK, not the item: min-width on a grid ITEM cannot
 * override the implicit `auto` minimum of a `1fr` TRACK.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TOPBAR = join(ROOT, "apps/frontend/src/components/Topbar.tsx");
const CSS = join(ROOT, "apps/frontend/src/styles/responsive-breakpoints.css");

/** The grid-template-columns value must not contain a bare `1fr`/`auto` track. */
export function tracksAreShrinkable(decl) {
  if (!decl) return false;
  const tracks = decl.split(/\s+/).filter(Boolean);
  return tracks.every((t) => t.startsWith("minmax(0,") || t.startsWith("minmax(0"));
}

export function extractGridDecl(src) {
  const m = src.match(/gridTemplateColumns:\s*"([^"]+)"/);
  return m ? m[1].replace(/,\s*/g, ",") : null;
}

export function stackBreakpointPx(css) {
  // the media query that forces .top-bar to a single column
  const blocks = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)];
  for (const b of blocks) if (/\.top-bar\s*\{[^}]*grid-template-columns/.test(b[2])) return Number(b[1]);
  return null;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    { n: "bare 1fr auto 1fr -> rejected (the real defect)", v: "1fr,auto,1fr", want: false },
    { n: "minmax(0,1fr) minmax(0,auto) minmax(0,1fr) -> accepted", v: "minmax(0,1fr),minmax(0,auto),minmax(0,1fr)", want: true },
    { n: "mixed (one bare track) -> rejected", v: "minmax(0,1fr),auto,minmax(0,1fr)", want: false },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = tracksAreShrinkable(c.v.replace(/,/g, " ").replace(/minmax\(0 /g, "minmax(0,"));
    if (got !== c.want) { console.error(`  selftest FAIL — ${c.n}`); bad++; } else console.log(`  selftest OK — ${c.n}`);
  }
  const bpOk = stackBreakpointPx("@media (max-width: 1279px) {\n  .top-bar {\n    grid-template-columns: minmax(0, 1fr) !important;\n  }\n}") === 1279;
  if (!bpOk) { console.error("  selftest FAIL — breakpoint parser"); bad++; } else console.log("  selftest OK — breakpoint parser reads the media query");
  if (bad) { console.error(`SELFTEST FAILED — ${bad}`); process.exit(1); }
  console.log("verify-topbar-tracks-shrinkable SELFTEST OK — 4/4");
  process.exit(0);
}

const decl = extractGridDecl(readFileSync(TOPBAR, "utf8"));
if (!decl) { console.error("verify:topbar-tracks-shrinkable FAIL — gridTemplateColumns not found in Topbar.tsx"); process.exit(1); }
if (!tracksAreShrinkable(decl.replace(/,/g, " ").replace(/minmax\(0 /g, "minmax(0,"))) {
  console.error(`verify:topbar-tracks-shrinkable FAIL — every track must be minmax(0, …); got "${decl}".`);
  console.error("A bare `1fr` is minmax(auto,1fr): the TRACK cannot shrink, the columns overlap, and the");
  console.error("company switcher becomes physically unclickable. min-w-0 on the child does NOT fix this.");
  process.exit(1);
}
const bp = stackBreakpointPx(readFileSync(CSS, "utf8"));
if (bp === null) { console.error("verify:topbar-tracks-shrinkable FAIL — no .top-bar single-column media query found"); process.exit(1); }
if (bp < 1279) {
  console.error(`verify:topbar-tracks-shrinkable FAIL — .top-bar stacks only at <=${bp}px; the three-column chrome needs far more than that and overlapped between 768px and ~1400px. Require >=1279px.`);
  process.exit(1);
}
console.log(`verify:topbar-tracks-shrinkable OK — tracks "${decl}" all shrinkable; stacks at <=${bp}px`);
