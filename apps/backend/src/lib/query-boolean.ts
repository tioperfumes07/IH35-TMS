import { z } from "zod";

/**
 * LEAD 443.217 — THE one boolean parser for query strings (and any loosely-typed input).
 *
 * z.coerce.boolean() is JavaScript Boolean(value): every non-empty string is TRUE, so the query "show_voided=false" turned
 * voided / cancelled loads ON (measured live: GET /api/v1/accounting/load-costs-board?show_voided=false returned the
 * cancelled loads 13635, 13634, 13593, 13556). 102 routes inverted every "...=false" the app sent.
 *
 * Accepts true / "true" / "1" / 1 → true; false / "false" / "0" / 0 / "" → false; absent (undefined / null) stays absent,
 * so .default(x) / .optional() keep working. Anything else ("yes", "abc") is a 400 — never guessed.
 */
export function parseQueryBoolean(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false" || v === "") return false;
  }
  return value; // z.boolean() rejects it: invalid boolean
}

export function queryBoolean() {
  return z.preprocess(parseQueryBoolean, z.boolean());
}
