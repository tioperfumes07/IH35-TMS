#!/usr/bin/env node
/**
 * SETL-F439 — Settlement Creator stop addresses must use the SAME Google Places path as Book Load.
 *
 * Owner 2026-10-07: "the addresses are not wired from our google addresses etc like it is in load
 * wizard. i need that wired in the settlement creator" + every reported Creator defect in the same
 * session (UUID customer chrome, dates transfer, miles + pay/mi, discard Cancel, company→driver
 * load carry, invoice subtotals).
 *
 * RULES:
 *  1. Drawer imports AddressGeocodeInput (not a plain text city/state-only stop editor).
 *  2. Drawer imports StateSelect (no free-text "TEXAS" / hardcoded TX).
 *  3. buildStops passes address_line1 + postal_code + lat/lng from the draft (Book Load stop shape).
 *  4. Customer EntityPicker carries selectedOption so the label is the name, not a UUID.
 *  5. Cancel goes through attemptClose / onRegisterAttemptClose (dirty discard).
 *  6. getLaneMileage + getDriverPayCard + getChainDeadhead are wired (miles + $/mi like Book Load).
 *  7. Loads subtotal uses line_haul_amount_cents (invoice total), not the $/mi rate.
 *  8. Route schema accepts pickup_address / delivery_address (Zod otherwise strips them).
 */
import { readFileSync, existsSync } from "node:fs";

const NAME = "verify-settlement-creator-google-address-wiring";
const DRAWER = "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx";
const SEED = "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts";
const ROUTES = "apps/backend/src/driver-finance/settlement-creator.routes.ts";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

