#!/usr/bin/env node
/**
 * DISPATCH item #2 (owner 2026-09-04): Kanban, List, Round Trips AND Trip Pairing
 * belong in the one board-view row under Load board. Kanban/List/Round Trips were
 * already peer buttons in the page-header toggle row; Trip Pairing was ONLY a
 * separate queues sub-nav item. This guard asserts Trip Pairing is now also a peer
 * button in that board-view row, navigating to /dispatch/trip-pairing. Additive:
 * the queues sub-nav entry is retained (not removed) — a separate contract.
 *
 * Self-testing static guard (root band — a numbered verify-step cannot be authored
 * in the same PR under Rule 37 claim-before-write). Run:
 *   node scripts/verify-dispatch-trip-pairing-in-board-view-row.mjs [--selftest]
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

const hasAll = (...needles) => (source) => needles.every((n) => source.includes(n));

// The board-view row must carry each of the four board views the owner named as sibling toggle
// buttons. Was four individually-hardcoded <Button>Label</Button> elements; the board-view row
// (data-testid="dispatch-board-view-row") was later refactored (a legitimate DRY improvement,
// same four buttons) into ONE array of { id, label, ... } objects rendered through a single
// .map() — so the label now appears as a `label: "Kanban"` string-literal entry inside that
// array, never as literal JSX text (the render itself uses {tab.label}). Updated 2026-09-05 to
// check the array entry, matching the actual (correct) structure rather than a stale one.
function boardViewRowHasButton(source, label) {
  const boardViewArray = source.match(/data-testid="dispatch-board-view-row"[\s\S]*?\]\s*as const/)?.[0] ?? "";
  const re = new RegExp(`label:\\s*"${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"`);
  return re.test(boardViewArray);
}

const contracts = [
  [
    "board-view row keeps Kanban peer",
    "dispatchPage",
    (s) => boardViewRowHasButton(s, "Kanban"),
    (s) => s.replace('label: "Kanban"', 'label: "Kanban_REMOVED"'),
  ],
  [
    "board-view row keeps List peer",
    "dispatchPage",
    (s) => boardViewRowHasButton(s, "List"),
    (s) => s.replace('label: "List"', 'label: "List_REMOVED"'),
  ],
  [
    "board-view row keeps Round Trips peer",
    "dispatchPage",
    (s) => boardViewRowHasButton(s, "Round Trips"),
    (s) => s.replace('label: "Round Trips"', 'label: "Round_REMOVED"'),
  ],
  [
    "board-view row now carries Trip Pairing peer",
    "dispatchPage",
    (s) => boardViewRowHasButton(s, "Trip Pairing"),
    (s) => s.replace('label: "Trip Pairing"', 'label: "TripPairing_REMOVED"'),
  ],
  [
    "Trip Pairing board-view button navigates to the trip-pairing route",
    "dispatchPage",
    // The row templates its testid as `dispatch-view-${tab.id}` (one template covers all four
    // peers, including trip-pairing) rather than four hardcoded testid strings.
    hasAll('data-testid={`dispatch-view-${tab.id}`}', 'id: "trip-pairing"', 'navigate("/dispatch/trip-pairing")'),
    (s) => s.replace('navigate("/dispatch/trip-pairing")', 'navigate("/dispatch")'),
  ],
  [
    "Trip Pairing queues sub-nav entry retained (additive — not removed)",
    "subnav",
    hasAll('label: "Trip Pairing", href: "/dispatch/trip-pairing"'),
    (s) => s.replace('{ label: "Trip Pairing", href: "/dispatch/trip-pairing" },', ""),
  ],
  [
    "arch doc records the board-view row (Rule 05)",
    "archDesign",
    (s) => /Board-view row \(under Load board, owner 2026-09-04 item #2\)/.test(s),
    (s) => s.replace(/Board-view row \(under Load board, owner 2026-09-04 item #2\)/, "Board views"),
  ],
];

function audit(sources) {
  return contracts.filter(([, key, test]) => !test(sources[key])).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(
    `[verify-dispatch-trip-pairing-in-board-view-row] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`,
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
    `[verify-dispatch-trip-pairing-in-board-view-row] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`,
  );
  process.exit(0);
}

console.log("[verify-dispatch-trip-pairing-in-board-view-row] OK");
