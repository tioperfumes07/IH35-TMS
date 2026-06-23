#!/usr/bin/env node
/**
 * GAP-31 CI guard — verifies multi-stop per-stop extra-rate wiring.
 */
import { readFileSync } from "node:fs";

const files = {
  migration: "db/migrations/202606080202_stop_extra_rates.sql",
  service: "apps/backend/src/dispatch/loads/multi-stop/extra-rate.service.ts",
  routes: "apps/backend/src/dispatch/loads/multi-stop/extra-rate.routes.ts",
  fromLoad: "apps/backend/src/accounting/from-load.ts",
  editor: "apps/frontend/src/components/dispatch/MultiStopExtraRateEditor.tsx",
  // GAP-31 editor RELOCATED to §A (Customer · Invoice · Charges) per GUARD 2026-06-23 — render-v6 §C shows
  // no extra-rate editor, so it can't live in the stop card. It mounts in BookLoadModalV4 §A, stop-scoped.
  bookLoadModal: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  bookLoadStops: "apps/frontend/src/pages/dispatch/components/BookLoadStopsSection.tsx",
  indexTs: "apps/backend/src/index.ts",
  docs: "docs/specs/gap-31-multi-stop-extra-rates.md",
};

function read(path) {
  return readFileSync(path, "utf8");
}

const migration = read(files.migration);
const service = read(files.service);
const routes = read(files.routes);
const fromLoad = read(files.fromLoad);
const editor = read(files.editor);
const bookLoadModal = read(files.bookLoadModal);
const bookLoadStops = read(files.bookLoadStops);
const indexTs = read(files.indexTs);
const docs = read(files.docs);

const checks = [
  ["migration creates dispatch.stop_extra_rates", migration.includes("CREATE TABLE IF NOT EXISTS dispatch.stop_extra_rates")],
  ["migration enables RLS policy", migration.includes("stop_extra_rates_tenant_isolation")],
  ["service has add/list/total/soft-delete", service.includes("addStopExtra") && service.includes("listForLoad") && service.includes("totalForLoad") && service.includes("softDelete")],
  ["routes register API paths", routes.includes("/api/v1/dispatch/loads/:load_uuid/stops/:stop_uuid/extra-rates") && routes.includes("/api/v1/dispatch/loads/:load_uuid/extra-rates")],
  ["frontend editor exists", editor.includes("Per-stop extra rates")],
  // GUARD 2026-06-23: editor lives in §A (Customer · Invoice · Charges), stop-scoped — NOT in the §C card.
  ["§A mounts the extra-rate editor", bookLoadModal.includes("MultiStopExtraRateEditor") && bookLoadModal.includes('data-testid="section-a-extra-rates"')],
  ["editor is stop-scoped (stopIndex per line)", bookLoadModal.includes("stopIndex={i}") && editor.includes("stops.${stopIndex}.extra_rates")],
  ["§C stop card does NOT mount the editor (empty-diff: exactly 11 fields)", !bookLoadStops.includes("MultiStopExtraRateEditor")],
  ["accounting from-load includes stop extras", fromLoad.includes("dispatch.stop_extra_rates") && fromLoad.includes("invoice_line_uuid")],
  ["backend index registers routes", indexTs.includes("registerLoadStopExtraRateRoutes")],
  ["spec doc references WF-053", docs.includes("WF-053")],
];

let failed = false;
for (const [label, ok] of checks) {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ FAIL: ${label}`);
    failed = true;
  }
}

if (failed) {
  console.error("GAP-31 multi-stop extra-rate guard failed");
  process.exit(1);
}

console.log("GAP-31 multi-stop extra-rate guard: PASS");