function run({ drawer, seed, routes }) {
  const out = [];
  if (drawer === null) return [`RULE 1: ${DRAWER} is missing.`];
  if (seed === null) return [`RULE 3: ${SEED} is missing.`];

  if (!/AddressGeocodeInput/.test(drawer)) {
    out.push("RULE 1: Settlement Creator does not import AddressGeocodeInput — stops are not on the Google Places path Book Load uses.");
  }
  if (!/StateSelect/.test(drawer)) {
    out.push("RULE 2: Settlement Creator does not import StateSelect — free-text state regresses to TEXAS/TX typos.");
  }
  if (!/applyGeocodeToLoad|onResolve=\{\(r\)/.test(drawer)) {
    out.push("RULE 1b: AddressGeocodeInput is imported but never resolves a pick into city/state/zip/lat.");
  }

  if (!/address_line1:\s*load\.(pickup|delivery)_address/.test(seed)) {
    out.push("RULE 3: buildStops never writes address_line1 from the Creator draft — Book Load stops stay address-blank.");
  }
  if (!/postal_code:\s*load\.(pickup|delivery)_zip/.test(seed)) {
    out.push("RULE 3b: buildStops never writes postal_code from the Creator draft.");
  }
  if (!/latitude:[\s\S]{0,120}pickup_lat/.test(seed) && !/pickup_lat/.test(seed)) {
    out.push("RULE 3c: buildStops never carries pickup_lat into the Book Load stop.");
  }

  if (!/selectedOption=\{[\s\S]{0,200}customer_id[\s\S]{0,120}customer_name/.test(drawer)) {
    out.push("RULE 4: Customer EntityPicker has no selectedOption — chrome falls back to a raw UUID.");
  }

  if (!/onRegisterAttemptClose/.test(drawer) || !/attemptClose/.test(drawer)) {
    out.push("RULE 5: Cancel / Escape does not use ParityDrawer attemptClose — dirty discard is bypassed.");
  }

  if (!/getLaneMileage/.test(drawer)) {
    out.push("RULE 6: getLaneMileage is not wired — loaded miles never autofill from lane history.");
  }
  if (!/getDriverPayCard/.test(drawer)) {
    out.push("RULE 6b: getDriverPayCard is not wired — Rate $/mi never fills from the driver card.");
  }
  if (!/getChainDeadhead/.test(drawer)) {
    out.push("RULE 6c: getChainDeadhead is not wired — empty miles never fill from this truck's last delivery.");
  }

  if (/line_haul_rate_cents \?\? 0\)\) \+ Math\.max\(0, Number\(l\.empty_rate_cents/.test(drawer)) {
    out.push("RULE 7: Loads subtotal still sums $/mi rates instead of line_haul_amount_cents (invoice total).");
  }
  if (!/line_haul_amount_cents/.test(drawer) || !/loadsSubtotal/.test(drawer)) {
    out.push("RULE 7b: Loads subtotal must key off line_haul_amount_cents so invoice totals match AlwaysTrack.");
  }

  if (routes !== null) {
    for (const field of ["pickup_address", "delivery_address", "pickup_zip", "delivery_zip"]) {
      if (!new RegExp(`${field}\\s*:\\s*z\\.`).test(routes)) {
        out.push(`RULE 8: route schema does not accept ${field} — Zod strips it before the seed path.`);
      }
    }
  }

  if (!/defaultLoadNumber/.test(drawer)) {
    out.push("RULE 9: company→driver load carry (defaultLoadNumber) is missing — new fuel/expense lines stay load-blank.");
  }

  return out;
}

if (process.argv.includes("--selftest")) {
  const goodDrawer = `
import { AddressGeocodeInput } from "...";
import { StateSelect } from "...";
import { getLaneMileage, getChainDeadhead, getDriverPayCard } from "...";
const defaultLoadNumber = loads[0]?.load_number;
selectedOption={load.customer_id && load.customer_name ? { value: load.customer_id, label: load.customer_name } : null}
onRegisterAttemptClose={registerAttemptClose}
attemptClose ? attemptClose() : onClose()
onResolve={(r) => applyGeocodeToLoad(load, "pickup", r)}
const loadsSubtotal = loads.reduce((s, l) => s + Number(l.line_haul_amount_cents ?? 0), 0);
getLaneMileage({...}); getDriverPayCard({...}); getChainDeadhead({...});
`;
  const goodSeed = `
function buildStops(load) {
  return [
    { address_line1: load.pickup_address?.trim() || undefined, postal_code: load.pickup_zip?.trim() || undefined, latitude: load.pickup_lat, city: pickupCity, state: pickupState },
    { address_line1: load.delivery_address?.trim() || undefined, postal_code: load.delivery_zip?.trim() || undefined, city: deliveryCity, state: deliveryState },
  ];
}
`;
  const goodRoutes = `pickup_address: z.string().trim().max(240).nullable().optional(),
delivery_address: z.string().trim().max(240).nullable().optional(),
pickup_zip: z.string().trim().max(20).nullable().optional(),
delivery_zip: z.string().trim().max(20).nullable().optional(),`;

  const badDrawer = `
const loadsSubtotal = loads.reduce((s, l) => s + Math.max(0, Number(l.line_haul_rate_cents ?? 0)) + Math.max(0, Number(l.empty_rate_cents ?? 0)), 0);
<input value={load.pickup_city} />
`;
  const badSeed = `function buildStops(load) { return [{ city: pickupCity, state: pickupState }]; }`;

  const cases = [
    ["fixed tree passes", { drawer: goodDrawer, seed: goodSeed, routes: goodRoutes }, 0],
    ["catches missing AddressGeocode + rates-as-subtotal + bare stops", { drawer: badDrawer, seed: badSeed, routes: goodRoutes }, 14],
    ["catches schema strip", { drawer: goodDrawer, seed: goodSeed, routes: "const schema = z.object({});" }, 4],
    ["missing drawer FAILS", { drawer: null, seed: goodSeed, routes: goodRoutes }, 1],
  ];

  let ok = 0;
  for (const [label, src, expected] of cases) {
    const got = run(src).length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected}, got ${got}\n  ${run(src).join("\n  ")}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const failures = run({ drawer: read(DRAWER), seed: read(SEED), routes: read(ROUTES) });
if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} rule(s) broken.`);
  process.exit(1);
}
console.log(
  `${NAME}: PASS — Settlement Creator stops use AddressGeocodeInput + StateSelect; buildStops carries ` +
    `address/zip/lat; customer selectedOption; discard Cancel; lane miles + pay card + deadhead; invoice subtotal.`,
);
