#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","customers"],"cols":["reverse_link"],"leafRe":"^(home\\.round_trips|detail\\.quality)$","task":"LINK-F5171-ROUNDTRIPS-QUALITY-LOAD-DRILL","vertical":"column-wave"} */
/**
 * LINK-F5171 — (1) home.round_trips header must EntityLink unit + driver (not plain text).
 * (2) customers.detail.quality events with related_load_id / related_invoice_id must EntityLink.
 *
 * Run: node scripts/verify-roundtrips-quality-load-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-roundtrips-quality-load-entitylink";
const ROUND = "apps/frontend/src/pages/dispatch/RoundTrips.tsx";
const TIMELINE = "apps/frontend/src/pages/dispatch/RoundTripsTimeline.tsx";
const LEGS = "apps/frontend/src/pages/dispatch/roundTripsLegs.ts";
const QUAL = "apps/frontend/src/pages/CustomerDetail.tsx";
const API = "apps/frontend/src/api/mdata.ts";
const ROUTE = "apps/backend/src/mdata/customer-quality-events.routes.ts";

function auditRound(src) {
  const failures = [];
  if (!/import\s*\{\s*EntityLinkOrTombstone\s*\}\s*from\s*["'][^"']*\/EntityLinkOrTombstone["']/.test(src)) {
    failures.push(`${ROUND}: must import canonical label-aware tombstones`);
  }
  if (!/data-testid=["']round-trip-unit-link["']/.test(src)) {
    failures.push(`${ROUND}: missing data-testid=round-trip-unit-link`);
  }
  if (!/data-testid=["']round-trip-driver-link["']/.test(src)) {
    failures.push(`${ROUND}: missing data-testid=round-trip-driver-link`);
  }
  if (!/kind=["']unit["']/.test(src) || !/kind=["']driver["']/.test(src)) {
    failures.push(`${ROUND}: header must EntityLink kind=unit and kind=driver`);
  }
  if (/\{pair\.unitNumber\}/.test(src) && !/round-trip-unit-link/.test(src)) {
    failures.push(`${ROUND}: unitNumber still plain text without EntityLink`);
  }
  const exact = [
    [/kind="customer"[\s\S]{0,120}id=\{load\.customer_id\}[\s\S]{0,120}name=\{load\.customer_name\}[\s\S]{0,80}noun="Customer"/, "trip customer"],
    [/kind="driver"[\s\S]{0,140}id=\{load\.assigned_primary_driver_id\}[\s\S]{0,140}name=\{load\.assigned_primary_driver_name\}[\s\S]{0,80}noun="Driver"/, "trip driver"],
    [/kind="unit"[\s\S]{0,100}id=\{pair\.unitId\}[\s\S]{0,100}name=\{pair\.unitNumber\}[\s\S]{0,80}noun="Unit"/, "pair unit"],
    [/kind="driver"[\s\S]{0,120}id=\{pair\.driverId \?\? undefined\}[\s\S]{0,100}name=\{pair\.driverName\}[\s\S]{0,80}noun="Driver"/, "pair driver"],
  ];
  for (const [pattern, label] of exact) if (!pattern.test(src)) failures.push(`${ROUND}: ${label} must couple canonical id to its human label`);
  if (/assigned_unit_number\s*\?\?\s*(?:sorted\[0\]\?\.assigned_unit_number\s*\?\?\s*)?unitId/.test(src)) {
    failures.push(`${ROUND}: unit display label must never fall back to unit UUID`);
  }
  if (/md:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_auto\]/.test(src)) {
    failures.push(`${ROUND}: hardcoded 3-column grid forbids TR between NB and SB`);
  }
  if (!/orderedLegsForUnit/.test(src) || !/data-rt-sequence/.test(src)) {
    failures.push(`${ROUND}: must order legs NB then TR then SB via orderedLegsForUnit + data-rt-sequence`);
  }
  if (!/RT_KANBAN_CARD_CLASS/.test(src)) {
    failures.push(`${ROUND}: trip cards must use Kanban card class constant`);
  }
  return failures;
}

function auditTimeline(src, legsSrc) {
  const failures = [];
  if (!/--dwl/.test(src) || !/round-trips-dwell/.test(src)) {
    failures.push(`${TIMELINE}: dwell segment must use --dwl (not --dw) and data-testid=round-trips-dwell`);
  }
  if (/\["--dw" as string\]/.test(src)) {
    failures.push(`${TIMELINE}: --dw is day-width; dwell must be --dwl`);
  }
  if (!/\[\.\.\.nb, \.\.\.tr, \.\.\.sb\]/.test(legsSrc)) {
    failures.push(`${LEGS}: orderedLegsForUnit must concatenate NB then TR then SB`);
  }
  if (!/rounded border border-gray-200 bg-white p-3/.test(legsSrc)) {
    failures.push(`${LEGS}: RT_KANBAN_CARD_CLASS must match Kanban card padding p-3`);
  }
  return failures;
}

function auditQuality(src, api, route) {
  const failures = [];
  if (!/data-testid=["']customer-quality-related-load-link["']/.test(src)) {
    failures.push(`${QUAL}: missing data-testid=customer-quality-related-load-link`);
  }
  if (!/related_load_id[\s\S]{0,200}kind=["']load["']/.test(src) && !/kind=["']load["'][\s\S]{0,120}related_load_id/.test(src)) {
    // Prefer explicit testid + load kind near related_load
    if (!/customer-quality-related-load-link/.test(src) || !/kind=["']load["']/.test(src)) {
      failures.push(`${QUAL}: quality events must EntityLink kind=load for related_load_id`);
    }
  }
  if (!/data-testid=["']customer-quality-related-invoice-link["']/.test(src)) {
    failures.push(`${QUAL}: missing data-testid=customer-quality-related-invoice-link`);
  }
  if (!/related_load_number:\s*string \| null/.test(api)) failures.push(`${API}: must type related_load_number`);
  if (!/related_invoice_display_id:\s*string \| null/.test(api)) failures.push(`${API}: must type related_invoice_display_id`);
  if (!/rl\.load_number AS related_load_number/.test(route)) failures.push(`${ROUTE}: must project related_load_number`);
  if (!/ri\.display_id AS related_invoice_display_id/.test(route)) failures.push(`${ROUTE}: must project related_invoice_display_id`);
  if (!/LEFT JOIN mdata\.loads rl[\s\S]{0,120}rl\.id = e\.related_load_id\s+AND rl\.operating_company_id = \$2::uuid/.test(route)) {
    failures.push(`${ROUTE}: load label join must enforce the caller company`);
  }
  if (!/LEFT JOIN mdata\.loads rl[\s\S]{0,180}rl\.customer_id = e\.customer_id/.test(route)) {
    failures.push(`${ROUTE}: load label join must enforce the event customer`);
  }
  if (!/LEFT JOIN accounting\.invoices ri[\s\S]{0,220}ri\.operating_company_id = \$2::uuid[\s\S]{0,100}ri\.customer_id = e\.customer_id/.test(route)) {
    failures.push(`${ROUTE}: invoice label join must enforce caller company and event customer`);
  }
  // The real row renders through <EntityLinkOrTombstone kind="load" name={event.related_load_number}
  // noun="Load"> / <EntityLinkOrTombstone kind="invoice" name={event.related_invoice_display_id}
  // noun="Invoice"> instead of a bare entityLabel(...) call — EntityLinkOrTombstone calls
  // entityLabel(name, id, noun) internally for its unresolved/tombstone branch (apps/frontend/src/
  // components/shared/EntityLinkOrTombstone.tsx), so it carries the SAME "must consume the real
  // label" guarantee, plus it additionally withholds the EntityLink drill when unresolved. Accept
  // either shape.
  const consumesLoadNumber =
    /entityLabel\(event\.related_load_number, event\.related_load_id, "Load"\)/.test(src) ||
    /<EntityLinkOrTombstone[\s\S]{0,40}?kind\s*=\s*["']load["'][\s\S]{0,200}?name=\{event\.related_load_number\}[\s\S]{0,200}?noun\s*=\s*["']Load["']/.test(
      src,
    );
  if (!consumesLoadNumber) {
    failures.push(`${QUAL}: related load link must consume related_load_number`);
  }
  const consumesInvoiceLabel =
    /entityLabel\(event\.related_invoice_display_id, event\.related_invoice_id, "Invoice"\)/.test(src) ||
    /<EntityLinkOrTombstone[\s\S]{0,40}?kind\s*=\s*["']invoice["'][\s\S]{0,200}?name=\{event\.related_invoice_display_id\}[\s\S]{0,200}?noun\s*=\s*["']Invoice["']/.test(
      src,
    );
  if (!consumesInvoiceLabel) {
    failures.push(`${QUAL}: related invoice link must consume related_invoice_display_id`);
  }
  if (!/FROM mdata\.loads l[\s\S]{0,180}l\.operating_company_id = \$2::uuid[\s\S]{0,100}l\.customer_id = \$3::uuid/.test(route) ||
      !/invalid_related_load_id/.test(route)) {
    failures.push(`${ROUTE}: create must reject a related load outside the caller company/customer`);
  }
  if (!/FROM accounting\.invoices i[\s\S]{0,180}i\.operating_company_id = \$2::uuid[\s\S]{0,100}i\.customer_id = \$3::uuid/.test(route) ||
      !/invalid_related_invoice_id/.test(route)) {
    failures.push(`${ROUTE}: create must reject a related invoice outside the caller company/customer`);
  }
  if (!/related_load_number:\s*relatedLoadNumber/.test(route) || !/related_invoice_display_id:\s*relatedInvoiceDisplayId/.test(route)) {
    failures.push(`${ROUTE}: create response must return the same resolved labels the list read returns`);
  }
  return failures;
}

function audit(roundSrc, qualSrc, apiSrc, routeSrc, timelineSrc, legsSrc) {
  return [...auditRound(roundSrc), ...auditQuality(qualSrc, apiSrc, routeSrc), ...auditTimeline(timelineSrc, legsSrc)];
}


if (process.argv.includes("--selftest")) {
  const round = fs.readFileSync(path.join(ROOT, ROUND), "utf8");
  const qual = fs.readFileSync(path.join(ROOT, QUAL), "utf8");
  const api = fs.readFileSync(path.join(ROOT, API), "utf8");
  const route = fs.readFileSync(path.join(ROOT, ROUTE), "utf8");
  const timeline = fs.readFileSync(path.join(ROOT, TIMELINE), "utf8");
  const legs = fs.readFileSync(path.join(ROOT, LEGS), "utf8");
  if (audit(round, qual, api, route, timeline, legs).length) {
    console.error(`${LABEL} SELFTEST FAIL — live files should pass`);
    process.exit(1);
  }
  const brokenRound = round.replace(/round-trip-unit-link/g, "x");
  const mutations = [
    [round.replaceAll("RT_KANBAN_CARD_CLASS", "X"), qual, api, route, timeline, legs],
    [round.replaceAll("orderedLegsForUnit", "xLegs"), qual, api, route, timeline, legs],
    [round, qual, api, route, timeline.replace(/--dwl/g, "--dw"), legs],
    [brokenRound, qual, api, route, timeline, legs],
    [round.replace("name={load.customer_name}", "name={load.customer_id}"), qual, api, route, timeline, legs],
    [round.replace("name={load.assigned_primary_driver_name}", "name={load.assigned_primary_driver_id}"), qual, api, route, timeline, legs],
    [round.replace("name={pair.unitNumber}", "name={pair.unitId}"), qual, api, route, timeline, legs],
    [round.replace("name={pair.driverName}", "name={pair.driverId}"), qual, api, route, timeline, legs],
    [round, qual.replace("event.related_load_number", "null"), api, route, timeline, legs],
    [round, qual, api.replace("related_load_number: string | null", "related_load_number?: string | null"), route, timeline, legs],
    [round, qual, api, route.replace("rl.load_number AS related_load_number", "NULL AS related_load_number"), timeline, legs],
    [round, qual, api, route.replace("AND rl.operating_company_id = $2::uuid", ""), timeline, legs],
    [round, qual.replace("event.related_invoice_display_id", "null"), api, route, timeline, legs],
    [round, qual, api.replace("related_invoice_display_id: string | null", "related_invoice_display_id?: string | null"), route, timeline, legs],
    [round, qual, api, route.replace("ri.display_id AS related_invoice_display_id", "NULL AS related_invoice_display_id"), timeline, legs],
    [round, qual, api, route.replace("AND ri.operating_company_id = $2::uuid", ""), timeline, legs],
    [round, qual, api, route.replace("AND ri.customer_id = e.customer_id", ""), timeline, legs],
    [round, qual, api, route.replace("AND rl.customer_id = e.customer_id", ""), timeline, legs],
    [round, qual, api, route.replace("AND l.customer_id = $3::uuid", ""), timeline, legs],
    [round, qual, api, route.replace("AND i.customer_id = $3::uuid", ""), timeline, legs],
    [round, qual, api, route.replace("invalid_related_invoice_id", "invalid_related_record_id"), timeline, legs],
    [round, qual, api, route.replace("related_invoice_display_id: relatedInvoiceDisplayId", "related_invoice_display_id: null"), timeline, legs],
  ];
  if (mutations.some((args) => !audit(...args).length)) {
    console.error(`${LABEL} SELFTEST FAIL — planted RoundTrips regression not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const failures = audit(
  fs.readFileSync(path.join(ROOT, ROUND), "utf8"),
  fs.readFileSync(path.join(ROOT, QUAL), "utf8"),
  fs.readFileSync(path.join(ROOT, API), "utf8"),
  fs.readFileSync(path.join(ROOT, ROUTE), "utf8"),
  fs.readFileSync(path.join(ROOT, TIMELINE), "utf8"),
  fs.readFileSync(path.join(ROOT, LEGS), "utf8"),
);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — round-trips NB-TR-SB + dwell --dwl + quality load identity`);
