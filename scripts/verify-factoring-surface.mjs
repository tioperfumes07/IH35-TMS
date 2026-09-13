#!/usr/bin/env node
/**
 * verify-factoring-surface — ROUND 21.0 (Claude Lead, owner-approved 2026-09-12 18:40 CT: "perfect
 * get all this fanned out to the coders"). MEASURED live at /factoring, 18:05 CT: 16 top-level
 * tabs in one row, 22 bare "—" (against 21 table cells) on the Account Summary screen with no
 * title attribute, and two developer-facing schema-honesty notes rendered directly in page copy.
 *
 * Three checks, matching the task's own guard spec:
 *   1. TAB COUNT — FactoringHome.tsx's top-level <NavyPageSubNav> items array must not exceed 6
 *      real groups (item 1: 16 -> 6, via Submit / Cash / Statement / Chargebacks / Messages /
 *      Settings). This is a pure top-level count — every underlying FactoringTabId/route stays
 *      reachable as a sub-view (Rule 07, never delete); the guard only bounds the VISIBLE strip.
 *   2. NO BARE "—" WITHOUT A TITLE, scoped to the Account Summary block (data-testid
 *      "factoring-account-summary" .. the next tab boundary) — the actual screen the 21/22 dashes
 *      were measured on. Every former bare dash now renders through the canonical
 *      components/money/NotApplicable (CC-2 ROUND 20.8 Part A's own "not_applicable"/"no_source"/
 *      "not_loaded" component — consumed here, not reinvented), which always carries a title; this
 *      check exists to catch a FUTURE regression back to a hand-rolled dash. Other Factoring tabs
 *      (Aging's PO/Other-Ref/Memos, Purchase Report's 13 no-backing-field columns, etc.) each carry
 *      their OWN pre-existing, separately-documented honest-empty convention from earlier rounds
 *      and were never part of this measurement — a file-wide dash ban would redden on unrelated,
 *      already-shipped honesty captions this round never touched (same two-owners-one-surface
 *      reasoning verify-planners-layout.mjs documents for staying out of CC-2's max-w territory).
 *   3. NO DEVELOPER-FACING SCHEMA COMMENTARY IN RENDERED COPY, scoped to the same Account Summary
 *      block for the identical reason — Purchase Report's own pre-existing "not wired this pass"
 *      caption is that tab's own honesty note from an earlier round, not something ROUND 21.0
 *      measured or was asked to touch. Matches literal phrases from the two removed notes ("this
 *      pass", "this schema", "without fabricating") against VISIBLE text only — JSX/line comments
 *      and title/aria-label attribute values are stripped before matching, since a hover-only
 *      reason (NotApplicable's own internal title) is the fix, not the defect.
 *
 * --selftest mutates each load-bearing fact and requires every mutation to fail; the real source
 * on tip must pass clean.
 */
import fs from "node:fs";

const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const LABEL = "verify-factoring-surface";
const MAX_TABS = 6;
const SUMMARY_START_MARKER = 'data-testid="factoring-account-summary"';
const SUMMARY_END_MARKER = '{tab === "purchase_report"';

function countTopLevelNavItems(src) {
  const marker = src.indexOf("<NavyPageSubNav");
  if (marker < 0) return { count: -1, error: "FactoringHome must render <NavyPageSubNav>" };
  const itemsStart = src.indexOf("items={[", marker);
  if (itemsStart < 0) return { count: -1, error: "<NavyPageSubNav> must take an items={[...]} array" };
  let i = itemsStart + "items={[".length;
  let bracketDepth = 1; // already inside the outer [
  let braceDepth = 0;
  let count = 0;
  for (; i < src.length && bracketDepth > 0; i += 1) {
    const ch = src[i];
    if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth -= 1;
    else if (ch === "{") {
      if (bracketDepth === 1 && braceDepth === 0) count += 1;
      braceDepth += 1;
    } else if (ch === "}") braceDepth -= 1;
    // A top-level "...someArray.map(...)" spread would expand at RUNTIME into as many items as
    // that array has — invisible to a literal `{` count (this is exactly how the pre-fix 16-tab
    // code was shaped: `...SUBNAV.map(...)` counted as one template, not 15 real tabs). The fix's
    // own invariant is that every top-level group is an explicit literal (`.map()` is only ever
    // used INSIDE a `children:` array, one level deeper) — so a top-level spread here is itself
    // the regression, independent of what the literal count comes out to.
    else if (bracketDepth === 1 && braceDepth === 0 && ch === "." && src[i + 1] === "." && src[i + 2] === ".") {
      return { count: -1, error: "top-level nav items must be explicit literals, not a top-level \"...\" spread (can silently exceed 6 at runtime)" };
    }
  }
  if (bracketDepth !== 0) return { count: -1, error: "could not find the closing ] of the items array (unbalanced brackets)" };
  return { count, error: null };
}

function accountSummarySlice(src) {
  const start = src.indexOf(SUMMARY_START_MARKER);
  const end = src.indexOf(SUMMARY_END_MARKER, start);
  if (start < 0 || end < 0 || end <= start) return null;
  return src.slice(start, end);
}

/** A "bare" dash is a JSX text node whose ENTIRE rendered content is the "—" glyph (the shape the
 *  original bug rendered: `<span ...>—</span>` with no title). Em-dash-as-punctuation mid-sentence
 *  (e.g. "Beginning / Ending — Balance Sheet Items", this file's own house style) is not the
 *  defect and must not trip this check — only a dash standing completely alone between two tags. */
function bareDashesWithoutTitle(slice) {
  const standalone = slice.match(/>\s*—\s*</g) ?? [];
  return standalone;
}

