#!/usr/bin/env node
/**
 * Owner 2026-10-04: module rail and Accounting More cannot scroll to the rest of the list.
 *   a) Sidebar aside: min-h-0 overflow-y-auto overscroll-contain; inner column min-h-full (not h-full)
 *   b) measureNavDropdownStyle: maxHeight = space below (or above) less 8px, overflowY auto,
 *      overscrollBehavior contain, flip above when space below < 160
 *
 * Static. --selftest plants each defect (7/7).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-scrollable-nav-is-reachable";
const SIDEBAR = "apps/frontend/src/components/Sidebar.tsx";
const NAV = "apps/frontend/src/components/forms/shared/HoverDropdownNav.tsx";

function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function findProblems({ sidebar, nav }) {
  const problems = [];
  const s = stripComments(sidebar);
  const n = stripComments(nav);

  if (!/\bmin-h-0\b/.test(s) || !/\boverflow-y-auto\b/.test(s) || !/\boverscroll-contain\b/.test(s)) {
    problems.push(`${SIDEBAR}: aside must carry min-h-0 overflow-y-auto overscroll-contain — overflow never engages in a flex row without min-h-0`);
  }
  if (!/\bmin-h-full\b/.test(s)) {
    problems.push(`${SIDEBAR}: inner column must be min-h-full so the rail can grow and still scroll`);
  }
  if (/flex h-full flex-col/.test(s)) {
    problems.push(`${SIDEBAR}: inner column still h-full — that locks height to the viewport and blocks overflow-y-auto`);
  }

  const measure = n.split("function measureNavDropdownStyle")[1] ?? "";
  if (!/maxHeight/.test(measure)) {
    problems.push(`${NAV}: measureNavDropdownStyle missing maxHeight — Accounting More clips below the fold`);
  }
  if (!/overflowY:\s*"auto"/.test(measure)) {
    problems.push(`${NAV}: measureNavDropdownStyle missing overflowY:"auto"`);
  }
  if (!/overscrollBehavior:\s*"contain"/.test(measure)) {
    problems.push(`${NAV}: measureNavDropdownStyle missing overscrollBehavior:"contain"`);
  }
  if (!/spaceBelow\s*<\s*160/.test(measure) && !/<\s*160/.test(measure)) {
    problems.push(`${NAV}: must flip above the anchor when space below < 160px`);
  }
  if (!/-\s*8\b/.test(measure) && !/gap\s*=\s*8/.test(measure)) {
    problems.push(`${NAV}: maxHeight must leave 8px below the anchor`);
  }
  return problems;
}

function loadReal() {
  return {
    sidebar: fs.readFileSync(path.join(ROOT, SIDEBAR), "utf8"),
    nav: fs.readFileSync(path.join(ROOT, NAV), "utf8"),
  };
}

function good() {
  return {
    sidebar: `<aside className="sidebar min-h-0 overflow-y-auto overscroll-contain"><div className="flex min-h-full flex-col">`,
    nav: `
      export function measureNavDropdownStyle(anchor) {
        const gap = 8;
        const spaceBelow = window.innerHeight - rect.bottom - gap;
        const flipAbove = spaceBelow < 160;
        const maxHeight = flipAbove ? spaceAbove : spaceBelow;
        return { maxHeight, overflowY: "auto", overscrollBehavior: "contain" };
      }
    `,
  };
}

function selftest() {
  const base = good();
  const cases = [
    { name: "scrollable rail + dropdown", files: base, expectFail: false },
    { name: "aside missing overflow-y-auto", files: { ...base, sidebar: base.sidebar.replace("overflow-y-auto", "") }, expectFail: true },
    { name: "aside missing min-h-0", files: { ...base, sidebar: base.sidebar.replace("min-h-0", "") }, expectFail: true },
    { name: "inner still h-full", files: { ...base, sidebar: `<aside className="min-h-0 overflow-y-auto overscroll-contain"><div className="flex h-full flex-col">` }, expectFail: true },
    { name: "dropdown missing maxHeight", files: { ...base, nav: base.nav.replace(/maxHeight/g, "minHeight") }, expectFail: true },
    { name: "dropdown missing overflowY auto", files: { ...base, nav: base.nav.replace('overflowY: "auto"', 'overflowY: "hidden"') }, expectFail: true },
    { name: "no flip at 160", files: { ...base, nav: base.nav.replace("spaceBelow < 160", "spaceBelow < 40") }, expectFail: true },
  ];
  let pass = 0;
  for (const c of cases) {
    const problems = findProblems(c.files);
    const failed = problems.length > 0;
    if (failed === c.expectFail) {
      pass += 1;
      console.log(`ok    ${c.name}`);
    } else {
      console.error(`FAIL  ${c.name} — expected ${c.expectFail ? "FAIL" : "PASS"}, got ${failed ? "FAIL" : "PASS"}`);
      if (problems.length) console.error(`      ${problems.join("\n      ")}`);
    }
  }
  console.log(`\n${LABEL} --selftest: ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
  process.exit(pass === cases.length ? 0 : 1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = findProblems(loadReal());
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} nav-scroll defect(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Sidebar min-h-0 overflow-y-auto; More dropdown maxHeight + flip at 160.`);
}

main();
