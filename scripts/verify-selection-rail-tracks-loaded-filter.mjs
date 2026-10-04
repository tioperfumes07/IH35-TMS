#!/usr/bin/env node
/**
 * verify-selection-rail-tracks-loaded-filter — step 18137 (lead, 2026-10-04).
 *
 * OWNER REPORTS (2026-10-04, verbatim):
 *   "THE RECLASSIFY TRANSACTIONS ENGINE IS IN MORE IN ACCOUNTING, I HAD ASKED YOU TO HAVE THAT
 *    ONE SHOW IN THE ACCOUNTING TABS, NEXT TO WORK ORDERS AND BILLS."
 *   "WHEN SELECTING AN ACCOUNT IN THE LEFT SIDE SO YOU CAN RECLASSIFY, THAT ACCOUNT MUST STAY
 *    HIGHLIGHTED. IN THE ACCOUNT SELECTED."
 *
 * SECTION A — nav placement. A destination the owner has promoted to the top row must not sit in
 * the "More" bucket. "More" is chevron-only with no default destination, so anything parked there
 * is two interactions deep and, before step 18113, had an unreachable tail. This asserts the
 * promotion cannot silently regress: /accounting/reclassify must NOT carry section "more", must be
 * a top-row leaf in ACCOUNTING_SUB_NAV_ITEMS, and must have a hub tab.
 *
 * SECTION B — the highlight must name the same state the query names.
 *
 * ROOT CAUSE of the class: these pages keep TWO filter states — a DRAFT the controls write to
 * (`f`, `filters`) and an APPLIED snapshot the query actually runs on (`applied`). A selection rail
 * is a view of WHAT IS LOADED. When its highlight conditional reads the DRAFT, any later touch of
 * any filter control silently drops the highlight off the row whose data is on screen: the user
 * sees transactions for an account with nothing selected. MEASURED: ReclassifyTransactionsPage's
 * account tree keyed its highlight off `f.accountIds` while the query ran on `applied.accountIds`.
 *
 * The detector is scoped to rail/tree rows — an element carrying a `data-testid` naming an account,
 * tree, rail or node — because a toolbar control legitimately reflects the DRAFT (that is what the
 * user is currently typing). Flagging those would cry wolf, and a guard that cries wolf is worse
 * than no guard. Shrink-only baseline: may fall, never rise.
 *
 * Usage:
 *   node scripts/verify-selection-rail-tracks-loaded-filter.mjs
 *   node scripts/verify-selection-rail-tracks-loaded-filter.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PAGES_ROOT = "apps/frontend/src/pages";
const MANIFEST = "apps/frontend/src/pages/accounting/subnav-manifest.ts";
const HUB = "apps/frontend/src/pages/accounting/AccountingHubPage.tsx";
const RECLASSIFY_PATH = "/accounting/reclassify";

/** Shrink-only. MEASURED on main @ c24d8fe6: 1 (ReclassifyTransactionsPage's account tree). */
export const BASELINE_RAIL_HIGHLIGHT_READS_DRAFT = 0;

/** A rail/tree row: its data-testid names a rail, tree, node or account. */
const RAIL_TESTID_RE = /data-testid=\{?[`"']?[^"'`}]*(?:account|tree|rail|node|sidebar)/i;
/** A highlight conditional keyed off a DRAFT filter object rather than the applied snapshot. */
const DRAFT_HIGHLIGHT_RE =
  /\b(?:f|filters|draft|pending)\.\w+(?:\.includes\([^)]*\)|\.length\s*===?\s*0)\s*\?\s*["'`][^"'`]*(?:bg-|font-semibold|border-l|active|selected)/;

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
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(p, out);
      continue;
    }
    if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

/** SECTION B detector. A line is a hit when it is a rail row AND its highlight reads a draft. */
export function findRailHighlightsReadingDraft(source, file) {
  if (!source.includes("setApplied")) return [];
  const hits = [];
  source.split("\n").forEach((line, i) => {
    if (!RAIL_TESTID_RE.test(line)) return;
    if (!DRAFT_HIGHLIGHT_RE.test(line)) return;
    hits.push({ file, line: i + 1, text: line.trim().slice(0, 170) });
  });
  return hits;
}

