#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["customer","driver","unit","trailer","load","connectivity"],"leafRe":"^(secondary\\.book_load|planning\\.reserve|home\\.|load_board|load\\.)","task":"P39","pr":"#5958"} */
/**
 * P39 (WIRING-PLAN-50) — Book Load must persist linkage FKs on create:
 *   - mdata.loads: customer_id, assigned_unit_id, assigned_primary_driver_id
 *   - dispatch.load_assignment_history.new_trailer_id when trailer selected
 *   - BookLoadModalV4 submit payload carries the same ids to the API
 *
 * Static ratchet — no Neon required in CI.
 *
 *   node scripts/verify-book-load-stamps-linkage-fks.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-load-stamps-linkage-fks";
const SELFTEST = process.argv.includes("--selftest");
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const API = "apps/frontend/src/api/dispatch.ts";
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(bookSrc, modalSrc, apiSrc = "", routesSrc = "") {
  const problems = [];

  const insertMatch = bookSrc.match(/INSERT INTO mdata\.loads\s*\(([\s\S]*?)\)\s*\n\s*VALUES/s);
  if (!insertMatch) {
    problems.push(`${BOOK}: INSERT INTO mdata.loads block not found`);
  } else {
    const cols = insertMatch[1];
    for (const col of ["customer_id", "assigned_unit_id", "assigned_primary_driver_id"]) {
      if (!new RegExp(`\\b${col}\\b`).test(cols)) {
        problems.push(`${BOOK}: mdata.loads INSERT missing column ${col}`);
      }
    }
    const valuesSlice = bookSrc.slice(insertMatch.index ?? 0, (insertMatch.index ?? 0) + 2500);
    if (!/input\.customer_id/.test(valuesSlice)) {
      problems.push(`${BOOK}: INSERT VALUES must bind input.customer_id`);
    }
    if (!/input\.assigned_unit_id/.test(valuesSlice)) {
      problems.push(`${BOOK}: INSERT VALUES must bind input.assigned_unit_id`);
    }
    if (!/input\.assigned_primary_driver_id/.test(valuesSlice)) {
      problems.push(`${BOOK}: INSERT VALUES must bind input.assigned_primary_driver_id`);
    }
  }

  if (!/INSERT INTO dispatch\.load_assignment_history/.test(bookSrc)) {
    problems.push(`${BOOK}: missing load_assignment_history INSERT for trailer link`);
  } else if (!/new_trailer_id/.test(bookSrc)) {
    problems.push(`${BOOK}: load_assignment_history INSERT must set new_trailer_id`);
  }
  if (!/assigned_trailer_unit_id/.test(bookSrc)) {
    problems.push(`${BOOK}: must accept assigned_trailer_unit_id on book-load input`);
  }

  for (const key of ["customer_id:", "assigned_unit_id:", "assigned_primary_driver_id:", "assigned_trailer_unit_id:"]) {
    if (!modalSrc.includes(key)) {
      problems.push(`${MODAL}: submit payload must include ${key.replace(":", "")}`);
    }
  }
  if (!/customer_id:\s*values\.customer_id/.test(modalSrc)) {
    problems.push(`${MODAL}: submit must pass values.customer_id to book-load API`);
  }

  // Payload parity: these canonical FK-bearing fields must survive all three request layers.
  const topLevelFkFields = [
    "customer_id",
    "catalog_load_type_id",
    "load_trailer_equipment_id",
    "factoring_company_vendor_id",
    "detention_reason_id",
    "assigned_unit_id",
    "assigned_trailer_unit_id",
    "assigned_primary_driver_id",
  ];
  for (const field of topLevelFkFields) {
    if (!new RegExp(`\\b${field}\\s*\\??:`).test(apiSrc)) problems.push(`${API}: DispatchBookLoadPayload missing ${field}`);
    if (!new RegExp(`\\b${field}\\s*:`).test(routesSrc)) problems.push(`${ROUTES}: create schema missing ${field}`);
    if (!new RegExp(`\\b${field}\\s*:`).test(modalSrc)) problems.push(`${MODAL}: submit payload missing ${field}`);
  }
  for (const nestedField of ["additional_charge_id", "pickup_time_type_id", "lumper_provider_id", "postal_code"]) {
    if (!new RegExp(`\\b${nestedField}\\s*\\??:`).test(apiSrc)) problems.push(`${API}: nested payload missing ${nestedField}`);
    if (!new RegExp(`\\b${nestedField}\\s*:`).test(routesSrc)) problems.push(`${ROUTES}: nested create schema missing ${nestedField}`);
    if (!new RegExp(`\\b${nestedField}\\s*:`).test(modalSrc)) problems.push(`${MODAL}: nested submit mapping missing ${nestedField}`);
  }
  if (!/load_trailer_equipment_id\?:\s*string/.test(apiSrc) ||
      !/load_trailer_equipment_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\),\s*\n\s*\/\/ Trip Pairing/.test(routesSrc) ||
      !/resolveLoadTrailerEquipmentIdForInsert[\s\S]{0,240}input\.load_trailer_equipment_id/.test(bookSrc)) {
    problems.push("Book Load trailer equipment must be optional at the request boundary and resolved to a canonical FK before persistence");
  }
  if (!/city:\s*string/.test(apiSrc) || !/city:\s*z\.string\(\)\.trim\(\)\.min\(1/.test(routesSrc)) {
    problems.push("Book Load stop city must be required in both FE payload type and backend create schema");
  }
  for (const trailerType of ["refrigerated_van", "dry_van", "flatbed", "lowboy", "power_only_no_trailer", "power_only_customer_trailer"]) {
    if (!modalSrc.includes(`| \"${trailerType}\"`)) problems.push(`${MODAL}: trailer_type submit cast missing ${trailerType}`);
  }

  return problems;
}

if (SELFTEST) {
  const book = read(BOOK);
  const modal = read(MODAL);
  const api = read(API);
  const routes = read(ROUTES);
  if (collectProblems(book, modal, api, routes).length) {
    console.error(`${LABEL} selftest baseline FAIL`);
    process.exit(1);
  }
  const badBook = book.replace(/assigned_unit_id, assigned_primary_driver_id/, "assigned_primary_driver_id");
  if (!collectProblems(badBook, modal, api, routes).length) {
    console.error(`${LABEL} selftest: removing assigned_unit_id from INSERT cols did not fail`);
    process.exit(1);
  }
  const badModal = modal.replace("customer_id: values.customer_id", "customer_id: undefined");
  if (!collectProblems(book, badModal, api, routes).length) {
    console.error(`${LABEL} selftest: stripping modal customer_id did not fail`);
    process.exit(1);
  }
  const requiredApi = api.replace("load_trailer_equipment_id?: string", "load_trailer_equipment_id: string");
  if (!collectProblems(book, modal, requiredApi, routes).length) {
    console.error(`${LABEL} selftest: making blank trailer equipment invalid at the API boundary did not fail`);
    process.exit(1);
  }
  const requiredRoute = routes.replace("load_trailer_equipment_id: z.string().uuid().optional()", "load_trailer_equipment_id: z.string().uuid()");
  if (!collectProblems(book, modal, api, requiredRoute).length) {
    console.error(`${LABEL} selftest: making blank trailer equipment invalid at the route boundary did not fail`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
  process.exit(0);
}

const problems = collectProblems(read(BOOK), read(MODAL), read(API), read(ROUTES));
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Book Load stamps customer/unit/driver on load row and trailer on assignment history`);
process.exit(0);
