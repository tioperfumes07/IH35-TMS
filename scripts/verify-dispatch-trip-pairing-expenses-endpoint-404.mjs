#!/usr/bin/env node
// DISPATCH-TRIP-PAIRING-EXPENSES-ENDPOINT-404 — guard
//
// The dispatch trip-pairing page (/dispatch/trip-pairing) used to call GET /api/v1/accounting/expenses —
// a route that has never existed on the backend (confirmed: zero registration anywhere in
// apps/backend/src/accounting/) — which 404'd with no error surfaced to the user. The page now sources
// its data exclusively from getTripPairingBoard() → GET /api/v1/dispatch/trip-pairing-board, a route
// that DOES exist and returns real data (live-verified this hop: kpis/unbooked/tours payload, 200 OK).
// This guard fails if the ghost /accounting/expenses call — or any hand-rolled fetch to it — is ever
// reintroduced into the trip-pairing page or its API module.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PAGE_FILE = "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx";
const API_FILE = "apps/frontend/src/api/dispatch.ts";

export function check(pageText, apiText) {
  const failures = [];

  if (/accounting\/expenses/.test(pageText)) {
    failures.push(`${PAGE_FILE} references the ghost "accounting/expenses" route again`);
  }
  if (!/getTripPairingBoard/.test(pageText)) {
    failures.push(`${PAGE_FILE} no longer calls getTripPairingBoard — the real trip-pairing data source`);
  }
  if (!/export function getTripPairingBoard\(operatingCompanyId: string\) \{/.test(apiText)) {
    failures.push(`${API_FILE} no longer exports getTripPairingBoard`);
  }
  if (!/\/api\/v1\/dispatch\/trip-pairing-board/.test(apiText)) {
    failures.push(`${API_FILE} getTripPairingBoard no longer points at /api/v1/dispatch/trip-pairing-board`);
  }

  return failures;
}

function run() {
  const pageText = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const apiText = fs.readFileSync(path.join(root, API_FILE), "utf8");
  const failures = check(pageText, apiText);
  if (failures.length > 0) {
    console.error("FAIL: dispatch-trip-pairing-expenses-endpoint-404");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: trip-pairing board never calls the ghost /api/v1/accounting/expenses route; real trip-pairing-board endpoint wired");
}

function selftest() {
  const pageText = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const apiText = fs.readFileSync(path.join(root, API_FILE), "utf8");

  const offenderPage = pageText.replace(
    "import { getTripPairingBoard,",
    'import { getTripPairingBoard } from "../../api/dispatch"; // GHOST: fetch("/api/v1/accounting/expenses");\nimport {'
  );
  if (offenderPage === pageText) {
    console.error("FAIL(selftest): offender mutation did not change the page file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderPage, apiText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (ghost accounting/expenses reference) was NOT caught");
    process.exit(1);
  }

  const offenderApi = apiText.replace("/api/v1/dispatch/trip-pairing-board", "/api/v1/accounting/expenses");
  if (offenderApi === apiText) {
    console.error("FAIL(selftest): offender mutation did not change the api file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(pageText, offenderApi);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (getTripPairingBoard repointed at the ghost route) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
