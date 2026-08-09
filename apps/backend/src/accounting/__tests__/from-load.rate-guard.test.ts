import { describe, expect, it } from "vitest";
import { buildInvoiceFromLoad } from "../from-load.js";

const LOAD_ID = "11111111-1111-1111-1111-111111111111";
const OCI = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const USER = "22222222-2222-2222-2222-222222222222";

type Row = Record<string, unknown>;
function makeClient(handlers: { match: RegExp; rows: Row[] }[]) {
  const client = {
    async query<R = Row>(sql: string, _values?: unknown[]): Promise<{ rows: R[] }> {
      for (const h of handlers) if (h.match.test(sql)) return { rows: h.rows as R[] };
      return { rows: [] as R[] };
    },
  };
  return client;
}

describe("buildInvoiceFromLoad — $0 rate guard", () => {
  it("refuses to mint a from-load invoice when rate_total_cents is $0", async () => {
    const client = makeClient([
      { match: /SELECT i\.\* FROM accounting\.invoices/, rows: [] },
      {
        match: /SELECT[\s\S]*FROM mdata\.loads l[\s\S]*WHERE l\.id = \$1/,
        rows: [
          {
            id: LOAD_ID,
            customer_id: "c1",
            is_sample_data: false,
            rate_total_cents: 0,
            status: "booked",
          },
        ],
      },
    ]);

    await expect(
      buildInvoiceFromLoad(client, { userId: USER, operatingCompanyId: OCI, loadId: LOAD_ID })
    ).rejects.toMatchObject({ code: "load_has_no_rate", rate_total_cents: 0 });
  });

  it("refuses to mint a proforma when rate_total_cents is missing", async () => {
    const client = makeClient([
      { match: /SELECT i\.\* FROM accounting\.invoices/, rows: [] },
      {
        match: /SELECT[\s\S]*FROM mdata\.loads l[\s\S]*WHERE l\.id = \$1/,
        rows: [
          {
            id: LOAD_ID,
            customer_id: "c1",
            is_sample_data: false,
            rate_total_cents: null,
            status: "booked",
          },
        ],
      },
    ]);

    await expect(
      buildInvoiceFromLoad(client, { userId: USER, operatingCompanyId: OCI, loadId: LOAD_ID, asProforma: true })
    ).rejects.toMatchObject({ code: "load_has_no_rate" });
  });
});
