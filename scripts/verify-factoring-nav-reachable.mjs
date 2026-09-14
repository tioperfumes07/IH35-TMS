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
 * Pure evaluation core (unit-testable / self-testable).
 * @param {{factoringHomeSrc: string, navTestSrc: string, navTestExists: boolean}} input
 * @returns {string[]} failures (empty => pass)
 */
export function assertGuard({ factoringHomeSrc, navTestSrc, navTestExists }) {
  const failures = [];

  // --- (1) STRUCTURAL: every SUBNAV / INTERNAL_TOOLS_SUBNAV id is reachable from the live nav ---
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
    // A dropdown item declared with a literal empty children array can never render a menu at all —
    // structurally present, functionally dead (the exact "reachable... as a child of a dropdown
    // that actually renders children" failure mode named in the P0).
    if (/children:\s*\[\s*\]/.test(itemsBlock)) {
      failures.push(`${FACTORING_HOME_REL} — a dropdown item declares "children: []" (an empty menu can never render anything reachable)`);
    }

    const internalToolsSpread = /\.\.\.INTERNAL_TOOLS_SUBNAV\.map\(/.test(itemsBlock);

    for (const id of subnavIds) {
      const directPath = new RegExp(`FACTORING_TAB_PATH\\.${id}\\b`).test(itemsBlock);
      const asChildId = new RegExp(`["'\`]${id}["'\`]`).test(itemsBlock);
      if (!directPath && !asChildId) {
        failures.push(`SUBNAV id "${id}" is not referenced anywhere inside <NavyPageSubNav items={[...]}/> — unreachable (surface shipped, route alive, link dead)`);
      }
    }
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
    `[${LABEL}] PASS — every SUBNAV/INTERNAL_TOOLS_SUBNAV id is referenced inside FactoringHome.tsx's <NavyPageSubNav items={[...]}/>, and NavyDropdown is proven (by a real click) to actually open and render its children`
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
        {
          label: "Cash",
          to: "",
          children: (["funds_due"] as const).map((id) => ({ label: SUBNAV.find((i) => i.id === id)!.label, to: FACTORING_TAB_PATH[id] })),
        },
        { label: "Chargebacks", to: FACTORING_TAB_PATH.chargebacks_overpayments },
        {
          label: "Settings",
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
  `;

  const cases = [
    {
      name: "healthy: every id reachable + real regression test present",
      input: { factoringHomeSrc: goodFactoringHome, navTestSrc: goodNavTest, navTestExists: true },
      expectPass: true,
    },
    {
      name: "regression: a SUBNAV id dropped from the items array entirely (surface shipped, link dead)",
      input: {
        factoringHomeSrc: goodFactoringHome.replace('children: (["funds_due"] as const)', 'children: ([] as const)'),
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
