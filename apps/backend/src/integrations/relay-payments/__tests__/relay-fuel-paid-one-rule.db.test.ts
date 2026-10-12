/**
 * LEAD 443.123 — real Postgres: THE one paid rule. A legacy CSV Relay row stored Relay's CSV total (fuel + fee) as
 * total_amount_paid_cents with the fee only in top-level fees[]; RELAY-F442 says paid is fuel only. The SQL twin the
 * Match drawer reads (RELAY_FUEL_WALLET_AMOUNT_SQL) and the TS rule (relayFuelPaidCents) must give the SAME wallet
 * drawdown on real rows: a legacy row draws its stored paid (917.64), never paid + fee again (919.64); a modern row
 * draws paid + fee; a row off by anything other than the recorded fee is not reinterpreted.
 * On the old code the legacy row's drawdown is 91964 — this test fails there.
 *
 * Relay rows are WORM (delete refused), so they live in one ROLLED-BACK transaction under an isolated company.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany } from "../../../../test-helpers/db-fixture.js";
import { RELAY_FUEL_WALLET_AMOUNT_SQL } from "../../../accounting/bank-recon/relay-bank-match.service.js";
import { relayFuelPaidCents } from "../relay-sender-fee-cents.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Relay one paid rule (443.123, real Postgres)", () => {
  it("legacy CSV paid-includes-fee draws its stored paid; modern draws paid + fee; a non-fee difference is not reinterpreted", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "RPR", legalNamePrefix: "443.123 relay paid rule" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `RPR${Date.now().toString(36).toUpperCase()}`;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const fill = async (name: string, paid: number, source: string, fees: unknown[], lines: Array<{ cents: number; fee?: number }>) => {
        const id = (await db.query<{ id: string }>(
          `INSERT INTO integrations.relay_fuel_transactions
             (operating_company_id, transaction_id, relay_created_at, total_amount_paid_cents, total_retail_price_cents, fees, raw_payload, ingest_source)
           VALUES ($1, $2, now(), $3, $3, $4::jsonb, '{}'::jsonb, $5) RETURNING id::text AS id`,
          [opco, `${tag}-${name}`, paid, JSON.stringify(fees), source])).rows[0]!.id;
        for (const [i, l] of lines.entries()) {
          await db.query(
            `INSERT INTO integrations.relay_fuel_transaction_lines
               (operating_company_id, relay_fuel_transaction_id, line_index, fuel_type, total_discounted_price_cents, fee_amount_cents)
             VALUES ($1, $2, $3, 'diesel', $4, $5)`,
            [opco, id, i, l.cents, l.fee ?? null]);
        }
        return id;
      };
      const relayFee = [{ type: "relay_fee", amount: "2.00" }];
      const legacy = await fill("legacy", 91764, "csv_import", relayFee, [{ cents: 2082 }, { cents: 89482 }]);
      const modern = await fill("modern", 91564, "daily_pull", [{ type: "sender_fee", amount: "2.00" }], [{ cents: 2082, fee: 200 }, { cents: 89482 }]);
      const offByOther = await fill("other", 91701, "csv_import", relayFee, [{ cents: 2082 }, { cents: 89482 }]);
      const sqlWallet = async (id: string) =>
        Number((await db.query<{ amount_cents: string }>(
          `SELECT ${RELAY_FUEL_WALLET_AMOUNT_SQL}::text AS amount_cents FROM integrations.relay_fuel_transactions r WHERE r.id = $1::uuid`,
          [id])).rows[0]!.amount_cents);

      expect(await sqlWallet(legacy)).toBe(91764); // old code: 91964
      expect(await sqlWallet(modern)).toBe(91764);
      expect(await sqlWallet(offByOther)).toBe(91901); // stored paid + fee: not reinterpreted (the poster refuses it)

      // The TS rule gives the same answers on the same shapes (one definition, two forms).
      expect(relayFuelPaidCents({ transaction_id: "l", stored_paid_cents: 91764, product_lines_cents: 91564, fees: relayFee, line_fee_amount_cents: [null, null], ingest_source: "csv_import" }))
        .toEqual({ fuel_paid_cents: 91564, fee_cents: 200, wallet_cents: 91764, legacy_paid_includes_fee: true });
      expect(relayFuelPaidCents({ transaction_id: "m", stored_paid_cents: 91564, product_lines_cents: 91564, fees: [{ type: "sender_fee", amount: "2.00" }], line_fee_amount_cents: [200, null], ingest_source: "daily_pull" }).wallet_cents)
        .toBe(91764);
      expect(relayFuelPaidCents({ transaction_id: "o", stored_paid_cents: 91701, product_lines_cents: 91564, fees: relayFee, line_fee_amount_cents: [], ingest_source: "csv_import" }))
        .toMatchObject({ fuel_paid_cents: 91701, legacy_paid_includes_fee: false });
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  }, 60_000);
});
