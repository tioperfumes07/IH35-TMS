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
 *      / origin_delivery_date via formatDateUS (MM/DD/YYYY — D075 / owner 10-24).
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

  // 5. the register renders BOTH columns off the ORIGINAL load's dates, and each date drills to that load.
  // Lead 443.278 (1): the owner-approved board labels win — "PU date" / "DEL date" (0512ef14cd), with the
  // header tooltip naming the ORIGINAL load so they never read as the tour-level "Date started".
  // D075 (owner 10-24): origin dates = formatDateUS MM/DD/YYYY (not mmmDd OCT-21), EntityLink to origin load.
  if (!/setl-tour-col-origin-started/.test(setl)) errors.push('register must render the origin pickup column (testId setl-tour-col-origin-started)');
  if (!/setl-tour-col-origin-delivered/.test(setl)) errors.push('register must render the origin delivery column (testId setl-tour-col-origin-delivered)');
  if (!/key:\s*"origin_started",\s*label:\s*"PU date"[^\n]*headerTitle:\s*"Pickup date of the ORIGINAL load/.test(setl)) errors.push('origin pickup column must carry the board label "PU date" with the ORIGINAL-load header title');
  if (!/key:\s*"origin_delivered",\s*label:\s*"DEL date"[^\n]*headerTitle:\s*"Delivery date of the ORIGINAL load/.test(setl)) errors.push('origin delivery column must carry the board label "DEL date" with the ORIGINAL-load header title');
  if (!/render:\s*r\s*=>\s*<OriginDateCell row=\{r\} date=\{r\.origin_pickup_date\} \/>/.test(setl)) errors.push("origin pickup cell must render OriginDateCell(origin_pickup_date)");
  if (!/render:\s*r\s*=>\s*<OriginDateCell row=\{r\} date=\{r\.origin_delivery_date\} \/>/.test(setl)) errors.push("origin delivery cell must render OriginDateCell(origin_delivery_date)");
  const cell = setl.slice(setl.indexOf("function OriginDateCell("), setl.indexOf("function SettlementCell("));
  if (!/l\.load_number === row\.origin_load_number\)\?\.load_id/.test(cell)) errors.push("OriginDateCell must resolve the ORIGINAL load id from the leg whose load_number is the origin");
  if (!/formatDateUS/.test(setl) || !/from ["'][^"']*lib\/formatDate["']/.test(setl)) {
    errors.push("SettlementsToursRegister D075 must import formatDateUS from lib/formatDate");
  }
  if (/\bmmmDd\s*\(\s*date\s*\)/.test(cell)) {
    errors.push("OriginDateCell D075 must not use mmmDd (use formatDateUS MM/DD/YYYY)");
  }
  if (!/<EntityLink\s+kind="load"\s+id=\{originId\}\s+label=\{formatDateUS\(date\)\}/.test(cell)) {
    errors.push("OriginDateCell must drill to the ORIGINAL load (EntityLink kind=load, label formatDateUS(date))");
  }
  if (!/\{formatDateUS\(date\)\}/.test(cell)) {
    errors.push("OriginDateCell fallback (no origin load id) must also render formatDateUS(date)");
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
    ["register drops PU date board label", withField("setl", (s) => s.replace(/label: "PU date"/g, 'label: "X"'))],
    ["register drops DEL date board label", withField("setl", (s) => s.replace(/label: "DEL date"/g, 'label: "X"'))],
    ["header title stops naming the ORIGINAL load", withField("setl", (s) => s.replace(/Pickup date of the ORIGINAL load/g, "Pickup date"))],
    ["pickup cell stops rendering the origin date", withField("setl", (s) => s.replace(/date=\{r\.origin_pickup_date\}/g, "date={r.trip_started_at}"))],
    ["delivery cell stops rendering the origin date", withField("setl", (s) => s.replace(/date=\{r\.origin_delivery_date\}/g, "date={r.trip_closed_at}"))],
    ["origin date no longer drills to the origin load", withField("setl", (s) => s.replace(/<EntityLink\s+kind="load"\s+id=\{originId\}/g, '<span data-kind="load" data-id={originId}'))],
    ["origin id resolved from the wrong leg", withField("setl", (s) => s.replace(/l\.load_number === row\.origin_load_number\)\?\.load_id/g, "true)?.load_id"))],
    ["register drops formatDateUS date label", withField("setl", (s) => s.replace(/label=\{formatDateUS\(date\)\}/g, "label={date}"))],
    ["register reverts to mmmDd OCT chrome", withField("setl", (s) => s.replace(/formatDateUS\(date\)/g, "mmmDd(date)"))],
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
