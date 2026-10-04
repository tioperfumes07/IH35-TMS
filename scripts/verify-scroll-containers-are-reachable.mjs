#!/usr/bin/env node
/**
 * verify-scroll-containers-are-reachable — step 18113 (lead, 2026-10-04).
 *
 * OWNER REPORT (2026-10-04, verbatim): "THE PAGES ARE NOT SCROLLING CORRECTLY, I CAN SEE UP TO
 * FINANCE HUB BUT I CANNOT SCROLL DOWN TO GO TO OTHER MODULES AND IN ACCOUNTING MORE I SEE THE
 * LIST, BUT I CANNOT SCROLL DOWN TO A SUB TAB I AM LOOKING FOR. SOMETHING IS BROKEN IN THE ENTIRE
 * APP FOR SCROLLING AUTO ADJUST TO SIZES ETC."
 *
 * Two mechanically different defects produced the same symptom, and each one is a CLASS, not a
 * one-off. This guard closes both classes permanently.
 *
 * CLASS A — a flex child declares `overflow-y-auto` with no `min-h-0`.
 *   In a flex container a child's default `min-height: auto` refuses to shrink below its content,
 *   so the child grows past the container instead of scrolling. `overflow-y-auto` is then dead
 *   markup: the scroller never engages and the tail of the content is rendered and unreachable.
 *   Only `min-h-0` (or an explicit min-height/basis) lets the child shrink so the scroller runs.
 *   This is why the module rail clipped at Finance Hub.
 *
 * CLASS B — a `position: fixed` menu/popover style object sets no `maxHeight`.
 *   A fixed element does not move on page scroll and, with no max-height and no scroller of its
 *   own, anything past the viewport edge is unreachable by ANY scroll gesture. Escaping an
 *   ancestor's overflow via a portal (GO-23) solves CLIPPING and says nothing about HEIGHT. This
 *   is why Accounting "More" — the longest child list in the app — lost its tail.
 *
 * Both classes are shrink-only baselined: the counts may fall, never rise. A new offender fails
 * the build; retiring one requires lowering the baseline in the same commit.
 *
 * Usage:
 *   node scripts/verify-scroll-containers-are-reachable.mjs
 *   node scripts/verify-scroll-containers-are-reachable.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps/frontend/src"];
const EXTS = new Set([".tsx", ".ts"]);

/**
 * Shrink-only baselines. MEASURED on main @ c24d8fe6 before this guard shipped.
 * Lower these when an offender is retired; never raise them.
 */
export const BASELINE_FLEX_SCROLLER_WITHOUT_MIN_H_0 = 0;
export const BASELINE_FIXED_MENU_WITHOUT_MAX_HEIGHT = 0;

/** A className string that turns on vertical scrolling. */
const SCROLL_Y_RE = /\boverflow-y-(?:auto|scroll)\b|\boverflow-(?:auto|scroll)\b/;
/**
 * The escape hatches. Any ONE of these means the element's height is already bounded or already
 * shrinkable, so its scroller provably engages and it is NOT this class:
 *   min-h-0 / min-h-[...]  — explicitly allowed to shrink below content (the canonical fix)
 *   max-h-*                — height capped outright, scroller runs inside the cap
 *   inset-0 / inset-y-0    — a fixed/absolute overlay pinned to both edges: height IS the viewport
 *   h-full / h-screen / h-[...] — an explicit height, so there is something to scroll within
 *   flex-1 / basis-0       — zero flex-basis, the author gave it a shrinkable track
 * MEASURED: without these, the detector flagged 27 sites, 27 of them correct — full-screen modal
 * backdrops and flex-1 panes. A guard that cries wolf is worse than no guard.
 */
