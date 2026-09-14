#!/usr/bin/env node
/**
 * verify-factoring-nav-reachable.mjs
 *
 * P0 (owner, 2026-09-14): "FACTORING: 10 OF 16 TABS UNREACHABLE IN PRODUCTION." My own PR #21952
 * ("Factoring: 16 tabs -> 6", ROUND 21.0 item 1) moved 10 SUBNAV tab ids into three NavyPageSubNav
 * dropdowns (Cash / Statement / Settings). None of the three opened in production — clicking did
 * nothing (no menu, no console error, `aria-expanded` stuck at "false").
 *
 * ROOT CAUSE (confirmed live in Chrome, then reproduced with a real DOM event sequence): the shared
 * `NavyDropdown` component's wrapper had `onMouseEnter={show}` racing the button's own `onClick`
 * toggle. A mouse click is always preceded by a `mouseenter` on the same element — that fired
 * `show()` first (opening the menu), and the click's own `setOpen((o) => !o)` immediately flipped it
 * back closed in the same synchronous tick, before React ever painted the open state. Fixed in
 * NavyPageSubNav.tsx (apps/frontend/src/components/layout/NavyPageSubNav.tsx) — tracked via an
 * `openedByHoverRef` so the click that follows a hover-open is consumed instead of toggling closed.
 *
 * Owner: "This class of defect (surface shipped, route alive, link dead) has now happened twice" —
 * see verify-accounting-subnav-click-reachability.mjs (GO-23 nav-dropdown-clip, a CSS clipping
 * defect with the same shape: real links in the DOM, never visibly reachable). This guard follows
 * that guard's own pattern: a structural check here (every SUBNAV/INTERNAL_TOOLS_SUBNAV id is
 * actually referenced inside the live <NavyPageSubNav items={[...]}/> block, not silently dropped)
 * PLUS a behavioral regression check (the shared component's own test file proves a dropdown
 * actually opens on a real click, not just that the markup exists) — because a structural-only
 * check would have passed on the ORIGINAL broken code: every child link WAS present in the array,
 * declared in FACTORING_TAB_PATH, and structurally would render `if (open)` — the entries were never
 * missing, `open` itself just never became (and stayed) true. "Fix the component, not the data" per
 * the owner's own framing: the behavioral half of this guard is what actually pins that fix in place,
 * for every current and future NavyPageSubNav dropdown consumer, not just Factoring.
 *
 * SECOND ROOT CAUSE, found only by re-checking LIVE after the first fix deployed (dry-run-clean /
 * vitest-clean is not proof): the click-race fix alone was not enough. `<nav className=
 * "overflow-x-auto ...">` (NavyPageSubNav's own root) computes `overflow-y: auto` too — the exact
 * GO-23 nav-dropdown-clip root cause named above, this time hitting NavyDropdown itself, not just
 * HoverDropdownNav. Confirmed live: `elementFromPoint` at the open menu's own reported coordinates
 * returned a page-content div, not the menu, despite zIndex:30/opacity:1/display:block all reading
 * correctly — proof of clipping, not a stacking-context or state bug. Fixed the same way as GO-23:
 * portal the open menu into document.body via the SAME shared `measureNavDropdownStyle()` helper
 * HoverDropdownNav/DispatchSubnav already use. Because jsdom has no real layout engine (every rect
 * reads 0x0), the guard's behavioral half below cannot see the clipping pixel-for-pixel — but it CAN
 * see the structural fix: the open menu must be a child of document.body, not of the clipping <nav>.
 *
 * ROUND 24.6 (owner, 2026-09-14) — REVERTS the #21952 consolidation this guard was originally
 * written to defend. The owner never asked for 16 tabs -> 6; that was this seat's own initiative,
 * and the earlier P0 box's line telling the next round not to revert it ("the owner asked for the
 * consolidation") was itself invented by this seat, not something the owner said. Tightened: every
 * SUBNAV id must now render as a TOP-LEVEL tab (a child-of-dropdown placement FAILS, even if the
 * dropdown itself opens correctly and the id is technically reachable two clicks deep) —
 * INTERNAL_TOOLS_SUBNAV is the one exception, unchanged, returned to its own "Internal Tools"
 * dropdown exactly as it stood before #21952. The behavioral half below (NavyDropdown proven to
 * open by a real click, escaping its clipping <nav>) stays required — "Internal Tools" is still a
 * real dropdown, and this guard also protects every OTHER NavyPageSubNav consumer in the repo.
 *
 * Static (no DB). Self-test: node scripts/verify-factoring-nav-reachable.mjs --selftest
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-nav-reachable";

const FACTORING_HOME_REL = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const NAV_COMPONENT_TEST_REL = "apps/frontend/src/components/layout/NavyPageSubNav.test.tsx";

/**
 * Extract the `id` values out of `const <name> = [ {id: "...", ...}, ... ] as const;`.
 * Returns null if the block itself can't be found (extraction pattern gone stale — a FAIL, not a
 * silent 0).
 */
