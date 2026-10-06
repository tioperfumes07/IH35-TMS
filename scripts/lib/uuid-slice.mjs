// The ONE definition of "UUID-slice chrome": an 8-character slice taken ON AN IDENTIFIER (id / uuid / *_id / *Id /
// *Uuid), which renders a raw UUID fragment where a human label belongs. A bare /\.slice\(0,\s*8\)/ also matched a
// date prefix (`today.slice(0, 8)` -> "YYYY-MM-") and a list preview (`rows.slice(0, 8)`), so label guards failed on
// correct code. Guards import this instead of re-typing the pattern.
export const UUID_SLICE_RE = /\b(?:id|uuid|[A-Za-z]+_id|[A-Za-z]+Id|[A-Za-z]+Uuid)\)?\s*(?:\?\.|\.)slice\(0,\s*8\)/;

/** Shapes every consumer's --selftest can assert: [code, isUuidSlice]. */
export const UUID_SLICE_CASES = [
  ["row.id.slice(0, 8)", true],
  ["String(r.vendor_id).slice(0,8)", true],
  ["tx.bankTransactionId?.slice(0, 8)", true],
  ["const from = `${today.slice(0, 8)}01`;", false],
  ["(query.data?.transactions ?? []).slice(0, 8).map((raw) => raw)", false],
];

/** Returns the cases the pattern gets wrong (empty = correct). */
export function uuidSliceCaseFailures(re = UUID_SLICE_RE) {
  return UUID_SLICE_CASES.filter(([code, isUuid]) => re.test(code) !== isUuid).map(([code]) => code);
}