/** SECTION A. Returns a list of failure strings; empty means the promotion holds. */
export function checkReclassifyPromotion(manifestSrc, hubSrc) {
  const fails = [];
  const entry = manifestSrc
    .split("\n")
    .find((l) => l.includes(`path: "${RECLASSIFY_PATH}"`) || l.includes(`path: '${RECLASSIFY_PATH}'`));
  if (!entry) {
    fails.push(`${RECLASSIFY_PATH} has no entry in SUBNAV_ITEMS at all`);
  } else if (/section:\s*["']more["']/.test(entry)) {
    fails.push(`${RECLASSIFY_PATH} is still section "more" — the owner promoted it to the top row`);
  }
  const topRow = manifestSrc.slice(manifestSrc.indexOf("ACCOUNTING_SUB_NAV_ITEMS"));
  if (!topRow.includes(RECLASSIFY_PATH)) {
    fails.push(`${RECLASSIFY_PATH} is not a top-row item in ACCOUNTING_SUB_NAV_ITEMS`);
  }
  if (!hubSrc.includes(RECLASSIFY_PATH)) {
    fails.push(`${RECLASSIFY_PATH} has no tab in AccountingHubPage's TABS`);
  }
  return fails;
}

function selftest() {
  const cases = [];
  const ok = (n, c) => cases.push({ name: n, pass: !!c });

  // SECTION A
  const goodManifest = `{ label: "R", path: "${RECLASSIFY_PATH}", section: "reclassify" },\nACCOUNTING_SUB_NAV_ITEMS = [ leafOf("${RECLASSIFY_PATH}") ]`;
  const goodHub = `{ id: "reclassify", to: "${RECLASSIFY_PATH}" }`;
  ok("A1 promoted + top-row + hub tab → no failures", checkReclassifyPromotion(goodManifest, goodHub).length === 0);
  ok(
    "A2 section \"more\" is a failure",
    checkReclassifyPromotion(goodManifest.replace('section: "reclassify"', 'section: "more"'), goodHub).some((f) =>
      f.includes('still section "more"'),
    ),
  );
  ok(
    "A3 missing from the top row is a failure",
    checkReclassifyPromotion(`{ label: "R", path: "${RECLASSIFY_PATH}", section: "reclassify" },\nACCOUNTING_SUB_NAV_ITEMS = [ ]`, goodHub).some(
      (f) => f.includes("not a top-row item"),
    ),
  );
  ok("A4 missing hub tab is a failure", checkReclassifyPromotion(goodManifest, "no tabs here").some((f) => f.includes("no tab")));
  ok(
    "A5 no entry at all is a failure",
    checkReclassifyPromotion("ACCOUNTING_SUB_NAV_ITEMS = [ ]", goodHub).some((f) => f.includes("no entry in SUBNAV_ITEMS")),
  );

  // SECTION B
  const draftRow =
    'const x = <button className={`py-1 ${f.accountIds.includes(a.account_id) ? "bg-slate-100 font-semibold" : ""}`} data-testid={`reclassify-account-${a.account_id}`} />; setApplied(y);';
  ok("B1 a rail row keyed off the DRAFT is a hit", findRailHighlightsReadingDraft(draftRow, "x").length === 1);
  ok(
    "B2 the same row keyed off the APPLIED snapshot is NOT a hit",
    findRailHighlightsReadingDraft(draftRow.replace("f.accountIds", "highlightedAccountIds"), "x").length === 0,
  );
  ok(
    "B3 CRY-WOLF: a toolbar control reflecting the draft has no rail testid and is NOT flagged",
    findRailHighlightsReadingDraft(
      'const x = <button className={f.types.includes(t) ? "bg-slate-100" : ""} data-testid="filter-type" />; setApplied(y);',
      "x",
    ).length === 0,
  );
  ok(
    "B4 a page with no applied/draft split is out of scope entirely",
    findRailHighlightsReadingDraft(draftRow.replace("setApplied(y);", ""), "x").length === 0,
  );
  ok(
    "B5 the all-accounts row (length === 0) is covered too",
    findRailHighlightsReadingDraft(
      'const x = <button className={f.accountIds.length === 0 ? "bg-slate-100 font-semibold" : ""} data-testid="reclassify-account-tree" />; setApplied(y);',
      "x",
    ).length === 1,
  );
  ok("B6 walk() skips test files", !walk(path.join(ROOT, PAGES_ROOT)).some((p) => p.endsWith(".test.tsx")));

  const failed = cases.filter((c) => !c.pass);
  for (const c of cases) console.log(`${c.pass ? "ok  " : "FAIL"} ${c.name}`);
  console.log(`[verify-selection-rail-tracks-loaded-filter] selftest ${cases.length - failed.length}/${cases.length}`);
  if (failed.length) process.exit(1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  let bad = false;

  // SECTION A
  const manifestSrc = fs.readFileSync(path.join(ROOT, MANIFEST), "utf8");
  const hubSrc = fs.readFileSync(path.join(ROOT, HUB), "utf8");
  const navFails = checkReclassifyPromotion(manifestSrc, hubSrc);
  console.log(`[verify-selection-rail-tracks-loaded-filter] SECTION A nav placement: ${navFails.length} failure(s)`);
  for (const f of navFails) console.log(`  FAIL ${f}`);
  if (navFails.length) bad = true;

  // SECTION B
  const files = walk(path.join(ROOT, PAGES_ROOT));
  const hits = [];
  for (const f of files) {
    hits.push(...findRailHighlightsReadingDraft(fs.readFileSync(f, "utf8"), path.relative(ROOT, f)));
  }
  console.log(
    `[verify-selection-rail-tracks-loaded-filter] SECTION B rail highlights reading the draft filter: ${hits.length} (baseline ${BASELINE_RAIL_HIGHLIGHT_READS_DRAFT}), ${files.length} page files scanned`,
  );
  for (const h of hits) console.log(`  ${h.file}:${h.line}  ${h.text}`);
  if (hits.length > BASELINE_RAIL_HIGHLIGHT_READS_DRAFT) {
    bad = true;
    console.log(
      `\nFAIL a selection rail highlights from the DRAFT filter while the query runs on the APPLIED\n` +
        `snapshot. Any later filter touch then drops the highlight off the row whose data is on screen.\n` +
        `Read the applied state. Do NOT raise BASELINE_RAIL_HIGHLIGHT_READS_DRAFT.`,
    );
  } else if (hits.length < BASELINE_RAIL_HIGHLIGHT_READS_DRAFT) {
    bad = true;
    console.log(`\nFAIL baseline is stale: measured ${hits.length}, baseline ${BASELINE_RAIL_HIGHLIGHT_READS_DRAFT}. Ratchet it down in this commit.`);
  }

  if (bad) process.exit(1);
  console.log(`[verify-selection-rail-tracks-loaded-filter] OK — nav placement holds, no rail highlights read a draft filter.`);
}

main();
