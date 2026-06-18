#!/usr/bin/env node
// Guard — Block 06 full load PATCH money-safety + legal-evidence invariants. Locks the two HARD RULES
// Jorge approved so they can't silently regress:
//   1. STOPS: never DELETE a load_stop (inbound FKs cascade-delete POD/BOL, detention, stop arrivals —
//      §1 legal evidence). Removed stops are ARCHIVED via status='cancelled'.
//   2. MONEY GUARD: the edit is blocked (409) when an OPEN load-bookended driver_settlement
//      (trip_closed_at IS NULL), an ISSUED/non-draft invoice (source_load_id), or a NON-OPEN
//      driver_bill exists.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-dispatch-load-patch-money-evidence-guard: ${m}`); process.exit(1); };

const svc = read("apps/backend/src/dispatch/update-load.service.ts");

// 1) NEVER delete a load_stop.
if (/DELETE\s+FROM\s+mdata\.load_stops/i.test(svc))
  fail("update-load.service must NEVER DELETE from mdata.load_stops (cascades destroy legal evidence) — archive via status='cancelled'");
if (!/status = 'cancelled'/.test(svc)) fail("removed stops must be archived via status='cancelled'");
if (!/UPDATE mdata\.load_stops/.test(svc)) fail("kept stops must be UPDATEd in place (preserve row + evidence)");

// 2) All three money guards present with the correct open-conditions.
if (!/FROM driver_finance\.driver_settlements[\s\S]*trip_closed_at IS NULL/.test(svc))
  fail("must guard on an OPEN load-bookended settlement (trip_closed_at IS NULL)");
if (!/settlement_model = 'load_bookended'/.test(svc)) fail("settlement guard must scope to settlement_model='load_bookended'");
if (!/FROM accounting\.invoices[\s\S]*status IN \('sent', 'partial', 'paid', 'factored'\)/.test(svc))
  fail("must guard on an ISSUED (non-draft) invoice via source_load_id");
if (!/FROM driver_finance\.driver_bills[\s\S]*status <> 'open'/.test(svc))
  fail("must guard on a NON-OPEN driver bill");
if (!/LoadEditLockedError/.test(svc)) fail("must throw LoadEditLockedError when locked");

// 3) Route maps the lock to 409 and never self-merges (gated comment present).
const route = read("apps/backend/src/dispatch/loads.routes.ts");
if (!/LoadEditLockedError[\s\S]*code\(409\)[\s\S]*load_edit_locked/.test(route))
  fail("PATCH route must map LoadEditLockedError -> 409 load_edit_locked");
if (!/app\.patch\("\/api\/v1\/dispatch\/loads\/:id"/.test(route))
  fail("PATCH /api/v1/dispatch/loads/:id route must be registered");

console.log("OK verify-dispatch-load-patch-money-evidence-guard: stop archive-not-delete + 3 money guards locked.");
