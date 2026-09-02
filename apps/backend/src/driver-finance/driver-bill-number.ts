/**
 * GO-27 Gate 0.3 (owner order, 2026-09-02): "driver-finance/driver-bill-number.ts must return
 * load number unchanged. Driver bill number EQUALS load number (GO-19 / display-id law)."
 * Was: strip an "L-" prefix and re-prefix with "B-" (Invariant #7's own shape). That B-prefix
 * form is now struck — the driver bill's number is the SAME string as the load's own number,
 * no transformation, so a driver looking at a bill and a dispatcher looking at a load see one
 * number, not two related-but-different ones.
 */
export function driverBillNumberFromLoadNumber(loadNumber: string): string {
  return loadNumber;
}
