#!/usr/bin/env node
/**
 * PINGSETTLEMENT-TRIP-CLOSE-STAMP — horizontal class fix: load-bookended settlements with
 * trip_closed_at NULL after payrun-close or past delivered_pending_docs must be closeable and
 * must not permanently block load edits (Owner override + close-trip endpoint).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-trip-close-stamp";

const PATHS = {
  bookended: path.join(ROOT, "apps/backend/src/driver-finance/settlements-load-bookended.service.ts"),
  payrun: path.join(ROOT, "apps/backend/src/driver-finance/settlement-payrun-close.service.ts"),
  payrunRoutes: path.join(ROOT, "apps/backend/src/driver-finance/settlement-payrun-close.routes.ts"),
  updateLoad: path.join(ROOT, "apps/backend/src/dispatch/update-load.service.ts"),
  loadsRoutes: path.join(ROOT, "apps/backend/src/dispatch/loads.routes.ts"),
  closeTripPanel: path.join(ROOT, "apps/frontend/src/pages/driver-finance/components/CloseTripPanel.tsx"),
  settlementDetail: path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx"),
  driverFinanceApi: path.join(ROOT, "apps/frontend/src/api/driverFinance.ts"),
};

function read(p) {
  return fs.readFileSync(p, "utf8");
}

export function assertSettlementTripCloseStamp(sources) {
  const fails = [];
  const b = sources.bookended;
  const p = sources.payrun;
  const pr = sources.payrunRoutes;
  const u = sources.updateLoad;
  const lr = sources.loadsRoutes;
  const ui = sources.closeTripPanel;
  const sd = sources.settlementDetail;
  const api = sources.driverFinanceApi;

  if (!/export async function stampTripClosedForBookendedSettlement/.test(b)) {
    fails.push("settlements-load-bookended.service.ts must export stampTripClosedForBookendedSettlement");
  }
  if (!/trip_closed_at = \$2::timestamptz/.test(b)) {
    fails.push("stampTripClosedForBookendedSettlement must SET trip_closed_at");
  }
  if (!/stampTripClosedForBookendedSettlement\s*\(\s*client/.test(p)) {
    fails.push("settlement-payrun-close.service.ts must call stampTripClosedForBookendedSettlement(client…) after payrun post");
  }
  if (!/settlements\/:id\/close-trip/.test(pr)) {
    fails.push("settlement-payrun-close.routes.ts must expose POST …/settlements/:id/close-trip");
  }
  if (!/canOwnerOverrideLoadEditLock/.test(u)) {
    fails.push("update-load.service.ts must export canOwnerOverrideLoadEditLock");
  }
  if (!/dispatch\.load\.edit_owner_override/.test(u)) {
    fails.push("Owner load edit override must append dispatch.load.edit_owner_override audit event");
  }
  if (!/requestingUserRole/.test(lr)) {
    fails.push("loads.routes.ts PATCH must pass requestingUserRole into updateDispatchLoad");
  }
  if (!/closeSettlementTrip/.test(api)) {
    fails.push("driverFinance.ts must export closeSettlementTrip API helper");
  }
  if (!/close-trip-button/.test(ui)) {
    fails.push("CloseTripPanel must expose close-trip-button for Live Chrome");
  }
  if (!/CloseTripPanel/.test(sd)) {
    fails.push("SettlementDetailPage must mount CloseTripPanel");
  }
  return fails;
}

function loadSources() {
  return Object.fromEntries(Object.entries(PATHS).map(([k, p]) => [k, read(p)]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSources();
  if (assertSettlementTripCloseStamp(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — current sources should pass`);
    process.exit(1);
  }
  const bad = {
    ...good,
    payrun: good.payrun.replace(/stampTripClosedForBookendedSettlement\s*\(\s*client/g, "REMOVED_STAMP(client"),
  };
  const planted = assertSettlementTripCloseStamp(bad);
  if (!planted.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted payrun regression not detected`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const fails = assertSettlementTripCloseStamp(loadSources());
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — trip close stamp + Owner load override + Close trip UI wired`);
