/**
 * Lumper Lifecycle STEP 6 — the lumper money model as pure functions (the maker≠checker contract).
 *
 * SUPERSEDES the W6 2-value reimbursable logic (book-load-lumper.ts). Three Jorge-confirmed scenarios,
 * each mapping to the persisted (mdata.load_stops.lumper_paid_by, lumper_billable) pair:
 *
 *   broker_direct   Broker pays the lumper directly / Comcheck — broker's money. paid_by='broker'.
 *                   Customer invoice $0, carrier cost $0, driver $0, net to carrier $0. Record-only.  (DEFAULT)
 *   carrier_bill    We pay the lumper and bill the customer.  paid_by='carrier', billable=true.
 *                   Itemized customer: invoice +$amt, cost +$amt, net ~$0 (recovered).
 *                   Flat-rate customer/stop: invoice $0 (suppressed), cost +$amt (covered by the flat rate).
 *   carrier_absorb  We pay, do NOT bill (de-emphasized — not a default). paid_by='carrier', billable=false.
 *                   Customer invoice $0, carrier cost +$amt, net -$amt.
 *
 * Pure + unit-tested so the invoice/cost/net can't silently drift. No posting here (that's the STEP 4
 * backend, behind LUMPER_LIFECYCLE_ENABLED). Driver settlement effect on the lumper itself is always $0 —
 * the $250 advance-against-bill is a separate split line (STEP 3).
 */

export type LumperPaidByEnum = "carrier" | "shipper" | "broker" | "receiver" | "unknown";

export type LumperScenario = "broker_direct" | "carrier_bill" | "carrier_absorb";

export const LUMPER_SCENARIOS: ReadonlyArray<{ value: LumperScenario; label: string; deemphasized?: boolean }> = [
  { value: "broker_direct", label: "Broker / Comcheck (broker pays)" },
  { value: "carrier_bill", label: "We pay — bill customer" },
  { value: "carrier_absorb", label: "We pay — absorb (no bill)", deemphasized: true },
];

export const DEFAULT_LUMPER_SCENARIO: LumperScenario = "broker_direct";

export type CustomerLumperBillingMode = "itemized" | "flat_rate_includes";

/** Map a UI scenario choice to the persisted per-stop fields (load_stops.lumper_paid_by, lumper_billable). */
export function scenarioToStopFields(scenario: LumperScenario): {
  lumper_paid_by: LumperPaidByEnum;
  lumper_billable: boolean;
} {
  switch (scenario) {
    case "broker_direct":
      return { lumper_paid_by: "broker", lumper_billable: false };
    case "carrier_bill":
      return { lumper_paid_by: "carrier", lumper_billable: true };
    case "carrier_absorb":
      return { lumper_paid_by: "carrier", lumper_billable: false };
  }
}

/** Reverse: derive the scenario from the persisted fields (for edit/display). */
export function stopFieldsToScenario(paidBy: LumperPaidByEnum | null | undefined, billable: boolean | null | undefined): LumperScenario {
  if (paidBy === "carrier") return billable === true ? "carrier_bill" : "carrier_absorb";
  // broker (and any non-carrier / unknown) → broker-direct: not the carrier's money.
  return "broker_direct";
}

/**
 * Reefer trigger: when the load is temperature-controlled, a lumper Y/N decision is REQUIRED before dispatch
 * (selectable earlier; not required to reserve/skeleton-book). True = reefer → must answer lumper required?.
 */
export function reeferRequiresLumperDecision(input: {
  temperature_type?: "" | "frozen" | "fresh" | null;
  requires_reefer_fuel?: boolean | null;
  reefer_temp_f?: number | "" | null;
}): boolean {
  if (input.temperature_type === "frozen" || input.temperature_type === "fresh") return true;
  if (input.requires_reefer_fuel === true) return true;
  if (typeof input.reefer_temp_f === "number" && Number.isFinite(input.reefer_temp_f) && input.reefer_temp_f !== 0) return true;
  return false;
}

/**
 * Default for "charge the customer?" when we pay a lumper, from the customer's billing mode. The dispatcher
 * may override per load/stop (load_stops.lumper_billable). itemized → bill (true); flat_rate_includes → the
 * flat rate already covers it, so do NOT separately bill (false).
 */
export function chargeCustomerDefault(mode: CustomerLumperBillingMode | null | undefined): boolean {
  return mode !== "flat_rate_includes";
}

export type LumperMoneyEffect = {
  customer_invoice_cents: number; // delta added to the customer invoice for this lumper
  carrier_cost_cents: number; // lumper expense booked as carrier cost
  driver_settlement_cents: number; // effect on the driver settlement (always 0 for the lumper itself)
  net_to_carrier_cents: number; // invoice recovered minus cost
};

/**
 * The lumper's money effect for one stop. `customerFlatRate` = the effective flat-rate suppression for this
 * line (customer mode flat_rate_includes, OR a per-stop lumper_billable=false override on a we-pay-bill).
 * Negative amounts are clamped to 0 (never a negative charge).
 */
export function lumperMoneyEffect(scenario: LumperScenario, amountCents: number, customerFlatRate: boolean): LumperMoneyEffect {
  const amt = Math.max(0, Math.trunc(Number(amountCents) || 0));
  const zero: LumperMoneyEffect = { customer_invoice_cents: 0, carrier_cost_cents: 0, driver_settlement_cents: 0, net_to_carrier_cents: 0 };
  switch (scenario) {
    case "broker_direct":
      return { ...zero }; // broker's money — record-only
    case "carrier_bill":
      if (customerFlatRate) {
        // flat-rate customer/stop: cost booked, NOT separately billed (covered by the flat rate).
        return { customer_invoice_cents: 0, carrier_cost_cents: amt, driver_settlement_cents: 0, net_to_carrier_cents: -amt };
      }
      // itemized: billed back, recovered ~$0 net.
      return { customer_invoice_cents: amt, carrier_cost_cents: amt, driver_settlement_cents: 0, net_to_carrier_cents: 0 };
    case "carrier_absorb":
      return { customer_invoice_cents: 0, carrier_cost_cents: amt, driver_settlement_cents: 0, net_to_carrier_cents: -amt };
  }
}
