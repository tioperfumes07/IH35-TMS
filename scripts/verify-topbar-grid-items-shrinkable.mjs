#!/usr/bin/env node
/**
 * Every direct grid item of the top bar must be able to SHRINK (min-w-0).
 *
 * The top bar is `grid-template-columns: 1fr auto 1fr`. A grid item defaults to `min-width: auto`,
 * which means it refuses to shrink below its own content and OVERFLOWS its column instead. On prod
 * that put the entity chip ("IH 35 Transportation LLC") physically underneath the Tasks and Program
 * buttons — on every single page. The inner flex row already carried min-w-0; that cannot help,
 * because the overflow happens one level up, on the grid item.
 *
 * Nothing caught it: it is not a dead link, not a missing route, not a failing query. It renders,
 * it is just unreadable. This guard is the only thing standing between that and a silent return.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TOPBAR = join(process.cwd(), "apps", "frontend", "src", "components", "Topbar.tsx");

/**
 * Return the class attribute of every DIRECT child <div> of the grid container, by brace/JSX depth.
 * A regex over the whole file would also match nested divs, which legitimately need no min-w-0.
 */
export function gridItemClassNames(src) {
  const gridIdx = src.indexOf('className="top-bar grid');
  if (gridIdx === -1) return null; // container renamed — reported separately
  // Bound the scan to the enclosing <header>. The grid container closes with </header>, not </div>,
  // so an unbounded walk ran past it and picked up a sibling banner div that is not a grid item.
  const headerEnd = src.indexOf("</header>", gridIdx);
  const region = headerEnd === -1 ? src : src.slice(0, headerEnd);
  // The container's opening tag ends at the first '>' after the style block.
  let i = region.indexOf(">", region.indexOf("}}", gridIdx));
  const out = [];
  let depth = 0;
  while (i < region.length) {
    if (region.startsWith("<div", i)) {
      if (depth === 0) {
        const tagEnd = region.indexOf(">", i);
        const tag = region.slice(i, tagEnd);
        const m = tag.match(/className="([^"]*)"/);
        out.push(m ? m[1] : "");
      }
      depth += 1;
      i += 4;
      continue;
    }
    if (region.startsWith("</div>", i)) {
      depth -= 1;
      if (depth < 0) break; // closed the grid container
      i += 6;
      continue;
    }
    i += 1;
  }
  return out;
}

function selftest() {
  const withMin = `className="top-bar grid" style={{a:1}}><div className="flex min-w-0 items-center"><div className="nested">x</div></div></div>`;
  const without = `className="top-bar grid" style={{a:1}}><div className="flex items-center"></div></div>`;
  const a = gridItemClassNames(withMin);
  const b = gridItemClassNames(without);
  const okA = a.length === 1 && a[0].includes("min-w-0");
  const okB = b.length === 1 && !b[0].includes("min-w-0");
  if (!okA) console.error("  selftest FAIL — nested div counted as a grid item, or min-w-0 not seen");
  else console.log("  selftest OK — only direct children counted; min-w-0 detected");
  if (!okB) console.error("  selftest FAIL — a shrink-blocked item was not detected");
  else console.log("  selftest OK — missing min-w-0 detected");
  if (!okA || !okB) process.exit(1);
  console.log("verify-topbar-grid-items-shrinkable SELFTEST OK — 2/2");
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const src = readFileSync(TOPBAR, "utf8");
  const items = gridItemClassNames(src);
  if (items === null) {
    console.error("verify-topbar-grid-items-shrinkable FAIL — the `top-bar grid` container was not found.");
    console.error("If it was renamed, update this guard; do not delete it.");
    process.exit(1);
  }
  if (items.length === 0) {
    console.error("verify-topbar-grid-items-shrinkable FAIL — 0 grid items parsed; refusing to report green");
    process.exit(1);
  }
  const bad = items.filter((c) => !/\bmin-w-0\b/.test(c));
  if (bad.length) {
    console.error(`verify-topbar-grid-items-shrinkable FAIL — ${bad.length} top-bar grid item(s) cannot shrink:`);
    for (const c of bad) console.error(`  className="${c}"`);
    console.error("\nA grid item without min-w-0 overflows its column instead of shrinking, so its content");
    console.error("renders on top of the next column. Add min-w-0 to the grid item, not just its inner row.");
    process.exit(1);
  }
  console.log(`verify-topbar-grid-items-shrinkable OK — ${items.length} top-bar grid item(s), all shrinkable`);
}

main();
