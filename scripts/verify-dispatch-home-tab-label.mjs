#!/usr/bin/env node
/**
 * DISPATCH item #1 (owner 2026-09-04): the Dispatch landing tab is named "Home",
 * not "Overview". Rename is label-only — the deep-link view value stays
 * `?view=overview` so saved links and bookmarks keep working. The breadcrumb for
 * the landing view reads "Home". Rule 05: the architecture doc records the rename.
 *
 * Self-testing static guard (root scripts/ band — a numbered verify-step cannot be
 * authored in the same PR under Rule 37 claim-before-write). Run:
 *   node scripts/verify-dispatch-home-tab-label.mjs [--selftest]
 */
import fs from "node:fs";

const files = {
  dispatchPage: "apps/frontend/src/pages/Dispatch.tsx",
  subnav: "apps/frontend/src/components/dispatch/DispatchSubnav.tsx",
  archDesign: "docs/specs/IH35_ARCHITECTURAL_DESIGN.md",
};
const original = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);

// The landing view-toggle button block (identified by its stable testid) must
// render the label "Home" and must keep writing view=overview.
function landingTabButtonBlock(source) {
  const marker = 'data-testid="dispatch-view-overview"';
  const idx = source.indexOf(marker);
  if (idx < 0) return "";
  // Grab a generous window covering the button's label and onClick.
  return source.slice(idx, idx + 600);
}

const hasAll = (...needles) => (source) => needles.every((n) => source.includes(n));

const contracts = [
  [
    "landing tab renders Home label",
    "dispatchPage",
    (source) => {
      const block = landingTabButtonBlock(source);
      return block.includes(">\n              Home\n            </Button>") ||
        /dispatch-view-overview[\s\S]{0,600}>\s*Home\s*<\/Button>/.test(source);
    },
    (source) => source.replace(/>\s*Home\s*<\/Button>/, ">Overview</Button>"),
  ],
  [
    "landing tab no longer labeled Overview",
    "dispatchPage",
    (source) => {
      const block = landingTabButtonBlock(source);
      return !/>\s*Overview\s*<\/Button>/.test(block);
    },
    // Mutate: re-insert an Overview label right after the testid to trip the guard.
    (source) =>
      source.replace(
        'data-testid="dispatch-view-overview"',
        'data-testid="dispatch-view-overview"\n              /* >Overview</Button> */',
      ),
  ],
  [
    "deep-link view value stays overview (label-only rename)",
    "dispatchPage",
    hasAll('next.set("view", "overview");', 'data-testid="dispatch-view-overview"'),
    (source) => source.replace('next.set("view", "overview");', 'next.set("view", "home");'),
  ],
  [
    "breadcrumb landing view maps to Home",
    "subnav",
    hasAll('"/dispatch": "Home"', '"/dispatch?view=overview": "Home"'),
    (source) => source.replace('"/dispatch": "Home"', '"/dispatch": "Overview"'),
  ],
  [
    "arch doc records Home rename (Rule 05)",
    "archDesign",
    (source) => /Home \(default command center;[^)]*renamed from "Overview"/.test(source),
    (source) => source.replace(/Home \(default command center;[^)]*renamed from "Overview"/, "Overview (default command center"),
  ],
];

function audit(sources) {
  return contracts.filter(([, key, test]) => !test(sources[key])).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(
    `[verify-dispatch-home-tab-label] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`,
  );
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, , mutate] of contracts) {
    const mutated = { ...original, [key]: mutate(original[key]) };
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(
    `[verify-dispatch-home-tab-label] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`,
  );
  process.exit(0);
}

console.log("[verify-dispatch-home-tab-label] OK");
