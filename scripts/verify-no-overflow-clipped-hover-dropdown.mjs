#!/usr/bin/env node
// CATEGORY-HOVER-FLYOUT-CLIPPED-BY-SCROLL-ANCESTOR guard.
//
// HoverDropdown / HoverDropdownNav render their flyout menu as `position: absolute` INSIDE the same DOM
// subtree as their trigger row. If that row sits inside a wrapper whose className sets `overflow-x-auto`
// (or any other non-visible overflow-x) without also constraining overflow-y, the CSS mixed-overflow rule
// (an axis left "visible" is forced to "auto" once the other axis is non-visible) turns the wrapper into a
// vertical clip box too -- so the flyout menu still opens (React state flips fine, the DOM node renders,
// even the CSS :hover style on the trigger fires) but is invisible below the wrapper's own one-row height.
// No console error, no failed network call, nothing a click-only or grep-only check would catch --
// confirmed live via the accessibility tree showing the flyout menu DOM node present (`menu` role, real
// report items) while the screenshot at the same moment shows nothing.
//
// Found + fixed 2026-08-29 in apps/frontend/src/components/reports/CategoryHoverNav.tsx and
// ReportCategoryHoverNav.tsx (GO-FINISH-TONIGHT drivers/reports/inventory sweep) -- both used
// `overflow-x-auto` + `flex min-w-max gap-3` to fit many category tabs on one line, silently breaking the
// ONLY interaction the Reports page's own subtitle documents ("Hover a domain category, then open a report
// to run"). apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx already carries a fix + a
// warning comment for this exact class of bug ("Safety hotfix class of bug") -- this guard generalizes
// that lesson so it can't recur silently in a new file.
//
// This is a STATIC ratchet, not a live-DOM check: it flags any file that (a) imports a HoverDropdown-family
// component AND (b) sets a non-visible overflow-x class within a few lines of that import's usage, UNLESS
// the file already carries an explicit acknowledgement comment for this pattern (e.g. the
// AccountingSubNavWrapper.tsx style "No overflow-x-auto here" note, or this guard's own name/id).
//
// Wired into the ALREADY-registered verify-ui-regressions.mjs chain (imported below) rather than a new
// scripts/verify-steps/NNNN-*.mjs entry or a new package.json line -- CC-3 (chrome-only lane) authors no
// new numbered verify-steps (Rule 25 lane-band) and a bare package.json wire for a brand-new guard file is
// itself rejected by verify-definition-of-done-evidence.mjs §4 as inert. Piggybacking on an existing,
// already-CI-wired aggregator is the legitimate path for this lane.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["apps/frontend/src/pages", "apps/frontend/src/components"];

const HOVER_DROPDOWN_IMPORT = /\bimport\s*{[^}]*\bHoverDropdown(?:Nav)?\b[^}]*}\s*from\s*["'][^"']*shared\/HoverDropdown/;
const OVERFLOW_X_CLIP = /\boverflow-x-(auto|scroll|hidden|clip)\b/;
const ACK_MARKERS = /CATEGORY-HOVER-FLYOUT-CLIPPED-BY-SCROLL-ANCESTOR|no overflow-x-auto here|overflow-x-auto here: it clips/i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Returns an array of offending file paths (empty = clean). Pure function — no process.exit. */
export function findOverflowClippedHoverDropdowns(roots = ROOTS) {
  const offenders = [];
  for (const root of roots) {
    let files;
    try {
      files = walk(root);
    } catch {
      continue;
    }
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!HOVER_DROPDOWN_IMPORT.test(src)) continue;
      if (ACK_MARKERS.test(src)) continue; // explicitly reasoned about + fixed/accepted
      if (OVERFLOW_X_CLIP.test(src)) offenders.push(file);
    }
  }
  return offenders;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const offenders = findOverflowClippedHoverDropdowns();
  if (offenders.length > 0) {
    console.error(
      `FAIL verify-no-overflow-clipped-hover-dropdown: ${offenders.length} file(s) combine a HoverDropdown-family ` +
        `import with an unacknowledged overflow-x-auto/scroll/hidden/clip wrapper class -- this silently clips the ` +
        `flyout menu (CATEGORY-HOVER-FLYOUT-CLIPPED-BY-SCROLL-ANCESTOR). Either remove the clipping overflow-x class ` +
        `(e.g. use flex-wrap instead of min-w-max + overflow-x-auto) or add an explicit comment near the wrapper ` +
        `explaining why the flyout still works, then re-run.\n  - ${offenders.join("\n  - ")}`
    );
    process.exit(1);
  }
  console.log(`OK verify-no-overflow-clipped-hover-dropdown: no HoverDropdown wrapper clips its flyout via overflow-x.`);
}
