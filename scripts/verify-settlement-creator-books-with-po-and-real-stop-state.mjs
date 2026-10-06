#!/usr/bin/env node
/**
 * SETL-F438 — THE SETTLEMENT CREATOR MUST BOOK A LOAD THE WAY bookLoad ACTUALLY DEMANDS,
 * AND A STOP MUST CARRY THE STATE THE TRUCK WENT TO.
 *
 * TWO defects, one engine, both measured on main 2026-10-06:
 *
 * 1. bookLoad() refuses any non-draft load carrying neither a PO nor a W/O —
 *    book-load.service.ts:1482-1487, error `customer_po_or_wo_number_required`, added by
 *    ROUND 285.3.6 (owner order 2026-09-30: "W/O or PO REQUIRED at load creation. Not optional,
 *    not a warning. The whole Faro join depends on customer_po_number existing.").
 *    settlement-creator-seed-loads.ts books with `save_mode: "book_dispatch"` — NOT draft — and
 *    passed NEITHER field: zero occurrences of customer_po_number or customer_wo_number in the
 *    whole seed path. So the FIRST load of every seed attempt returned 400 and the Creator could
 *    not create a single load. The owner read it as "the Creator is junk"; it was a hard refusal.
 *
 * 2. buildStops() wrote `state: "TX"` as a CONSTANT on BOTH stops and defaulted the delivery city
 *    to the literal "Pending". A Laredo carrier does not deliver only inside Texas, so every
 *    Creator-seeded load landed in mdata.load_stops as TX -> TX regardless of where it ran — and
 *    that constant is read downstream by IFTA, lane profitability and the invoice ship-to.
 *    A wrong value written confidently is worse than a missing one.
 *
 * Nothing here is cosmetic and nothing defaults: the state is required input, and a load whose
 * origin or destination was not entered is refused by name.
 *
 *   RULE 1 — the seed path must pass customer_po_number into BookLoadInput.
 *   RULE 2 — it must refuse, by name, when neither PO nor W/O is present, rather than let the
 *            operator read an opaque book_load_failed payload.
 *   RULE 3 — no stop may be built with a hardcoded state literal. This is the defect itself.
 *   RULE 4 — no stop may fall back to a placeholder city ("Pending", or a default "Laredo").
 *   RULE 5 — the route schema must accept customer_po_number, pickup_state and delivery_state,
 *            or the UI can send them and the API will strip them silently.
 *
 * --selftest proves every rule can FAIL, and cases 3/4 reproduce the exact shipped code.
 * A proof command that cannot fail is worse than no proof.
 */
import { readFileSync, existsSync } from "node:fs";

const NAME = "verify-settlement-creator-books-with-po-and-real-stop-state";
const SEED = "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts";
const ROUTES = "apps/backend/src/driver-finance/settlement-creator.routes.ts";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

/** The body of buildStops, from its signature to its closing brace at column 0. */
function buildStopsFn(src) {
  const i = src.indexOf("function buildStops(");
  if (i < 0) return "";
  const end = src.indexOf("\n}", i);
  return src.slice(i, end < 0 ? src.length : end + 2);
}