const CAN_SHRINK_RE =
  /\bmin-h-0\b|\bmin-h-\[|\bmin-height\b|\bmax-h-|\binset-0\b|\binset-y-0\b|\bh-full\b|\bh-screen\b|\bh-\[|\bflex-1\b|\bbasis-0\b/;
/** Markers that the element is a flex/grid child in a column or row track. */
const FLEX_CONTEXT_RE = /\bflex\b|\bflex-col\b|\bflex-1\b|\bgrid\b|\bshrink-0\b|\bgrow\b/;
/** Opt-out for a scroller that is provably NOT a flex child (documented, one per site). */
const OPT_OUT = "scroll-reachable-exempt";

export function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
      walk(p, out);
      continue;
    }
    if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

/**
 * CLASS A. Find className string literals/templates that enable vertical scrolling, sit in a
 * flex/grid context, and declare no way to shrink.
 */
export function findFlexScrollersWithoutMinH0(source, file) {
  const hits = [];
  const lines = source.split("\n");
  lines.forEach((line, i) => {
    if (line.includes(OPT_OUT)) return;
    if (!SCROLL_Y_RE.test(line)) return;
    if (!FLEX_CONTEXT_RE.test(line)) return;
    if (CAN_SHRINK_RE.test(line)) return;
    hits.push({ file, line: i + 1, text: line.trim().slice(0, 160) });
  });
  return hits;
}

/**
 * CLASS B. Find style objects that set `position: "fixed"` and no `maxHeight`. The object is
 * delimited by the brace depth from the `position` key, so a nested object does not confuse it.
 */
export function findFixedMenusWithoutMaxHeight(source, file) {
  const hits = [];
  const re = /position:\s*["']fixed["']/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    // Walk back to the opening brace of the enclosing object literal.
    let depth = 0;
    let start = -1;
    for (let i = m.index; i >= 0; i--) {
      const c = source[i];
      if (c === "}") depth++;
      else if (c === "{") {
        if (depth === 0) {
          start = i;
          break;
        }
        depth--;
      }
    }
    if (start === -1) continue;
    // Walk forward to its matching close.
    let d = 0;
    let end = -1;
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (c === "{") d++;
      else if (c === "}") {
        d--;
        if (d === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;
    const obj = source.slice(start, end + 1);
    if (obj.includes(OPT_OUT)) continue;
    if (/\bmaxHeight\b/.test(obj)) continue;
    const line = source.slice(0, m.index).split("\n").length;
    hits.push({ file, line, text: obj.replace(/\s+/g, " ").slice(0, 160) });
  }
  return hits;
}

function selftest() {
  const cases = [];
  const ok = (name, cond) => cases.push({ name, pass: !!cond });

  // CLASS A
  ok(
    "A1 flex scroller with no min-h-0 is a hit",
    findFlexScrollersWithoutMinH0('className="flex flex-col overflow-y-auto"', "x").length === 1,
  );
  ok(
    "A2 min-h-0 present → not a hit",
    findFlexScrollersWithoutMinH0('className="flex min-h-0 flex-col overflow-y-auto"', "x").length === 0,
  );
  ok(
    "A3 arbitrary min-h-[...] also satisfies the shrink requirement",
    findFlexScrollersWithoutMinH0('className="flex min-h-[4rem] overflow-y-auto"', "x").length === 0,
  );
  ok(
    "A4 scroller outside any flex/grid context is not this class",
    findFlexScrollersWithoutMinH0('className="block overflow-y-auto"', "x").length === 0,
  );
  ok(
    "A6 fixed inset-0 overlay is bounded by the viewport, not this class",
    findFlexScrollersWithoutMinH0('className="fixed inset-0 z-50 flex overflow-y-auto bg-black/40 p-4"', "x").length === 0,
  );
  ok(
    "A7 flex-1 gives a shrinkable basis, not this class",
    findFlexScrollersWithoutMinH0('className="flex-1 overflow-y-auto px-5 py-4"', "x").length === 0,
  );
  ok(
    "A8 max-h-* caps the height outright, not this class",
    findFlexScrollersWithoutMinH0('className="grid max-h-48 gap-1 overflow-y-auto"', "x").length === 0,
  );
  ok(
    "A9 h-full is an explicit height, not this class",
    findFlexScrollersWithoutMinH0('className="flex h-full flex-col overflow-y-auto"', "x").length === 0,
  );
  ok(
    "A5 documented opt-out is honoured",
    findFlexScrollersWithoutMinH0('className="flex overflow-y-auto" /* scroll-reachable-exempt */', "x").length === 0,
  );

  // CLASS B
  ok(
    "B1 fixed style object with no maxHeight is a hit",
    findFixedMenusWithoutMaxHeight('const s = { position: "fixed", top: 1, left: 2 };', "x").length === 1,
  );
  ok(
    "B2 maxHeight present → not a hit",
    findFixedMenusWithoutMaxHeight('const s = { position: "fixed", top: 1, maxHeight: 300 };', "x").length === 0,
  );
  ok(
    "B3 a nested object does not hide the missing maxHeight",
    findFixedMenusWithoutMaxHeight('const s = { position: "fixed", a: { b: 1 }, left: 2 };', "x").length === 1,
  );
  ok(
    "B4 nested object carrying maxHeight still counts for the enclosing object",
    findFixedMenusWithoutMaxHeight('const s = { position: "fixed", a: { maxHeight: 9 } };', "x").length === 0,
  );
  ok(
    "B5 position absolute is a different class and not flagged here",
    findFixedMenusWithoutMaxHeight('const s = { position: "absolute", top: 1 };', "x").length === 0,
  );
  ok(
    "B6 two fixed objects, one bounded → exactly one hit",
    findFixedMenusWithoutMaxHeight(
      'const a = { position: "fixed", maxHeight: 10 }; const b = { position: "fixed", top: 0 };',
      "x",
    ).length === 1,
  );
  ok("B7 walk() skips node_modules", !walk(path.join(ROOT, "apps/frontend/src")).some((p) => p.includes("node_modules")));

  const failed = cases.filter((c) => !c.pass);
  for (const c of cases) console.log(`${c.pass ? "ok  " : "FAIL"} ${c.name}`);
  console.log(`[verify-scroll-containers-are-reachable] selftest ${cases.length - failed.length}/${cases.length}`);
  if (failed.length) process.exit(1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const files = SCAN_ROOTS.flatMap((r) => walk(path.join(ROOT, r)));
  const classA = [];
  const classB = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const rel = path.relative(ROOT, f);
    classA.push(...findFlexScrollersWithoutMinH0(src, rel));
    classB.push(...findFixedMenusWithoutMaxHeight(src, rel));
  }

  let bad = false;
  const report = (label, hits, baseline, envName) => {
    console.log(`[verify-scroll-containers-are-reachable] ${label}: ${hits.length} (baseline ${baseline})`);
    if (hits.length > baseline) {
      bad = true;
      console.error(`\nFAIL ${label} rose above its shrink-only baseline (${hits.length} > ${baseline}).`);
      for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.text}`);
      console.error(
        `\nFix the site. A scroller that cannot shrink, or a fixed menu with no maxHeight, renders\n` +
          `content the user cannot reach by any gesture. If the site is provably not of this class,\n` +
          `annotate it "${OPT_OUT}" with a one-line reason. Do NOT raise ${envName}.`,
      );
    } else if (hits.length < baseline) {
      console.log(`  → ${baseline - hits.length} retired. Lower ${envName} to ${hits.length} in this commit.`);
      bad = true;
      console.error(`\nFAIL ${envName} is stale: measured ${hits.length}, baseline ${baseline}. Ratchet it down.`);
    }
  };

  report("CLASS A flex scrollers without min-h-0", classA, BASELINE_FLEX_SCROLLER_WITHOUT_MIN_H_0, "BASELINE_FLEX_SCROLLER_WITHOUT_MIN_H_0");
  report("CLASS B fixed menus without maxHeight", classB, BASELINE_FIXED_MENU_WITHOUT_MAX_HEIGHT, "BASELINE_FIXED_MENU_WITHOUT_MAX_HEIGHT");

  if (bad) process.exit(1);
  console.log(`[verify-scroll-containers-are-reachable] OK — ${files.length} files scanned, both classes at baseline.`);
}

main();