// Any prop/attribute that only ever feeds a hover-only `title=` on the actual rendered element —
// a hover-only reason string is exactly what check 2 requires, not the always-visible copy check
// 3 targets.
const TITLE_FEEDING_KEYS = ["title", "aria-label"];

function stripNonRenderedText(slice) {
  const keys = TITLE_FEEDING_KEYS.join("|");
  return slice
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1")
    .replace(new RegExp(`\\b(${keys})=\\{[^}]*\\}`, "g"), "$1=REMOVED")
    .replace(new RegExp(`\\b(${keys})="[^"]*"`, "g"), "$1=REMOVED")
    .replace(new RegExp(`\\b(${keys}):\\s*"[^"]*"`, "g"), "$1: REMOVED")
    .replace(new RegExp(`\\b(${keys}):\\s*\`[^\`]*\``, "g"), "$1: REMOVED");
}

const DEV_COMMENTARY_PHRASES = ["this pass", "this schema", "without fabricating"];

function devCommentaryInRenderedCopy(slice) {
  const rendered = stripNonRenderedText(slice);
  return DEV_COMMENTARY_PHRASES.filter((phrase) => rendered.toLowerCase().includes(phrase));
}

function analyze(src) {
  const errors = [];

  const { count, error } = countTopLevelNavItems(src);
  if (error) errors.push(`TAB COUNT: ${error}`);
  else if (count > MAX_TABS) errors.push(`TAB COUNT: FactoringHome top-level nav has ${count} items, must be <= ${MAX_TABS}`);
  else if (count <= 0) errors.push("TAB COUNT: found 0 top-level nav items — parser likely mis-anchored");

  const slice = accountSummarySlice(src);
  if (!slice) {
    errors.push("could not isolate the Account Summary render block (markers moved?) — re-anchor this guard");
    return errors;
  }

  const bareDashes = bareDashesWithoutTitle(slice);
  if (bareDashes.length) errors.push(`ACCOUNT SUMMARY: ${bareDashes.length} bare "—" render with no title= within reach (never fabricate, always say why)`);

  const devPhrases = devCommentaryInRenderedCopy(slice);
  if (devPhrases.length) errors.push(`ACCOUNT SUMMARY: developer-facing schema commentary in rendered copy: ${devPhrases.join(", ")}`);

  if (!/AccountSummaryInfoPopover/.test(slice)) {
    errors.push("ACCOUNT SUMMARY: the two former inline dev notes must live behind an AccountSummaryInfoPopover, not on the page body");
  }

  // The two specific removed notes (item 4) must never come back verbatim anywhere in the file.
  if (src.includes("No date-range picker this pass")) errors.push('item 4a note ("No date-range picker this pass...") is back on the page');
  if (src.includes("Payments to You includes all payments due on invoices purchased during the")) {
    errors.push('item 4b footnote ("* Payments to You includes all payments due...") is back on the page');
  }

  return errors;
}

const base = { home: fs.readFileSync(HOME, "utf8") };

if (process.argv.includes("--selftest")) {
  const clean = analyze(base.home);
  if (clean.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }

  const mutations = [];

  // 1. Tab count: add a 7th top-level item.
  mutations.push([
    "adds a 7th top-level tab",
    base.home.replace(
      'items={[\n          { label: "Submit", to: "/factoring/submit" },',
      'items={[\n          { label: "Submit", to: "/factoring/submit" },\n          { label: "Extra", to: "/factoring/extra" },'
    ),
  ]);

  // 1b. Tab count: a top-level "..." spread (the exact shape of the pre-fix 16-tab code) must
  //     fail even though a literal-`{` count of it alone would look small.
  mutations.push([
    "top-level nav reintroduces a spread",
    base.home.replace(
      'items={[\n          { label: "Submit", to: "/factoring/submit" },',
      'items={[\n          ...SUBNAV.map((item) => ({ label: item.label, to: FACTORING_TAB_PATH[item.id] })),\n          { label: "Submit", to: "/factoring/submit" },'
    ),
  ]);

  // 2. A bare dash with no title= (simulate a future cell forgetting the canonical NotApplicable
  //    component entirely and hand-rolling a plain dash instead).
  {
    const anchor = '<NotApplicable reason="no_source" data-testid="factoring-account-summary-beginning-balance" />';
    if (!base.home.includes(anchor)) throw new Error("selftest anchor #2 missing — re-anchor");
    mutations.push(["a dash loses its title reasoning", base.home.replace(anchor, "<span>—</span>")]);
  }

  // 3. The old dev-note phrase reappears as visible copy inside the Account Summary block.
  {
    const anchor = '<AccountSummaryInfoPopover />';
    if (!base.home.includes(anchor)) throw new Error("selftest anchor #3 missing — re-anchor");
    mutations.push([
      "a developer schema note reappears as visible copy",
      base.home.replace(anchor, '<AccountSummaryInfoPopover />\n                      <div>No date-range picker this pass -- this schema has a gap</div>'),
    ]);
  }

  // 4. The popover itself is deleted from the Account Summary block.
  mutations.push([
    "the info popover is removed from Account Summary",
    base.home.replace("<AccountSummaryInfoPopover />", "<span />"),
  ]);

  // 5. Item 4a's exact old note text comes back verbatim anywhere in the file.
  mutations.push([
    "item 4a's exact removed sentence reappears verbatim",
    `${base.home}\n// No date-range picker this pass\n`,
  ]);

  let caught = 0;
  for (const [label, mutated] of mutations) {
    const errors = analyze(mutated);
    if (errors.length > 0) {
      caught += 1;
      continue;
    }
    console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS (${caught}/${mutations.length})`);
  process.exit(0);
}

const failures = analyze(base.home);
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  failures.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`${LABEL}: PASS — Factoring top-level nav <= 6, Account Summary's dashes all carry a title, no dev-facing schema commentary in rendered copy`);
