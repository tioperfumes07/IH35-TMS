import { describe, expect, it, vi } from "vitest";
import { commitFaroCsvImport, FaroCsvImportError, parseFaroCsv } from "./faro-csv-import.js";

const SAMPLE_CSV = `Invoice Number,Customer Name,Gross,Advance,Reserve,Fee,Chargeback,Net,Due Date
INV-2026-00001,Acme Freight,1000.00,950.00,50.00,25.00,0.00,925.00,2026-06-15
INV-2026-00002,Beta Logistics,500.00,475.00,25.00,12.50,0.00,462.50,2026-06-16`;

vi.mock("../data-infra/data-infra.service.js", () => ({
  upsertFaroDailyImport: vi.fn(async () => ({ id: "import-1" })),
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM mdata.vendors v")) return { rows: [{ id: "factor-1" }] };
      if (sql.includes("UPDATE accounting.invoices")) return { rows: [{ id: "inv-1" }] };
      if (sql.includes("INSERT INTO factoring.reserve_movement")) return { rows: [{ id: "mv-1" }] };
      return { rows: [] };
    });
    return fn({ query });
  }),
}));

describe("parseFaroCsv", () => {
  it("parses sample Faro CSV headers and rows", () => {
    const parsed = parseFaroCsv(SAMPLE_CSV);
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]?.invoice_number).toBe("INV-2026-00001");
    expect(parsed.lines[0]?.gross_amount_cents).toBe(100000);
    expect(parsed.lines[0]?.reserve_amount_cents).toBe(5000);
  });

  it("rejects CSV missing required headers", () => {
    expect(() => parseFaroCsv("Invoice Number,Gross\nINV-1,100")).toThrow(FaroCsvImportError);
  });

  it("rejects empty CSV", () => {
    expect(() => parseFaroCsv("Invoice Number\n")).toThrow(FaroCsvImportError);
  });
});

describe("commitFaroCsvImport", () => {
  it("commits import and applies invoice/reserve side effects", async () => {
    const result = await commitFaroCsvImport({
      userId: "user-1",
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      csvText: SAMPLE_CSV,
      statementDate: "2026-06-04",
    });
    expect(result.import_id).toBe("import-1");
    expect(result.line_count).toBe(2);
    expect(result.invoices_updated).toBeGreaterThan(0);
    expect(result.reserve_movements).toBeGreaterThan(0);
  });
});
