/**
 * 443.101 — real Postgres: an office-typed load number seeds the company's LOAD counter when it has none, ADVANCES it
 * when the typed number is higher, and never rewinds it for a lower typed number. Before, the seed was
 * ON CONFLICT DO NOTHING, so every higher typed number left the counter behind the true working max
 * (verify-load-counter-not-ahead-of-reality; LIVE on USMCA 2026-10-12: counter 13618 vs working max 13660).
 * Runs on its own isolated company inside one rolled-back transaction — nothing is left behind.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany } from "../../../test-helpers/isolated-company.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { seedLoadNumberCounterFromManualEntry } from "../load-id-reservation.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("LOAD counter follows office-typed numbers (real Postgres)", () => {
  it("seeds, advances on a higher typed number, never rewinds on a lower one", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId } = await createIsolatedOperatingCompany({ codePrefix: "LCT", legalNamePrefix: "Load counter typed advance" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const counter = async () =>
      (
        await db.query<{ n: string | null }>(
          `SELECT last_trace_no::text AS n FROM lib.trace_counters WHERE operating_company_id = $1::uuid AND doc_type = 'LOAD'`,
          [companyId]
        )
      ).rows[0]?.n ?? null;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
      expect(await counter()).toBeNull();
      await seedLoadNumberCounterFromManualEntry(db as never, companyId, "13618");
      expect(await counter()).toBe("13618");
      await seedLoadNumberCounterFromManualEntry(db as never, companyId, "13660");
      expect(await counter()).toBe("13660");
      await seedLoadNumberCounterFromManualEntry(db as never, companyId, "13640");
      expect(await counter()).toBe("13660");
      await seedLoadNumberCounterFromManualEntry(db as never, companyId, "A-13700");
      expect(await counter()).toBe("13660");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
