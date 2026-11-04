/**
 * Register row 163 — Fuel › History & savings / Compliance read "Not available" on every value with no reason.
 * Measured on prod 2026-11-03: views.fuel_savings_summary and views.fuel_compliance_summary are empty stubs
 * (`SELECT NULL ... WHERE false`), fuel.relay_matches does not exist, and fuel.loves_prices_daily holds 0 rows because the
 * Loves price import (cron/loves-card-import.cron.ts, daily 06:00 America/Chicago) only runs when LOVES_CARD_CSV_URL or
 * LOVES_CARD_CSV_PATH is set — Loves publishes no price API — and nobody has uploaded a price file. This names the gap
 * so the pages say "not synced since <date>" and why, instead of a bare "Not available".
 */
type Q = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export type FuelSourceGap = {
  /** null = the source is available and nothing needs explaining. */
  reason: string | null;
  loves_rows: number;
  loves_last_synced_at: string | null;
  feed_configured: boolean;
};

export function lovesFeedConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean((env.LOVES_CARD_CSV_URL ?? "").trim()) || Boolean((env.LOVES_CARD_CSV_PATH ?? "").trim());
}

const day = (iso: string) => iso.slice(0, 10);

export function fuelGapReason(input: {
  sourceMissing: boolean;
  lovesRows: number;
  lovesLastSyncedAt: string | null;
  feedConfigured: boolean;
}): string | null {
  const parts: string[] = [];
  if (input.lovesRows === 0 || !input.lovesLastSyncedAt) {
    parts.push(
      input.feedConfigured
        ? "Loves prices have never synced: the import feed is configured but has delivered no row yet."
        : "Loves prices have never synced: no price feed is configured (LOVES_CARD_CSV_URL / LOVES_CARD_CSV_PATH is not set) and no price file has been uploaded."
    );
  } else if (input.sourceMissing) {
    parts.push(`Loves prices last synced ${day(input.lovesLastSyncedAt)}.`);
  }
  if (input.sourceMissing) {
    parts.push("The planner has produced no recommendation to score yet, so there is nothing to compare purchases against.");
  }
  return parts.length ? parts.join(" ") : null;
}

export async function readFuelSourceGap(client: Q, companyId: string, sourceMissing: boolean): Promise<FuelSourceGap> {
  const exists = (await client.query(`SELECT to_regclass('fuel.loves_prices_daily') IS NOT NULL AS ok`)).rows[0]?.ok === true;
  let rows = 0;
  let last: string | null = null;
  if (exists) {
    const r = (
      await client.query(
        `SELECT count(*)::int AS n, max(updated_at)::text AS last FROM fuel.loves_prices_daily WHERE operating_company_id = $1::uuid`,
        [companyId]
      )
    ).rows[0];
    rows = Number(r?.n ?? 0);
    last = (r?.last as string | null) ?? null;
  }
  const feedConfigured = lovesFeedConfigured();
  return {
    reason: fuelGapReason({ sourceMissing, lovesRows: rows, lovesLastSyncedAt: last, feedConfigured }),
    loves_rows: rows,
    loves_last_synced_at: last,
    feed_configured: feedConfigured,
  };
}
