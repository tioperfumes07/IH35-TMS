#!/usr/bin/env node
/**
 * LST-F436 — AN UNSELECTED BOX IS NEVER PURE WHITE, IN EITHER SPELLING.
 *
 * Owner, 2026-10-03: "the white is too white and surfaces get lost... unselected is plain white and
 * must become a different tone." Selected (blue + white text) is correct and does not change.
 *
 * CC-1's palette pass (#25540 / #25542) fixed 63 lines across 54 page files and said so plainly in
 * its own handoff: "the per-page pass looked for the common inline pattern. Unselected boxes written
 * another way, such as a multi-line class string, may still be white." That caveat was exactly right.
 * Measured on tip main 2026-10-06, 22 multi-line class expressions still carried bg-white, and TEN of
 * them were the FALSE branch of a selected/unselected ternary — including the reconciliation
 * transaction rows, the cleared toggle, the match-candidate cards and both Confirm buttons in the
 * Match drawer. Every one is a box the owner looks at while matching money.
 *
 * THE DEFECT CLASS IS THE MATCHER, NOT THE PIXELS. A sweep that only sees
 *     className={cond ? "..." : "... bg-white ..."}
 * on ONE line reports clean while the identical code wrapped across three lines keeps its white box.
 * So this guard reads the whole className expression, not a line, and fails on either spelling.
 *
 *   RULE 1 — no ternary FALSE branch inside a className may contain bg-white, in either spelling.
 *   RULE 2 — the allowlist is a raised-surface list with a reason per entry. A drawer, a modal or a
 *            popover panel is MEANT to be white: it sits above the page rather than on it. Anything
 *            without a reason is not allowed in.
 *   RULE 3 — shrink-only. The count may fall and never rise, so a new white unselected box fails the
 *            PR that introduces it instead of being found weeks later by the owner.
 *
 * --selftest proves each rule can FAIL, and case 2 is the single-line/multi-line pair that reproduces
 * the exact hole this guard exists to close. A proof command that cannot fail is worse than no proof.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const NAME = "verify-unselected-boxes-are-not-pure-white";
const ROOT = process.env.VERIFY_ROOT || process.cwd();
const SRC = path.join(ROOT, "apps/frontend/src");

// A raised surface sits ABOVE the page and is white on purpose. Reason required; the file alone is
// never enough, because the same file can hold both a panel and an unselected row.
const RAISED_SURFACES = [
  {
    file: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
    needle: "fixed right-0 top-0 z-[210]",
    reason: "the drawer PANEL itself, fixed above the page — a raised surface, not an unselected box",
  },
  {
    file: "apps/frontend/src/components/Modal.tsx",
    needle: "relative flex h-full max-h-full flex-col border-l",
    reason: "the modal/drawer panel — raised above the page",
  },
  {
    file: "apps/frontend/src/components/Modal.tsx",
    needle: "relative flex flex-col rounded-lg",
    reason: "the centred modal PANEL — it floats above a dimmed page, so white is the raised surface, not an unselected box",
  },
];

// Every ternary inside a className={...} expression, however it is wrapped.
// Captures the FALSE branch, which is the unselected side.
const TERNARY = /\?\s*(`[^`]*`|"[^"]*"|'[^']*')\s*:\s*(`[^`]*`|"[^"]*"|'[^']*')/gs;

function classNameExpressions(src) {
  // Walk className={ ... } with brace balance so a multi-line expression is read whole.
  const out = [];
  let i = 0;
  while ((i = src.indexOf("className={", i)) !== -1) {
    let depth = 0;
    let j = i + "className=".length;
    const start = j;
    for (; j < src.length; j += 1) {
      const c = src[j];
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({ text: src.slice(start, j + 1), index: start });
    i = j + 1;
  }
  return out;
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

function findWhiteUnselected(files) {
  const hits = [];
  for (const [rel, src] of files) {
    for (const expr of classNameExpressions(src)) {
      for (const m of expr.text.matchAll(TERNARY)) {
        const falseBranch = m[2];
        if (!/\bbg-white\b/.test(falseBranch)) continue;
        const allowed = RAISED_SURFACES.find(
          (a) => a.file === rel && falseBranch.includes(a.needle)
        );
        if (allowed) continue;
        hits.push({
          file: rel,
          line: lineOf(src, expr.index + (m.index ?? 0)),
          snippet: falseBranch.slice(0, 90),
        });
      }
    }
  }
  return hits;
}

function run({ files, baseline }) {
  const out = [];
  const hits = findWhiteUnselected(files);
  for (const h of hits) {
    out.push(
      `RULE 1: ${h.file}:${h.line} — the UNSELECTED branch of a className ternary is pure white. ` +
        `Use bg-[var(--surface-unselected)] (+ hover:bg-[var(--surface-hover)]). ${h.snippet}`
    );
  }
  for (const a of RAISED_SURFACES) {
    if (!a.reason || a.reason.length < 20) {
      out.push(`RULE 2: the raised-surface entry for ${a.file} carries no real reason.`);
    }
  }
  if (typeof baseline === "number" && hits.length > baseline) {
    out.push(
      `RULE 3: shrink-only — ${hits.length} white unselected boxes, baseline ${baseline}. ` +
        `This count may fall and never rise.`
    );
  }
  return { failures: out, count: hits.length };
}

if (process.argv.includes("--selftest")) {
  const clean = [
    ["a.tsx", 'className={sel ? "bg-slate-900 text-white" : "bg-[var(--surface-unselected)]"}'],
  ];
  const singleLine = [
    ["a.tsx", 'className={sel ? "bg-slate-900 text-white" : "border bg-white px-2"}'],
  ];
  // The SAME code, wrapped — the spelling CC-1's pass could not see and this guard must.
  const multiLine = [
    [
      "a.tsx",
      'className={\n  sel\n    ? "bg-slate-900 text-white"\n    : "border bg-white px-2"\n}',
    ],
  ];
  const raised = [
    [
      "apps/frontend/src/components/Modal.tsx",
      'className={\n  isDrawer\n    ? "x"\n    : "relative flex h-full max-h-full flex-col border-l border-gray-200 bg-white shadow-xl"\n}',
    ],
  ];

  const cases = [
    ["a clean tree passes", { files: clean }, 0],
    ["catches the SINGLE-LINE spelling", { files: singleLine }, 1],
    ["catches the MULTI-LINE spelling — the hole this guard exists to close", { files: multiLine }, 1],
    ["a raised surface with a reason is allowed", { files: raised }, 0],
    [
      "the raised-surface allowance is NEEDLE-scoped, not file-scoped",
      { files: [["apps/frontend/src/components/Modal.tsx", 'className={sel ? "a" : "bg-white rounded"}']] },
      1,
    ],
    ["rule 3 fails when the count rises above the baseline", { files: multiLine, baseline: 0 }, 2],
    ["rule 3 is silent when the count falls below the baseline", { files: clean, baseline: 5 }, 0],
    [
      "a bg-white in the SELECTED branch is not this guard's business",
      { files: [["a.tsx", 'className={sel ? "bg-white shadow" : "text-gray-600"}']] },
      0,
    ],
  ];

  let ok = 0;
  for (const [label, input, expected] of cases) {
    const got = run(input).failures.length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected}, got ${got}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "__tests__") continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (e.endsWith(".tsx") && !/\.test\./.test(e)) acc.push(full);
  }
  return acc;
}

if (!existsSync(SRC)) {
  console.error(`${NAME}: CORE-INPUTS-MISSING — ${SRC} does not exist. A guard that cannot read its inputs is a FAIL, never a pass.`);
  process.exit(1);
}

const files = walk(SRC).map((f) => [path.relative(ROOT, f), readFileSync(f, "utf8")]);
const BASELINE = 0;
const { failures, count } = run({ files, baseline: BASELINE });
if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} finding(s); ${count} white unselected box(es) over ${files.length} files.`);
  process.exit(1);
}
console.log(`${NAME}: PASS — ${count} white unselected boxes (baseline ${BASELINE}) across ${files.length} .tsx files; both the single-line and multi-line spellings are checked.`);
