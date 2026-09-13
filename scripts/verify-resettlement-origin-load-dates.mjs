#!/usr/bin/env node
/**
 * verify-resettlement-origin-load-dates — NEW-10 (owner 2026-09-07, ROUND 6, verbatim:
 * "Resettlement records need a 'date started' and 'delivery date' column showing the ORIGINAL load
 *  that created the resettlement.")
 *
 * The owner's "resettlement records" = the SETTLEMENTS module register (SettlementsToursRegister —
 * the Pre-Settlement / Settlement tabs), one row per tour/settlement. Each row must surface the
 * ORIGINAL load that created the (re)settlement (the NB bookend) with its own two dates: the first
 * pickup ("date started") and the last delivery ("delivery date") — distinct from the tour-level
 * trip-open "Started" stamp.
 *
 * This STATIC, fail-closed guard pins the full vertical (against source on tip):
 *   1. buildTourReadout exposes the ORIGINAL load id on the tour object (first_load_id) so listTours
 *      can resolve the origin leg precisely, not guess.
 *   2. listTours resolves the origin leg (first_load_id → NB trip_type → first leg) and projects
 *      origin_load_number / origin_pickup_date / origin_delivery_date onto every TourListRow.
 *   3. The backend TourListRow type declares those three origin_* fields.
 *   4. The frontend TourListRow type declares those three origin_* fields.
 *   5. The settlements register renders BOTH the "Date started" and "Delivery date" columns
 *      (testIds setl-tour-col-origin-started / setl-tour-col-origin-delivered) off origin_pickup_date
 *      / origin_delivery_date via the compact mmmDd formatter.
 *
 * --selftest mutates each load-bearing fact and requires each mutation to FAIL; clean sources pass.
 */
import fs from "node:fs";

const BACKEND = "apps/backend/src/driver-finance/tour-readout.routes.ts";
const FEAPI = "apps/frontend/src/api/tourReadout.ts";
const SETL = "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx";

function analyze(src) {
  const { backend, feapi, setl } = src;
  const errors = [];

  // 1. buildTourReadout exposes the ORIGINAL load id on the tour object.
  if (!/first_load_id:\s*s\.first_load_id/.test(backend)) {
    errors.push("buildTourReadout tour object must expose first_load_id (the ORIGINAL load that opened the settlement)");
  }

  // 2. listTours resolves the origin leg and projects the three origin_* fields.
  if (!/r\.tour!\.first_load_id\s*!=\s*null\s*&&\s*l\.load_id\s*===\s*r\.tour!\.first_load_id/.test(backend)) {
    errors.push("listTours must resolve the origin leg by first_load_id (NB bookend), not guess");
  }
  if (!/l\.trip_type\s*===\s*"NB"/.test(backend)) {
    errors.push("listTours origin-leg fallback must prefer the NB leg when first_load_id is absent");
  }
  if (!/origin_load_number:\s*originLeg\?\.load_number/.test(backend)) errors.push("listTours must project origin_load_number off the resolved origin leg");
  if (!/origin_pickup_date:\s*originLeg\?\.pickup_date/.test(backend)) errors.push("listTours must project origin_pickup_date off the resolved origin leg");
  if (!/origin_delivery_date:\s*originLeg\?\.delivery_date/.test(backend)) errors.push("listTours must project origin_delivery_date off the resolved origin leg");

  // 3. backend TourListRow declares the three origin_* fields.
  if (!/origin_load_number:\s*string\s*\|\s*null;\s*origin_pickup_date:\s*string\s*\|\s*null;\s*origin_delivery_date:\s*string\s*\|\s*null;/.test(backend)) {
    errors.push("backend TourListRow must declare origin_load_number / origin_pickup_date / origin_delivery_date");
  }

  // 4. frontend TourListRow declares the three origin_* fields.
  if (!/origin_load_number:\s*string\s*\|\s*null;\s*origin_pickup_date:\s*string\s*\|\s*null;\s*origin_delivery_date:\s*string\s*\|\s*null;/.test(feapi)) {
    errors.push("frontend TourListRow (api/tourReadout.ts) must declare origin_load_number / origin_pickup_date / origin_delivery_date");
  }

  // 5. the register renders BOTH columns off the origin dates via mmmDd.
  // Labels renamed from the original "Date started"/"Delivery date" to "Original load pickup"/
  // "Original load delivery" so they read distinctly from the TOUR-level "Date started" column
  // (trip_started_at, a different concept — when the tour/settlement itself opened) that sits a
  // few columns over in this same register. TestIds/data source are unchanged; only the label text
  // moved, and this guard's checks were never updated to match.
  if (!/setl-tour-col-origin-started/.test(setl)) errors.push('register must render the "Original load pickup" column (testId setl-tour-col-origin-started)');
  if (!/setl-tour-col-origin-delivered/.test(setl)) errors.push('register must render the "Original load delivery" column (testId setl-tour-col-origin-delivered)');
  if (!/label:\s*"Original load pickup"/.test(setl)) errors.push('register origin-pickup column must carry the owner label "Original load pickup"');
  if (!/label:\s*"Original load delivery"/.test(setl)) errors.push('register origin-delivery column must carry the owner label "Original load delivery"');
  if (!/r\.origin_pickup_date\s*\?\s*<span[\s\S]{0,120}?mmmDd\(r\.origin_pickup_date\)/.test(setl)) {
    errors.push('register "Date started" cell must render mmmDd(origin_pickup_date)');
  }
  if (!/r\.origin_delivery_date\s*\?\s*<span[\s\S]{0,120}?mmmDd\(r\.origin_delivery_date\)/.test(setl)) {
    errors.push('register "Delivery date" cell must render mmmDd(origin_delivery_date)');
  }

  return errors;
}

