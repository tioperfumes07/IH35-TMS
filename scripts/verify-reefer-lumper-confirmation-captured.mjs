#!/usr/bin/env node
// REEFER-LUMPER-CONFIRMATION (owner spec, 09-08-2026-CC-1-REEFER-LUMPER-CONFIRMATION-WORKFLOW.md):
// every reefer load must capture, at dispatch time, who pays the lumper (broker/customer), whether
// the customer will be invoiced for it, and whether a late-arrival penalty applies -- live-confirmed
// 2026-09-08 this did not exist anywhere (grepped the lumper module for who_pays/invoice_customer/
// late_penalty, zero matches).
//
// Fixed additively: migration 202614010000 (3 nullable columns on mdata.loads); book-load.service.ts
// persists them in the SAME post-insert UPDATE the existing reefer/tarp detail already uses (not the
// 39-column lockstep INSERT); loads.routes.ts's dispatch-transition endpoint refuses to move a
// reefer load (trailer_type='refrigerated_van') to 'dispatched' without all 3 set; the frontend
// (BookLoadModalV4.tsx) requires all 3 before submit for a reefer load, matching the existing
// trip_type required-field pattern; BookLoadEquipmentSection.tsx renders the 3 click-confirm
// controls inside the existing reefer panel; from-load.ts's stop_extra_rates -> invoice_lines
// accessorial path skips creating a customer invoice line for a rate_type='lumper' row unless
// lumper_payer='customer' AND lumper_will_invoice_customer=true, and when it does create one, routes
// it through invoice-line-revenue-resolution.service.ts's EXISTING line_type:'lumper' branch (no new
// GL math -- that branch already existed, just was never reached because this call site always
// passed 'accessorial').
//
// Usage: node scripts/verify-reefer-lumper-confirmation-captured.mjs [--selftest]
import fs from "node:fs";

const LABEL = "verify-reefer-lumper-confirmation-captured";
const MIGRATION_PATH = "db/migrations/202614010000_loads_reefer_lumper_confirmation.sql";
const BOOK_LOAD_SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const LOADS_ROUTES = "apps/backend/src/dispatch/loads.routes.ts";
const FROM_LOAD = "apps/backend/src/accounting/from-load.ts";
const EQUIPMENT_SECTION = "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx";
const BOOK_LOAD_MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

export function migrationAddsThreeColumns(src) {
  return (
    /ADD COLUMN IF NOT EXISTS lumper_payer text NULL/.test(src) &&
    /ADD COLUMN IF NOT EXISTS lumper_will_invoice_customer boolean NULL/.test(src) &&
    /ADD COLUMN IF NOT EXISTS lumper_late_penalty_applies boolean NULL/.test(src)
  );
}

export function bookLoadPersistsLumperFields(src) {
  return (
    /input\.lumper_payer != null \|\|/.test(src) &&
    /lumper_payer = \$9, lumper_will_invoice_customer = \$10,\s*\n\s*lumper_late_penalty_applies = \$11/.test(src)
  );
}

// FIX2 (live-caught 2026-09-09, booking a real reefer load end to end for the required live proof):
// trailer_type was declared on BookLoadInput and drove the frontend's own isReefer gating, but the
// main lockstep INSERT never wrote it -- every load ever booked left mdata.loads.trailer_type NULL
// no matter what the dispatcher picked, silently making dispatchTransitionGatesOnLumperFields's own
// `current.trailer_type === "refrigerated_van"` check dead for every future booking (confirmed live:
// a freshly booked Reefer-trailer load queried right after INSERT had trailer_type=null). Additive
// column write, no lockstep shape change otherwise.
export function bookLoadPersistsTrailerType(src) {
  return (
    /trailer_type\s*\n\s*\)\s*\n\s*VALUES/.test(src) &&
    /input\.trailer_type \?\? null,\s*\n\s*\]\s*\n\s*\);/.test(src)
  );
}

export function dispatchTransitionGatesOnLumperFields(src) {
  return (
    /mdataStatus === "dispatched" && current\.trailer_type === "refrigerated_van"/.test(src) &&
    /current\.lumper_payer == null \|\|\s*\n\s*current\.lumper_will_invoice_customer == null \|\|\s*\n\s*current\.lumper_late_penalty_applies == null/.test(
      src
    ) &&
    /reefer_lumper_confirmation_required/.test(src)
  );
}

export function frontendRequiresLumperFieldsBeforeSubmit(src) {
  return (
    /values\.trailer_type === "refrigerated_van"/.test(src) &&
    /!values\.lumper_payer/.test(src) &&
    /values\.lumper_will_invoice_customer == null/.test(src) &&
    /values\.lumper_late_penalty_applies == null/.test(src)
  );
}