export function extractIdsFromConstBlock(src, constName) {
  const startMarker = `const ${constName} = [`;
  const start = src.indexOf(startMarker);
  if (start === -1) return null;
  const end = src.indexOf("] as const", start);
  if (end === -1) return null;
  const block = src.slice(start, end);
  const ids = [...block.matchAll(/\{\s*id:\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]);
  return ids.length > 0 ? ids : null;
}

/**
 * Extract the source text of `<NavyPageSubNav items={[ ... ]}` by bracket-depth matching on the
 * square brackets that open right after `items={` (so nested arrays inside — e.g. the
 * `(["funds_due", ...] as const).map(...)` child-id lists — stay inside the extracted block).
 */
export function extractNavyPageSubNavItemsBlock(src) {
  const navIdx = src.indexOf("<NavyPageSubNav");
  if (navIdx === -1) return null;
  const marker = "items={[";
  const markerIdx = src.indexOf(marker, navIdx);
  if (markerIdx === -1) return null;
  const openBracketIdx = markerIdx + marker.length - 1; // index of the "["
  let depth = 0;
  let i = openBracketIdx;
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  if (depth !== 0) return null; // unterminated — extraction pattern is stale
  return src.slice(openBracketIdx, i);
}

/**
 * Bracket-match every `children: [ ... ]` array inside a source block, returning their contents
 * (not including the `children: [` / `]` delimiters themselves). Used to prove a SUBNAV id is NOT
 * nested inside any dropdown — ROUND 24.6's "child-of-dropdown placement FAILS" rule.
 */
export function extractChildrenBlocks(block) {
  const out = [];
  const marker = "children: [";
  let searchFrom = 0;
  for (;;) {
    const markerIdx = block.indexOf(marker, searchFrom);
    if (markerIdx === -1) break;
    const openBracketIdx = markerIdx + marker.length - 1;
    let depth = 0;
    let i = openBracketIdx;
    for (; i < block.length; i++) {
      if (block[i] === "[") depth++;
      else if (block[i] === "]") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    out.push(block.slice(openBracketIdx, i));
    searchFrom = i;
  }
  return out;
}

/**
 * Pure evaluation core (unit-testable / self-testable).
 * @param {{factoringHomeSrc: string, navTestSrc: string, navTestExists: boolean}} input
 * @returns {string[]} failures (empty => pass)
 */
export function assertGuard({ factoringHomeSrc, navTestSrc, navTestExists }) {
  const failures = [];

  // --- (1) STRUCTURAL ---
  const subnavIds = extractIdsFromConstBlock(factoringHomeSrc, "SUBNAV");
  const internalIds = extractIdsFromConstBlock(factoringHomeSrc, "INTERNAL_TOOLS_SUBNAV");
  if (!subnavIds) {
    failures.push(`${FACTORING_HOME_REL} — could not extract SUBNAV ids (extraction pattern is stale)`);
  }
  if (!internalIds) {
    failures.push(`${FACTORING_HOME_REL} — could not extract INTERNAL_TOOLS_SUBNAV ids (extraction pattern is stale)`);
  }
  const itemsBlock = extractNavyPageSubNavItemsBlock(factoringHomeSrc);
  if (!itemsBlock) {
    failures.push(`${FACTORING_HOME_REL} — could not find a <NavyPageSubNav items={[...]}/> block (extraction pattern is stale)`);
  }

  if (subnavIds && internalIds && itemsBlock) {
    // A dropdown item declared with a literal empty children array can never render a menu at all.
    if (/children:\s*\[\s*\]/.test(itemsBlock)) {
      failures.push(`${FACTORING_HOME_REL} — a dropdown item declares "children: []" (an empty menu can never render anything reachable)`);
    }

    const childrenBlocks = extractChildrenBlocks(itemsBlock);

    // ROUND 24.6 — every SUBNAV id must be a TOP-LEVEL tab: referenced SOMEWHERE in the items
    // block, and NOT inside any children: [...] array (a child-of-dropdown placement fails, even
    // if that dropdown genuinely opens — a tab two clicks deep behind a dropdown is not what this
    // round asked for). The intended shape is a single generic "...SUBNAV.map(...)" spread, which
    // covers every SUBNAV id by construction (no per-id literal ever appears in source for that
    // shape) — when present, only the "not nested in a dropdown" check applies per id. Absent that
    // spread, fall back to requiring an explicit per-id reference, so a hand-rolled (non-spread)
    // top-level listing is still accepted as long as it's genuinely top-level and complete.
    const subnavSpreadPresent = /\.\.\.SUBNAV\.map\(/.test(itemsBlock);
    if (!subnavSpreadPresent) {
      failures.push(`${FACTORING_HOME_REL} — <NavyPageSubNav items={[...]}/> does not spread "...SUBNAV.map(...)" — every SUBNAV id must render as its own top-level tab, not be individually listed or nested`);
    }
    for (const id of subnavIds) {
      const nestedInChildren = childrenBlocks.some(
        (block) => new RegExp(`["'\`]${id}["'\`]`).test(block) || new RegExp(`FACTORING_TAB_PATH\\.${id}\\b`).test(block)
      );
      if (nestedInChildren) {
        failures.push(`SUBNAV id "${id}" is nested inside a dropdown's children — ROUND 24.6 requires every SUBNAV id to be its own top-level tab, not a child two clicks deep`);
        continue;
      }
      if (subnavSpreadPresent) continue; // covered by construction — every SUBNAV id renders, none nested (checked above)
      const directPath = new RegExp(`FACTORING_TAB_PATH\\.${id}\\b`).test(itemsBlock);
      const asChildId = new RegExp(`["'\`]${id}["'\`]`).test(itemsBlock);
      if (!directPath && !asChildId) {
        failures.push(`SUBNAV id "${id}" is not referenced anywhere inside <NavyPageSubNav items={[...]}/> — unreachable (surface shipped, route alive, link dead)`);
      }
    }

    // INTERNAL_TOOLS_SUBNAV is the one exception — it belongs INSIDE a dropdown (its own "Internal
    // Tools" group, restored to its pre-#21952 position), not top-level. No nesting check for it.
    // Matches either `children: INTERNAL_TOOLS_SUBNAV.map(...)` (the pre-#21952 shape, restored by
    // ROUND 24.6 verbatim — .map() already returns an array, nothing else to combine it with) or
    // `children: [...INTERNAL_TOOLS_SUBNAV.map(...), ...]` (a spread inside a literal array,
    // needed only when combining with other entries) — both are valid, equivalent JS.
    const internalToolsSpread = /INTERNAL_TOOLS_SUBNAV\.map\(/.test(itemsBlock);
    for (const id of internalIds) {
      const directPath = new RegExp(`FACTORING_TAB_PATH\\.${id}\\b`).test(itemsBlock);
      const asChildId = new RegExp(`["'\`]${id}["'\`]`).test(itemsBlock);
      if (!directPath && !asChildId && !internalToolsSpread) {
        failures.push(`INTERNAL_TOOLS_SUBNAV id "${id}" is not referenced (directly, by literal id, or via "...INTERNAL_TOOLS_SUBNAV.map(") inside <NavyPageSubNav items={[...]}/> — unreachable`);
      }
    }
  }

  // --- (2) BEHAVIORAL: the shared NavyDropdown must be proven, by a real click, to actually open ---
  // A structural-only check above would have PASSED on the original broken code — every id really
  // was present in the array. The entries were never missing; `NavyDropdown`'s `open` state just
  // never stuck. Require the component's own regression test to exist and to assert the real thing.
  if (!navTestExists) {
    failures.push(`MISSING test file: ${NAV_COMPONENT_TEST_REL} (no regression coverage for NavyDropdown open/close at all)`);
  } else {
    const required = [
      ["userEvent.setup()", "must drive the click through @testing-library/user-event, not fireEvent's bare click or a direct state/prop hack — user-event dispatches the realistic pointer/mouse sequence (mouseenter before click) that a bare click would not, so only user-event can catch the mouseenter-then-click race"],
      ["user.click(", "must actually invoke the user-event click, not just set it up"],
      ['toHaveAttribute("aria-expanded", "true")', "must assert the dropdown's own open state actually flips true after the click, not just that markup exists"],
      ['getByRole("menuitem"', "must assert a real, rendered child menu item is present and visible after the click"],
      ["document.body.contains(menu)", "must assert the open menu escaped into a document.body portal — a structural-only or aria-expanded-only check would have PASSED on the SECOND broken build too, where the state flipped correctly but the menu was still invisible, clipped by <nav>'s own overflow-y:auto"],
      ["nav.contains(menu)", "must assert the menu is no longer inside its own <nav> (the overflow-clipping ancestor), not just that it exists somewhere in the document"],
    ];
    for (const [needle, why] of required) {
      if (!navTestSrc.includes(needle)) {
        failures.push(`${NAV_COMPONENT_TEST_REL} missing assertion: "${needle}" (${why})`);
      }
    }
  }

  return failures;
}

function readRepo(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function runReal() {
  const factoringHomeSrc = readRepo(FACTORING_HOME_REL);
  const navTestPath = path.join(ROOT, NAV_COMPONENT_TEST_REL);
  const navTestExists = fs.existsSync(navTestPath);
  const navTestSrc = navTestExists ? fs.readFileSync(navTestPath, "utf8") : "";

  const failures = assertGuard({ factoringHomeSrc, navTestSrc, navTestExists });
  if (failures.length > 0) {
    console.error(`[${LABEL}] FAIL (static checks):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  try {
    execSync(`npx vitest run ${NAV_COMPONENT_TEST_REL.replace(/^apps\/frontend\//, "")}`, {
      cwd: path.join(ROOT, "apps/frontend"),
      stdio: "inherit",
    });
  } catch {
    console.error(`[${LABEL}] FAIL — vitest run failed for ${NAV_COMPONENT_TEST_REL}`);
    process.exit(1);
  }

  console.log(
    `[${LABEL}] PASS — every SUBNAV id renders as its own top-level tab (none nested inside a dropdown), INTERNAL_TOOLS_SUBNAV is reachable inside its own "Internal Tools" dropdown, and NavyDropdown is proven (by a real click) to actually open and render its children`
  );
}

function runSelftest() {
  const goodFactoringHome = `
    const SUBNAV = [
      { id: "funds_due", label: "Funds Due" },
      { id: "chargebacks_overpayments", label: "Chargebacks & Overpayments" },
    ] as const;
    const INTERNAL_TOOLS_SUBNAV = [
      { id: "reserve_tracker", label: "Reserve Tracker" },
    ] as const;
    <NavyPageSubNav
      items={[
        ...SUBNAV.map((item) => ({
          label: item.label,
          to: item.id === "submit_invoice" ? "/factoring/submit" : FACTORING_TAB_PATH[item.id],
        })),
        {
          label: "Internal Tools",
          to: "",
          children: [
            ...INTERNAL_TOOLS_SUBNAV.map((item) => ({ label: item.label, to: FACTORING_TAB_PATH[item.id] })),
          ],
        },
      ]}
    />
  `;
  const goodNavTest = `
    const user = userEvent.setup();
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Funds Due" })).toBeVisible();
    const menu = screen.getByRole("menu");
    const nav = screen.getByRole("navigation", { name: "Section navigation" });
    expect(nav.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  `;

  const cases = [
    {
      name: "healthy: every id reachable + real regression test present",
      input: { factoringHomeSrc: goodFactoringHome, navTestSrc: goodNavTest, navTestExists: true },
      expectPass: true,
    },
    {
      name: "regression: the ...SUBNAV.map( spread is removed entirely (reverts to per-id enumeration, tabs go missing)",
      input: {
        factoringHomeSrc: goodFactoringHome.replace("...SUBNAV.map((item) => ({\n          label: item.label,\n          to: item.id === \"submit_invoice\" ? \"/factoring/submit\" : FACTORING_TAB_PATH[item.id],\n        })),", ""),
        navTestSrc: goodNavTest,
        navTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: ROUND 24.6 — a SUBNAV id nested inside a dropdown's children (reachable, but two clicks deep — still fails)",
      input: {
        factoringHomeSrc: goodFactoringHome.replace(
          "children: [\n            ...INTERNAL_TOOLS_SUBNAV.map((item) => ({ label: item.label, to: FACTORING_TAB_PATH[item.id] })),\n          ],",
          'children: [\n            { label: "Funds Due", to: FACTORING_TAB_PATH.funds_due },\n            ...INTERNAL_TOOLS_SUBNAV.map((item) => ({ label: item.label, to: FACTORING_TAB_PATH[item.id] })),\n          ],'
        ),
        navTestSrc: goodNavTest,
        navTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: a dropdown declares children: [] (structurally present, can never render)",
      input: {
        factoringHomeSrc: goodFactoringHome.replace(
          'children: [\n            ...INTERNAL_TOOLS_SUBNAV.map((item) => ({ label: item.label, to: FACTORING_TAB_PATH[item.id] })),\n          ],',
          "children: [],"
        ),
        navTestSrc: goodNavTest,
        navTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: INTERNAL_TOOLS_SUBNAV id unreachable (spread removed, no direct reference either)",
      input: {
        factoringHomeSrc: goodFactoringHome.replace("...INTERNAL_TOOLS_SUBNAV.map((item) => ({ label: item.label, to: FACTORING_TAB_PATH[item.id] })),", ""),
        navTestSrc: goodNavTest,
        navTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: no regression test file at all",
      input: { factoringHomeSrc: goodFactoringHome, navTestSrc: "", navTestExists: false },
      expectPass: false,
    },
    {
      name: "regression: test file exists but only checks markup, not a real click (would pass on the ORIGINAL broken code)",
      input: {
        factoringHomeSrc: goodFactoringHome,
        navTestSrc: `expect(screen.getByText("Funds Due")).toBeInTheDocument();`,
        navTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: test asserts aria-expanded but never with userEvent.click (fireEvent-only would miss the mouseenter race)",
      input: {
        factoringHomeSrc: goodFactoringHome,
        navTestSrc: `fireEvent.click(trigger); expect(trigger).toHaveAttribute("aria-expanded", "true"); screen.getByRole("menuitem", { name: "x" });`,
        navTestExists: true,
      },
      expectPass: false,
    },
    {
      name: "regression: test proves open state + real click but never proves the menu escaped its clipping <nav> (would pass on the SECOND broken build: state fixed, still clipped)",
      input: {
        factoringHomeSrc: goodFactoringHome,
        navTestSrc: `
          const user = userEvent.setup();
          await user.click(trigger);
          expect(trigger).toHaveAttribute("aria-expanded", "true");
          expect(screen.getByRole("menuitem", { name: "Funds Due" })).toBeVisible();
        `,
        navTestExists: true,
      },
      expectPass: false,
    },
  ];

  let ok = true;
  for (const c of cases) {
    const failures = assertGuard(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`  SELFTEST FAIL — ${c.name}: expected ${c.expectPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"} (${failures.join("; ")})`);
    } else {
      console.log(`  selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log(`[${LABEL}] --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  runReal();
}
