#!/usr/bin/env node
/**
 * SETL-F439 / SETL-F440 — Settlement Creator stop addresses on the Book Load Google Places path,
 * with city/state split out of the pick, and loaded/empty miles from lane history + route engine.
 *
 * Owner 2026-10-07 (follow-up): "it all fills in the same box, the address does not fill the pickup
 * city and pick up state automatically" + "address is not mandatory, just city and state" +
 * "not getting the calculated loaded miles from google and from our own database, nor the empty miles".
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
 *  9. company→driver load carry (defaultLoadNumber).
 * 10. SETL-F440 — onChange after a Places pick uses functional setLoads so city/state are not wiped.
 * 11. SETL-F440 — getRouteMileage is the coords fallback for loaded miles (lane DB first).
 * 12. SETL-F440 — seed requires city+state; address_line1 stays optional (|| undefined).
 * 13. SETL-F441 — geocodeSearch + cityGeocodeQueries so hand-typed city/state still get coords → route miles.
 * 14. SETL-F441 — MoneyInput uses moneyInputClass (not bordered inputClass) so leading $ is QBO-correct.
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
  if (!/applyGeocodeToLoad/.test(drawer)) {
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

  // SETL-F440 — the onChange-after-onResolve race. Require functional setLoads in the address onChange.
  if (!/setLoads\(\(prev\)\s*=>/.test(drawer) || !/pickup_address:\s*v/.test(drawer)) {
    out.push(
      "RULE 10: Address onChange must use functional setLoads((prev)=>…) so a Places pick's city/state " +
        "are not wiped by onChange(formatted) after onResolve.",
    );
  }
  if (!/applyGeocodeToLoad\(cur,\s*[\"']pickup[\"']/.test(drawer) && !/applyGeocodeToLoad\(cur, \"pickup\"/.test(drawer)) {
    // allow either quote style
    if (!/applyGeocodeToLoad\(cur,\s*\"pickup\"/.test(drawer) && !/applyGeocodeToLoad\(cur,\s*'pickup'/.test(drawer)) {
      out.push("RULE 10b: onResolve must applyGeocodeToLoad(cur, …) from functional prev — not a stale load closure.");
    }
  }
  if (!/ignoreGeocodeFormattedRef/.test(drawer)) {
    out.push(
      "RULE 10c: must ignore AddressGeocodeInput's post-pick onChange(formatted) so the full place " +
        "string does not dump city+state back into the address box.",
    );
  }

  if (!/getRouteMileage/.test(drawer)) {
    out.push("RULE 11: getRouteMileage is not wired — loaded miles have no route-engine fallback when lane history is empty.");
  }
  if (!/useQueries/.test(drawer)) {
    out.push("RULE 11b: useQueries must fill miles per load row — a single primary-load query leaves later loads blank.");
  }

  if (!/stop_city_state_required/.test(seed)) {
    out.push("RULE 12: seed must refuse missing city/state by name (stop_city_state_required).");
  }
  if (!/address_line1:\s*load\.pickup_address\?\.trim\(\)\s*\|\|\s*undefined/.test(seed)) {
    out.push("RULE 12b: pickup address_line1 must stay optional (|| undefined) — hand seed requires city+state only.");
  }

  if (!/geocodeSearch/.test(drawer) || !/cityGeocodeQueries/.test(drawer)) {
    out.push(
      "RULE 13: hand-typed city/state must geocodeSearch → lat/lng (cityGeocodeQueries) so route-engine miles can fill without a Places pick.",
    );
  }
  if (!/moneyInputClass/.test(drawer) || /MoneyInput\s*\n\s*className=\{inputClass\}/.test(drawer)) {
    out.push(
      "RULE 14: MoneyInput must use moneyInputClass (w-full only) — forwarding inputClass border/px misplaces the leading $.",
    );
  }

  return out;
}

if (process.argv.includes("--selftest")) {
  const goodDrawer = `
import { AddressGeocodeInput } from "...";
import { StateSelect } from "...";
import { useQueries } from "@tanstack/react-query";
import { getLaneMileage, getChainDeadhead, getDriverPayCard, getRouteMileage } from "...";
import { geocodeSearch } from "...";
const defaultLoadNumber = loads[0]?.load_number;
const moneyInputClass = "w-full";
selectedOption={load.customer_id && load.customer_name ? { value: load.customer_id, label: load.customer_name } : null}
onRegisterAttemptClose={registerAttemptClose}
attemptClose ? attemptClose() : onClose()
onResolve={(r) => { setLoads((prev) => { const cur = prev[idx]; next[idx] = applyGeocodeToLoad(cur, "pickup", r); }); }}
onChange={(v) => { setLoads((prev) => { next[idx] = { ...cur, pickup_address: v }; }); }}
const ignoreGeocodeFormattedRef = useRef({});
const loadsSubtotal = loads.reduce((s, l) => s + Number(l.line_haul_amount_cents ?? 0), 0);
getLaneMileage({...}); getDriverPayCard({...}); getChainDeadhead({...}); getRouteMileage({...});
const cityGeocodeQueries = useQueries({ queries: loads.flatMap(...) });
useQueries({ queries: loads.map(...) });
<MoneyInput className={moneyInputClass} valueCents={...} />
`;
  const goodSeed = `
if (!pickupCity || !pickupState) throw new SettlementCreatorSeedError("stop_city_state_required", "...");
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
onChange={(v) => { const next = [...loads]; next[idx] = { ...load, pickup_address: v }; setLoads(next); }}
`;
  const badSeed = `function buildStops(load) { return [{ city: pickupCity, state: pickupState }]; }`;

  const cases = [
    ["fixed tree passes", { drawer: goodDrawer, seed: goodSeed, routes: goodRoutes }, 0],
    ["catches missing AddressGeocode + rates-as-subtotal + bare stops + stale onChange", { drawer: badDrawer, seed: badSeed, routes: goodRoutes }, 23],
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
  `${NAME}: PASS — Settlement Creator Places pick fills city/state (functional setLoads); ` +
    `lane + route-engine loaded miles; chain empty miles; address optional; city+state required.`,
);
