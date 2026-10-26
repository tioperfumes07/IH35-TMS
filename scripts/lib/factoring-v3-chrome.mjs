/**
 * ROUND 443.326 (V3 board grammar) moved two pieces of FactoringHome chrome behind factoring-owned components:
 *   - the Faro tab strip → <FactoringBoardChrome subnavItems={factoringSubnavItems}> (renders HoverDropdownNav
 *     from FARO_TABS), replacing a direct <NavyPageSubNav items={FARO_TABS.map(...)}> in the page;
 *   - the list filters → <FactoringStagedFilters> (a pass-through to the shared CollapsedListFilters).
 * verify-v3-board-grammar-every-surface forbids NavyPageSubNav / CollapsedListFilters by NAME in FactoringHome.tsx;
 * the older factoring guards required those same NAMES. #27758 satisfied the old guards by remounting the legacy
 * names, which re-broke V3 grammar. These helpers let the old guards accept the V3 form ONLY when the indirection
 * is proven from source — never on the name alone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const STAGED_FILTERS_REL = "apps/frontend/src/pages/factoring/FactoringStagedFilters.tsx";
export const BOARD_CHROME_REL = "apps/frontend/src/pages/factoring/FactoringBoardChrome.tsx";

export function readRepoOrEmpty(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
}

/** True only when FactoringStagedFilters is exactly the shared CollapsedListFilters with every prop forwarded. */
export function stagedFiltersIsCollapsedListFilters(wrapperSrc) {
  return (
    /import \{ CollapsedListFilters \} from "\.\.\/\.\.\/components\/table\/CollapsedListFilters";/.test(wrapperSrc) &&
    /export function FactoringStagedFilters\(\s*props: ComponentProps<typeof CollapsedListFilters>,?\s*\)\s*\{\s*return <CollapsedListFilters \{\.\.\.props\} \/>;\s*\}/.test(
      wrapperSrc,
    )
  );
}

/**
 * When the wrapper is proven to be CollapsedListFilters, rewrite FactoringHome's uses so the old guards judge the
 * same rendered component under its shared name. Otherwise the source is returned unchanged (and the old guard
 * fails exactly as before).
 */
export function normalizeStagedFilters(homeSrc, wrapperSrc) {
  if (!stagedFiltersIsCollapsedListFilters(wrapperSrc)) return homeSrc;
  return homeSrc
    .replace(
      'import { FactoringStagedFilters } from "./FactoringStagedFilters";',
      'import { CollapsedListFilters } from "../../components/table/CollapsedListFilters";',
    )
    .split("<FactoringStagedFilters")
    .join("<CollapsedListFilters")
    .split("</FactoringStagedFilters>")
    .join("</CollapsedListFilters>");
}

/** True only when the page builds the strip from FARO_TABS and hands it to a chrome that renders it as a flat nav. */
export function faroStripViaBoardChrome(homeSrc, chromeSrc) {
  const homeBuildsFromFaroTabs =
    /const factoringSubnavItems = useMemo\(\s*\(\) => FARO_TABS\.map\(\(item\) => \(\{ label: item\.label, to: FACTORING_TAB_PATH\[item\.id\] \}\)\)/.test(
      homeSrc,
    ) && /subnavItems=\{factoringSubnavItems\}/.test(homeSrc);
  const chromeRendersIt =
    /subnavItems\.map\(\(item\) => \(\{ label: item\.label, href: item\.to \}\)\)/.test(chromeSrc) &&
    /<HoverDropdownNav items=\{navItems\}/.test(chromeSrc) &&
    // flat strip: no dropdown children anywhere in the chrome's items
    !/children:/.test(chromeSrc);
  return homeBuildsFromFaroTabs && chromeRendersIt;
}