function run({ seed, routes }) {
  const out = [];
  if (seed === null) return [`RULE 1: ${SEED} is missing — a guard that cannot read its input is a FAIL.`];

  if (!/customer_po_number\s*:/.test(seed)) {
    out.push(
      "RULE 1: the seed path never passes customer_po_number into BookLoadInput. bookLoad refuses " +
        "every non-draft load without a PO or W/O (customer_po_or_wo_number_required), so the " +
        "Settlement Creator cannot create a single load."
    );
  }
  if (!/customer_po_or_wo_number_required/.test(seed)) {
    out.push(
      "RULE 2: the seed path does not refuse by name when neither PO nor W/O is present — the " +
        "operator gets an opaque book_load_failed payload instead of the field they must fill."
    );
  }

  const stops = buildStopsFn(seed);
  if (!stops) {
    out.push("RULE 3: buildStops is gone — the stop city/state rule has no single source.");
  } else {
    const hardState = /state\s*:\s*["'`][A-Za-z]{2,6}["'`]/.exec(stops);
    if (hardState) {
      out.push(
        `RULE 3: buildStops writes a HARDCODED state (${hardState[0]}). Every Creator-seeded load ` +
          `then carries that state whatever the truck did, and IFTA, lane profitability and the ` +
          `invoice ship-to all read it. Take the state as input; never default it.`
      );
    }
    const placeholder = /city\s*:[^,\n]*\|\|\s*["'`](Pending|Laredo)["'`]/.exec(stops);
    if (placeholder) {
      out.push(
        `RULE 4: buildStops falls back to a placeholder city (${placeholder[0].trim()}). A stop the ` +
          `operator did not enter is refused, not invented.`
      );
    }
  }

  if (routes !== null) {
    for (const field of ["customer_po_number", "pickup_state", "delivery_state"]) {
      if (!new RegExp(`${field}\\s*:\\s*z\\.`).test(routes)) {
        out.push(
          `RULE 5: the route schema does not accept ${field}. Zod strips what it does not declare, ` +
            `so the field would leave the browser and never reach the engine.`
        );
      }
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const goodStops = `function buildStops(load) {
  const pickupCity = load.pickup_city?.trim();
  const pickupState = load.pickup_state?.trim().toUpperCase();
  if (!pickupCity || !pickupState) {
    throw new SettlementCreatorSeedError("stop_city_state_required", "x");
  }
  return [
    { sequence_number: 1, stop_type: "pickup", city: pickupCity, state: pickupState },
    { sequence_number: 2, stop_type: "delivery", city: deliveryCity, state: deliveryState },
  ];
}`;
  const goodSeed = `${goodStops}
export async function ensureDispatchedLoadsForCreator(client, actor, draft) {
  const poNumber = load.customer_po_number?.trim() || null;
  const woNumber = load.customer_wo_number?.trim() || null;
  if (!poNumber && !woNumber) {
    throw new SettlementCreatorSeedError("customer_po_or_wo_number_required", "x");
  }
  const input = {
    customer_po_number: poNumber ?? undefined,
    customer_wo_number: woNumber ?? undefined,
    save_mode: "book_dispatch",
    stops: buildStops(load),
  };
}`;
  const goodRoutes = `const schema = z.object({
  customer_po_number: z.string().trim().max(80).nullable().optional(),
  pickup_city: z.string().trim().max(120).nullable().optional(),
  pickup_state: z.string().trim().min(2).max(6).nullable().optional(),
  delivery_state: z.string().trim().min(2).max(6).nullable().optional(),
});`;

  // The EXACT shipped defect, both halves.
  const shippedStops = `function buildStops(load) {
  return [
    { sequence_number: 1, stop_type: "pickup", city: load.pickup_city?.trim() || "Laredo", state: "TX" },
    { sequence_number: 2, stop_type: "delivery", city: load.delivery_city?.trim() || "Pending", state: "TX" },
  ];
}`;
  const shippedSeed = `${shippedStops}
export async function ensureDispatchedLoadsForCreator(client, actor, draft) {
  const input = { save_mode: "book_dispatch", stops: buildStops(load) };
}`;

  const cases = [
    ["a fixed tree passes", { seed: goodSeed, routes: goodRoutes }, 0],
    [
      "catches the SHIPPED defect — no PO, no refusal, hardcoded TX, Laredo+Pending placeholders",
      { seed: shippedSeed, routes: goodRoutes },
      4,
    ],
    [
      "rule 1 catches the PO being dropped from BookLoadInput",
      { seed: goodSeed.replace("    customer_po_number: poNumber ?? undefined,\n", "").replace("  const poNumber = load.customer_po_number?.trim() || null;\n", ""), routes: goodRoutes },
      1,
    ],
    [
      "rule 2 catches the named refusal being removed",
      { seed: goodSeed.replace('"customer_po_or_wo_number_required"', '"book_load_failed"'), routes: goodRoutes },
      1,
    ],
    [
      "rule 3 catches a hardcoded state creeping back in, in any spelling",
      { seed: goodSeed.replace("state: pickupState }", 'state: "NL" }'), routes: goodRoutes },
      1,
    ],
    [
      "rule 4 catches a placeholder city fallback creeping back in",
      { seed: goodSeed.replace("city: pickupCity,", 'city: load.pickup_city?.trim() || "Laredo",'), routes: goodRoutes },
      1,
    ],
    [
      "rule 5 catches the schema not accepting the new fields",
      { seed: goodSeed, routes: goodRoutes.replace("  pickup_state: z.string().trim().min(2).max(6).nullable().optional(),\n", "") },
      1,
    ],
    [
      "rule 5 catches all three fields missing at once",
      { seed: goodSeed, routes: "const schema = z.object({ load_number: z.string() });" },
      3,
    ],
    ["a missing source file FAILS rather than passing silently", { seed: null, routes: goodRoutes }, 1],
  ];

  let ok = 0;
  for (const [label, src, expected] of cases) {
    const got = run(src).length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected}, got ${got}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const failures = run({ seed: read(SEED), routes: read(ROUTES) });
if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} rule(s) broken.`);
  process.exit(1);
}
console.log(
  `${NAME}: PASS — the Creator books with a PO (or W/O) as bookLoad demands, refuses by name when ` +
    `it has neither, and every stop carries a real operator-entered city and state with no default.`
);
