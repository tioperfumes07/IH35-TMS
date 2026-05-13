/** Invariant #7: canonical driver bill number shares the load suffix (L-xxx → B-xxx). */
export function driverBillNumberFromLoadNumber(loadNumber: string): string {
  const suffix = loadNumber.replace(/^[Ll]-/, "");
  return `B-${suffix}`;
}
