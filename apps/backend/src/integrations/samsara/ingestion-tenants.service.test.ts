import { describe, expect, it } from "vitest";
import {
  listSamsaraIngestionTenantIds,
  TRANSPORTATION_OPERATING_COMPANY_ID,
  USMCA_OPERATING_COMPANY_ID,
} from "./ingestion-tenants.service.js";

describe("listSamsaraIngestionTenantIds", () => {
  it("selects enabled connected configurations and suppresses Transportation when USMCA owns ingestion", async () => {
    let sql = "";
    let values: unknown[] = [];
    const client = {
      query: async <T>(_sql: string, _values?: unknown[]) => {
        sql = _sql;
        values = _values ?? [];
        return { rows: [{ operating_company_id: USMCA_OPERATING_COMPANY_ID }] as T[] };
      },
    };

    await expect(listSamsaraIngestionTenantIds(client)).resolves.toEqual([USMCA_OPERATING_COMPANY_ID]);
    expect(sql).toContain("JOIN integrations.samsara_config cfg");
    expect(sql).toContain("cfg.is_enabled = true");
    expect(sql).toContain("cfg.disconnected_at IS NULL");
    expect(sql).toContain("c.id <> $1::uuid");
    expect(sql).toContain("usmca_cfg.operating_company_id = $2::uuid");
    expect(values).toEqual([TRANSPORTATION_OPERATING_COMPANY_ID, USMCA_OPERATING_COMPANY_ID]);
  });
});
