#!/usr/bin/env node
// SM1 — Safety driver creator entry-point guard.
//
// The Safety module's Driver-Files surface (SafetyLayout → DriverFilesTab → DriversListPage) had no
// single-driver create action, so an office/safety user could not add a new hire without leaving the
// module. The fix mounts the SINGLE, canonical driver creator (components/drivers/CreateDriverModal)
// on the shared DriversListPage — which renders in BOTH Safety "Driver Files" and the Drivers module
// "Profiles" subtab.
//
// This guard freezes three invariants so the fix can't silently regress:
//   1. CreateDriverModal exists and owns THE ONLY createDriver mutation (no second, divergent creator
//      that could skip the create_driver_with_vendor vendor linkage — Blueprint 4.2.2.1).
//   2. DriversListPage imports CreateDriverModal and renders the "+ Create driver" action.
//   3. pages/Drivers.tsx imports the SAME CreateDriverModal (the header creator was extracted, not
//      duplicated).

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FE = path.join(ROOT, "apps/frontend/src");
const MODAL_FILE = path.join(FE, "components/drivers/CreateDriverModal.tsx");
const LIST_FILE = path.join(FE, "pages/drivers/DriversListPage.tsx");
const DRIVERS_FILE = path.join(FE, "pages/Drivers.tsx");

// RE-ANCHOR (found stale 2026-08-29): mutationFn used to be the bare `createDriver` reference; it's
// since become an inline wrapper -- `mutationFn: (input: {...}) => createDriver(input.payload)` --
// so it can pass a richer input shape through to the same single createDriver call. The modal still
// owns the ONLY createDriver invocation; the literal `mutationFn:\s*createDriver\b` reference match
// just never matches a wrapper. Accept either the bare reference OR an arrow function whose body
// calls createDriver(, so a real second creator (anywhere, in either form) is still caught by the
// anti-divergence scan below.
const MUTATION_FN_OWNS_CREATE_DRIVER = /mutationFn:\s*(?:createDriver\b|\([^)]*\)(?:\s*:[^=]*)?\s*=>[\s\S]{0,150}?createDriver\()/;

function fail(message) {
  console.error(`verify:safety-driver-creator-entry — FAILED\n- ${message}`);
  process.exit(1);
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) fail(message);
}

for (const file of [MODAL_FILE, LIST_FILE, DRIVERS_FILE]) {
  if (!fs.existsSync(file)) fail(`missing required file ${path.relative(ROOT, file)}`);
}

const modalSource = fs.readFileSync(MODAL_FILE, "utf8");
const listSource = fs.readFileSync(LIST_FILE, "utf8");
const driversSource = fs.readFileSync(DRIVERS_FILE, "utf8");

// 1. The shared modal is the canonical creator.
requirePattern(modalSource, /export function CreateDriverModal\b/, "CreateDriverModal must export CreateDriverModal");
requirePattern(modalSource, MUTATION_FN_OWNS_CREATE_DRIVER, "CreateDriverModal must own the createDriver mutation");
requirePattern(modalSource, /onCreated\??:/, "CreateDriverModal must accept an onCreated prop (Safety lands on the new DQF)");

// 2. DriversListPage (the shared Safety/Profiles surface) mounts the creator + exposes the button.
requirePattern(
  listSource,
  /import\s*\{[^}]*\bCreateDriverModal\b[^}]*\}\s*from\s*["'][^"']*components\/drivers\/CreateDriverModal["']/,
  "DriversListPage must import CreateDriverModal from components/drivers/CreateDriverModal"
);
requirePattern(listSource, /<CreateDriverModal\b/, "DriversListPage must render <CreateDriverModal />");
requirePattern(
  listSource,
  /\+\s*Create driver/i,
  "DriversListPage must render a '+ Create driver' action on the DQF surface"
);
requirePattern(
  listSource,
  /onCreated=\{onOpenProfile\}/,
  "DriversListPage must wire onCreated to onOpenProfile so a new hire opens straight into the DQF"
);

// 3. Drivers.tsx uses the SAME extracted component (no duplicate inline creator).
requirePattern(
  driversSource,
  /import\s*\{[^}]*\bCreateDriverModal\b[^}]*\}\s*from\s*["'][^"']*components\/drivers\/CreateDriverModal["']/,
  "pages/Drivers.tsx must import the SAME CreateDriverModal component"
);
requirePattern(driversSource, /<CreateDriverModal\b/, "pages/Drivers.tsx must render <CreateDriverModal />");

// Anti-divergence: there must be exactly ONE createDriver mutation in the whole frontend, and it must
// live in the shared component. A second `mutationFn: createDriver` anywhere = a forbidden 2nd creator.
function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(t|j)sx?$/.test(entry.name) && !/\.test\.(t|j)sx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const offenders = walk(FE, [])
  .filter((file) => path.resolve(file) !== path.resolve(MODAL_FILE))
  .filter((file) => MUTATION_FN_OWNS_CREATE_DRIVER.test(fs.readFileSync(file, "utf8")))
  .map((file) => path.relative(ROOT, file));

if (offenders.length > 0) {
  fail(
    `a second driver creator was found (createDriver mutation outside the shared CreateDriverModal): ${offenders.join(
      ", "
    )} — reuse components/drivers/CreateDriverModal instead`
  );
}

console.log("verify:safety-driver-creator-entry — OK");
