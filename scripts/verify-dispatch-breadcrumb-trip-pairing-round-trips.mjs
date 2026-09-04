#!/usr/bin/env node
/**
 * DISPATCH items #3 + #4 (owner 2026-09-04):
 *   #3 Trip Pairing never highlighted and its breadcrumb read just "Dispatch" — it
 *      was absent from BREADCRUMB_LABELS and had no dispatchSubNavActiveHref branch.
 *   #4 Round Trips breadcrumb rendered "Dispatch › Dispatch" (duplicated) because the
 *      /dispatch/round-trips deep-link route fell through to the bare-pathname
 *      fallback and ?view=units mapped to the kanban href.
 * This guard asserts both the BREADCRUMB_LABELS entries and the
 * dispatchSubNavActiveHref branches exist in apps/frontend/src/components/dispatch/
 * DispatchSubnav.tsx.
 *
 * Self-testing static guard (root band — Rule 37 claim-before-write forbids a
 * numbered verify-step in the same PR). Run:
 *   node scripts/verify-dispatch-breadcrumb-trip-pairing-round-trips.mjs [--selftest]
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/components/dispatch/DispatchSubnav.tsx";
const original = { subnav: fs.readFileSync(FILE, "utf8") };

const has = (needle) => (s) => s.includes(needle);

const contracts = [
  [
    "#3 Trip Pairing breadcrumb label present",
    "subnav",
    has('"/dispatch/trip-pairing": "Trip Pairing"'),
    (s) => s.replace('"/dispatch/trip-pairing": "Trip Pairing",', ""),
  ],
  [
    "#3 Trip Pairing active-href branch present",
    "subnav",
    has('if (pathname.startsWith("/dispatch/trip-pairing")) return "/dispatch/trip-pairing";'),
    (s) => s.replace('if (pathname.startsWith("/dispatch/trip-pairing")) return "/dispatch/trip-pairing";', ""),
  ],
  [
    "#4 Round Trips (?view=units) breadcrumb label present",
    "subnav",
    has('"/dispatch?view=units": "Round Trips"'),
    (s) => s.replace('"/dispatch?view=units": "Round Trips",', ""),
  ],
  [
    "#4 Round Trips deep-link route breadcrumb label present",
    "subnav",
    has('"/dispatch/round-trips": "Round Trips"'),
    (s) => s.replace('"/dispatch/round-trips": "Round Trips",', ""),
  ],
  [
    "#4 Round Trips deep-link route maps to the units board href",
    "subnav",
    has('if (pathname === "/dispatch/round-trips") return "/dispatch?view=units";'),
    (s) => s.replace('if (pathname === "/dispatch/round-trips") return "/dispatch?view=units";', ""),
  ],
  [
    "#4 ?view=units maps to its own active href (not the kanban fallback)",
    "subnav",
    has('if (view === "units") return "/dispatch?view=units";'),
    (s) => s.replace('if (view === "units") return "/dispatch?view=units";', ""),
  ],
];

function audit(sources) {
  return contracts.filter(([, key, test]) => !test(sources[key])).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(
    `[verify-dispatch-breadcrumb-trip-pairing-round-trips] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`,
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
    `[verify-dispatch-breadcrumb-trip-pairing-round-trips] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`,
  );
  process.exit(0);
}

console.log("[verify-dispatch-breadcrumb-trip-pairing-round-trips] OK");
