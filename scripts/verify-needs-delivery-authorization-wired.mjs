#!/usr/bin/env node
/**
 * ROUND 292 — FACTOR-BUT-NOT-DELIVERED named queue must stay wired end-to-end.
 * Engine alone (POST manual-delivery-authorization) is not enough: the Owner needs a
 * named queue to find rolling loads with issued invoices and no active authorization.
 * Fails if the GET queue, FE page, subnav badge, sidebar leaf, or route is missing.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";

const ROOT = process.env.VERIFY_ROOT || fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-needs-delivery-authorization-wired";

if (process.argv.includes("--selftest")) selftest();

function mustContain(rel, needles) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    console.error(`${LABEL} FAIL: missing ${rel}`);
    process.exit(1);
  }
  const src = readFileSync(abs, "utf8");
  for (const n of needles) {
    if (!src.includes(n)) {
      console.error(`${LABEL} FAIL: ${rel} missing ${JSON.stringify(n)}`);
      process.exit(1);
    }
  }
}

mustContain("apps/backend/src/dispatch/manual-delivery-authorization.routes.ts", [
  "/api/v1/dispatch/needs-delivery-authorization",
  'waiting_for: "delivery_authorization"',
  "/api/v1/dispatch/loads/:loadId/manual-delivery-authorization",
  '["dispatched", "at_pickup", "in_transit", "at_delivery"]',
]);

mustContain("apps/backend/src/index.ts", ["registerManualDeliveryAuthorizationRoutes"]);

mustContain("apps/frontend/src/api/dispatch.ts", [
  "listNeedsDeliveryAuthorization",
  "createManualDeliveryAuthorization",
  "/api/v1/dispatch/needs-delivery-authorization",
  'waiting_for: "delivery_authorization"',
]);

mustContain("apps/frontend/src/pages/dispatch/NeedsDeliveryAuthorizationPage.tsx", [
  "listNeedsDeliveryAuthorization",
  "createManualDeliveryAuthorization",
  "needs-delivery-authorization-page",
  "needs-delivery-authorization-table",
  "authorize-delivery-submit",
]);

mustContain("apps/frontend/src/routes/manifest.tsx", [
  "NeedsDeliveryAuthorizationPage",
  "/dispatch/needs-delivery-authorization",
]);

mustContain("apps/frontend/src/components/dispatch/DispatchSubnav.tsx", [
  "/dispatch/needs-delivery-authorization",
  "listNeedsDeliveryAuthorization",
  'badgeKey: "needs_delivery_auth"',
  '"needs_delivery_auth"',
]);

mustContain("apps/frontend/src/components/layout/sidebar-config.ts", [
  "/dispatch/needs-delivery-authorization",
  "Needs delivery authorization",
]);

console.log(`${LABEL} OK`);
process.exit(0);

function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {}, [], { VERIFY_ROOT: "." });
  reportSelftest(LABEL, [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when core inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