export function equipmentSectionRendersConfirmationPanel(src) {
  return (
    /data-testid="reefer-lumper-confirmation-panel"/.test(src) &&
    /data-testid=\{`lumper-payer-\$\{opt\.value\}`\}/.test(src) &&
    /register\("lumper_payer"\)/.test(src) &&
    /data-testid=\{`lumper-invoice-customer-\$\{opt\.value \? "yes" : "no"\}`\}/.test(src) &&
    /register\("lumper_will_invoice_customer"\)/.test(src) &&
    /data-testid=\{`lumper-late-penalty-\$\{opt\.value \? "yes" : "no"\}`\}/.test(src) &&
    /register\("lumper_late_penalty_applies"\)/.test(src)
  );
}

export function invoiceLineSkipsUnconfirmedLumperAndReusesResolver(src) {
  return (
    /if \(rate\.rate_type === "lumper" && !lumperConfirmed\) continue;/.test(src) &&
    /lumperConfirmed = flags\?\.lumper_payer === "customer" && flags\?\.lumper_will_invoice_customer === true;/.test(src) &&
    /resolveInvoiceLineRevenueAccountId\(input\.operatingCompanyId, \{ line_type: "lumper" \}\)/.test(src)
  );
}

function violations(files) {
  const errors = [];
  if (!fs.existsSync(MIGRATION_PATH)) errors.push(`${MIGRATION_PATH} not found`);
  if (!migrationAddsThreeColumns(files.migration)) errors.push("migration no longer adds all 3 lumper columns");
  if (!bookLoadPersistsLumperFields(files.bookLoad)) errors.push("book-load.service.ts no longer persists the 3 lumper fields post-insert");
  if (!bookLoadPersistsTrailerType(files.bookLoad)) errors.push("book-load.service.ts no longer persists trailer_type on the main INSERT -- the dispatch-transition gate would go dead for every future booking");
  if (!dispatchTransitionGatesOnLumperFields(files.loadsRoutes)) errors.push("loads.routes.ts no longer gates the dispatched transition on a reefer load's 3 lumper fields");
  if (!frontendRequiresLumperFieldsBeforeSubmit(files.bookLoadModal)) errors.push("BookLoadModalV4.tsx no longer requires the 3 lumper fields before submit for a reefer load");
  if (!equipmentSectionRendersConfirmationPanel(files.equipmentSection)) errors.push("BookLoadEquipmentSection.tsx no longer renders the reefer-lumper confirmation panel");
  if (!invoiceLineSkipsUnconfirmedLumperAndReusesResolver(files.fromLoad)) errors.push("from-load.ts no longer skips an unconfirmed customer-billed lumper line or reuses the existing lumper revenue-code resolver");
  return errors;
}

function check(files) {
  const errors = violations(files);
  if (errors.length) throw new Error(errors.join("; "));
}

function loadFiles() {
  return {
    migration: fs.existsSync(MIGRATION_PATH) ? fs.readFileSync(MIGRATION_PATH, "utf8") : "",
    bookLoad: fs.readFileSync(BOOK_LOAD_SERVICE, "utf8"),
    loadsRoutes: fs.readFileSync(LOADS_ROUTES, "utf8"),
    fromLoad: fs.readFileSync(FROM_LOAD, "utf8"),
    equipmentSection: fs.readFileSync(EQUIPMENT_SECTION, "utf8"),
    bookLoadModal: fs.readFileSync(BOOK_LOAD_MODAL, "utf8"),
  };
}

const files = loadFiles();

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    { ...files, migration: files.migration.replace("ADD COLUMN IF NOT EXISTS lumper_payer text NULL,", "") },
    { ...files, bookLoad: files.bookLoad.replace("input.lumper_payer != null ||\n", "") },
    { ...files, bookLoad: files.bookLoad.replace("input.trailer_type ?? null,\n", "") },
    { ...files, loadsRoutes: files.loadsRoutes.replace('current.trailer_type === "refrigerated_van"', 'false') },
    {
      ...files,
      bookLoadModal: files.bookLoadModal.replace(
        'if (values.trailer_type === "refrigerated_van") {',
        "if (false) {"
      ),
    },
    { ...files, equipmentSection: files.equipmentSection.replace('data-testid="reefer-lumper-confirmation-panel"', 'data-testid="removed"') },
    { ...files, fromLoad: files.fromLoad.replace('if (rate.rate_type === "lumper" && !lumperConfirmed) continue;\n', "") },
  ];
  for (const mutated of mutations) {
    try {
      check(mutated);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error("a mutation escaped detection");
  }
  check(files);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(files);
  console.log(`${LABEL} PASS -- reefer-lumper confirmation captured at booking, gated at dispatch, wired into the invoice-line resolver`);
}
