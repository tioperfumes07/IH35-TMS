import { describe, expect, it, vi } from "vitest";
import { localPairingDiagnostics } from "../samsara-stats-probe.service.js";

describe("Samsara stats probe shared-driver scope", () => {
  it("counts and labels active authorized shared drivers", async () => {
    const sql: string[] = [];
    const query = vi.fn(async (text: string) => {
      sql.push(text);
      return { rows: text.includes("count(*) AS n") ? [{ n: 0 }] : [] };
    });

    await localPairingDiagnostics(query, "selected-company");
    const joined = sql.join("\n");
    for (const alias of ["stats_mapped_dca", "stats_total_dca", "stats_clock_dca"]) {
      expect(joined).toContain(`FROM mdata.driver_company_authorizations ${alias}`);
      expect(joined).toContain(`${alias}.operating_company_id = $1::uuid`);
      expect(joined).toContain(`${alias}.is_authorized = true`);
      expect(joined).toContain(`${alias}.deactivated_at IS NULL`);
    }
  });
});
