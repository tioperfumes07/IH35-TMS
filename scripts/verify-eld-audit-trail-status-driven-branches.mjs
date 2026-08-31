#!/usr/bin/env node
// ELD-AUDIT-TRAIL-FALSE-EMPTY-ON-503: EldAuditTrailViewer used to gate its three result branches on
// the derived booleans isLoading (= isPending && isFetching) and isError. TanStack Query v5 can leave
// a query in status "pending" while isFetching is momentarily false (e.g. a retry backoff window that
// never completes a second attempt), so isLoading and isError were BOTH false -- and
// "!isLoading && !isError" was wrongly treated as a successful empty result. Confirmed live: the
// backend consistently 503s (eld_audit_source_unavailable) for a tenant with the Samsara HOS source
// unconfigured, and the page silently rendered "No edits found" instead of the honest error banner,
// reproduced with several fresh, never-before-queried driver/date-range combinations (ruling out
// browser HTTP cache). Guard requires the three branches to be driven by the mutually-exclusive,
// exhaustive `status` primitives (isPending/isError/isSuccess), never the isLoading/isError pair.
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx";

function inspect(source) {
  const failures = [];

  if (!/driverUuid && historyQuery\.isPending \? <p className="text-sm text-gray-500">Loading edit history…<\/p> : null/.test(source)) {
    failures.push("loading branch no longer gated on historyQuery.isPending");
  }
  if (!/driverUuid && historyQuery\.isSuccess \? \(/.test(source)) {
    failures.push("data branch no longer gated on historyQuery.isSuccess");
  }
  if (/driverUuid && !historyQuery\.isLoading && !historyQuery\.isError/.test(source)) {
    failures.push("the old isLoading/isError-derived data-branch gate is back -- this is the exact shape that masked a 503 as a false empty result");
  }
  if (/^\s*\{historyQuery\.isLoading \? <p/m.test(source)) {
    failures.push("the loading branch regressed to an ungated historyQuery.isLoading check");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-eld-audit-trail-status-driven-branches --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real
    .replace(
      '{driverUuid && historyQuery.isPending ? <p className="text-sm text-gray-500">Loading edit history…</p> : null}',
      '{historyQuery.isLoading ? <p className="text-sm text-gray-500">Loading edit history…</p> : null}',
    )
    .replace(
      "{driverUuid && historyQuery.isSuccess ? (",
      "{driverUuid && !historyQuery.isLoading && !historyQuery.isError ? (",
    );
  if (mutated === real) {
    console.error("verify-eld-audit-trail-status-driven-branches --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-eld-audit-trail-status-driven-branches --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-eld-audit-trail-status-driven-branches --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-eld-audit-trail-status-driven-branches FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-eld-audit-trail-status-driven-branches: OK — ELD Audit Trail's result branches are driven by status (isPending/isError/isSuccess), not the isLoading/isError pair that could both read false while a query was still pending");
