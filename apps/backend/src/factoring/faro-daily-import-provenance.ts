/**
 * ROUND29.7 (2026-09-22) — standing rule (owner): "Any faro_daily_imports row whose raw_payload
 * does not match FaroCsvLine shape is UNTRUSTED PROVENANCE." Live-diagnosed cause: the app's only
 * writer (upsertFaroDailyImportOnClient in data-infra.service.ts) always stores
 * raw_payload = {lines: input.lines} in FaroCsvLine shape — invoice_number/gross_amount_cents/
 * advance_amount_cents/reserve_amount_cents/fee_amount_cents/chargeback_amount_cents/
 * net_amount_cents, optional customer_name/load_id/due_on. A row found live in prod
 * (c1e27709-28f7-4886-860f-b9597ddad71a, before the 2026-09-22 correction) carried
 * {po, inv, date, debtor, escrow_reserve_cents} instead — proof it was written outside the app
 * (raw SQL / a direct console edit), since no code path in this repo ever produces that shape.
 *
 * This module is the one guard: a shape check called (1) defensively in the write path, so a
 * future refactor cannot silently start storing the wrong shape, and (2) — the part that actually
 * matters, since a write-time app check cannot stop a raw-SQL write that bypasses the app
 * entirely — in the READ path before a daily_import row is allowed to source a reconciliation
 * run. An untrusted row is flagged and refused, never silently trusted, never deleted.
 */

export type FaroDailyImportProvenanceResult =
  | { trusted: true }
  | { trusted: false; reason: string };

const REQUIRED_LINE_NUMERIC_FIELDS = [
  "gross_amount_cents",
  "advance_amount_cents",
  "reserve_amount_cents",
  "fee_amount_cents",
  "chargeback_amount_cents",
  "net_amount_cents",
] as const;

// Field names that only ever appear on the untrusted, non-app shape actually found live —
// {po, inv, date, debtor, escrow_reserve_cents}. Presence of ANY of these on a line is itself
// disqualifying, independent of whether the required fields are also (accidentally) present.
const UNTRUSTED_SHAPE_MARKERS = ["po", "inv", "date", "debtor", "escrow_reserve_cents"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates that a factor.faro_daily_imports row's raw_payload matches the shape
 * upsertFaroDailyImportOnClient always produces: {lines: FaroCsvLine[]}. Returns trusted:false
 * with a human-readable reason (never throws) so callers can decide how to react — refuse a
 * reconciliation run, surface a banner, etc. — rather than crashing on data that is genuinely
 * historical and must never be deleted.
 */
export function assertFaroDailyImportProvenance(rawPayload: unknown): FaroDailyImportProvenanceResult {
  if (!isPlainObject(rawPayload)) {
    return { trusted: false, reason: "raw_payload is not an object" };
  }
  const lines = rawPayload.lines;
  if (!Array.isArray(lines)) {
    return { trusted: false, reason: "raw_payload.lines is missing or not an array" };
  }
  if (lines.length === 0) {
    // An empty lines array is structurally valid (matches the shape); nothing to flag.
    return { trusted: true };
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isPlainObject(line)) {
      return { trusted: false, reason: `raw_payload.lines[${i}] is not an object` };
    }
    // Check the disqualifying markers FIRST — their presence is itself the most specific, most
    // diagnostic signal (the exact fingerprint of the one untrusted row found live), independent
    // of whether the required fields are also missing.
    for (const marker of UNTRUSTED_SHAPE_MARKERS) {
      if (marker in line) {
        return {
          trusted: false,
          reason: `raw_payload.lines[${i}] carries field "${marker}", which only ever appears on a non-app-written row — untrusted provenance`,
        };
      }
    }
    if (typeof line.invoice_number !== "string" || line.invoice_number.trim() === "") {
      return { trusted: false, reason: `raw_payload.lines[${i}] is missing a real invoice_number string` };
    }
    for (const field of REQUIRED_LINE_NUMERIC_FIELDS) {
      if (typeof line[field] !== "number") {
        return {
          trusted: false,
          reason: `raw_payload.lines[${i}] is missing required numeric field "${field}" (FaroCsvLine shape) — this row was not written by the app's own importer`,
        };
      }
    }
  }
  return { trusted: true };
}

export class FaroDailyImportUntrustedProvenanceError extends Error {
  constructor(readonly dailyImportId: string, readonly reason: string) {
    super(
      `factor.faro_daily_imports row ${dailyImportId} has untrusted provenance (${reason}) — refusing to source a reconciliation run from it. Flag it and investigate; never delete it.`
    );
  }
}