const base = {
  backend: fs.readFileSync(BACKEND, "utf8"),
  feapi: fs.readFileSync(FEAPI, "utf8"),
  setl: fs.readFileSync(SETL, "utf8"),
};

function withField(field, transform) {
  return { ...base, [field]: transform(base[field]) };
}

if (process.argv.includes("--selftest")) {
  const clean = analyze(base);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["backend drops first_load_id on tour", withField("backend", (s) => s.replace(/first_load_id:\s*s\.first_load_id/g, "first_load_id: null"))],
    ["backend drops first_load_id origin resolve", withField("backend", (s) => s.replace(/r\.tour!\.first_load_id != null && l\.load_id === r\.tour!\.first_load_id/g, "false"))],
    ["backend drops NB fallback", withField("backend", (s) => s.replace(/l\.trip_type === "NB"/g, 'l.trip_type === "GONE"'))],
    ["backend drops origin_load_number projection", withField("backend", (s) => s.replace(/origin_load_number:\s*originLeg\?\.load_number \?\? null,/g, ""))],
    ["backend drops origin_pickup_date projection", withField("backend", (s) => s.replace(/origin_pickup_date:\s*originLeg\?\.pickup_date \?\? null,/g, ""))],
    ["backend drops origin_delivery_date projection", withField("backend", (s) => s.replace(/origin_delivery_date:\s*originLeg\?\.delivery_date \?\? null,/g, ""))],
    ["backend drops origin type", withField("backend", (s) => s.replace(/origin_load_number: string \| null; origin_pickup_date: string \| null; origin_delivery_date: string \| null;/g, ""))],
    ["frontend drops origin type", withField("feapi", (s) => s.replace(/origin_load_number: string \| null; origin_pickup_date: string \| null; origin_delivery_date: string \| null;/g, ""))],
    ["register drops started testId", withField("setl", (s) => s.replace(/setl-tour-col-origin-started/g, "gone-started"))],
    ["register drops delivered testId", withField("setl", (s) => s.replace(/setl-tour-col-origin-delivered/g, "gone-delivered"))],
    ["register drops Original load pickup label", withField("setl", (s) => s.replace(/label: "Original load pickup"/g, 'label: "X"'))],
    ["register drops Original load delivery label", withField("setl", (s) => s.replace(/label: "Original load delivery"/g, 'label: "X"'))],
    ["register drops pickup mmmDd render", withField("setl", (s) => s.replace(/mmmDd\(r\.origin_pickup_date\)/g, '"x"'))],
    ["register drops delivery mmmDd render", withField("setl", (s) => s.replace(/mmmDd\(r\.origin_delivery_date\)/g, '"x"'))],
  ];
  let caught = 0;
  for (const [label, mutated] of mutations) {
    if (analyze(mutated).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-resettlement-origin-load-dates --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(base);
if (failures.length) {
  console.error("FAIL verify-resettlement-origin-load-dates");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-resettlement-origin-load-dates");
