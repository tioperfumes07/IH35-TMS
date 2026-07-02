import { describe, expect, it, vi } from "vitest";
import { commitFaroCsvImport, FaroCsvImportError, parseFaroCsv, parseMoneyToCents } from "./faro-csv-import.js";

const SAMPLE_CSV = `Invoice Number,Customer Name,Gross,Advance,Reserve,Fee,Chargeback,Net,Due Date
INV-2026-00001,Acme Freight,1000.00,950.00,50.00,25.00,0.00,925.00,2026-06-15
INV-2026-00002,Beta Logistics,500.00,475.00,25.00,12.50,0.00,462.50,2026-06-16`;

vi.mock("../data-infra/data-infra.service.js", () => ({
  upsertFaroDailyImport: vi.fn(async () => ({ id: "import-1" })),
}));

// Feature flag ON so the funding/chargeback post triggers are exercised (the DATA aggregation runs either way).
vi.mock("../lib/feature-flags/service.js", () => ({
  isEnabled: vi.fn(async () => true),
}));

// Capture posts instead of hitting the DB double-entry engine. `vi.hoisted` keeps the spies accessible to
// the (hoisted) vi.mock factory without tripping vitest's out-of-scope-variable guard.
const { postFundingMock, postChargebackMock } = vi.hoisted(() => ({
  postFundingMock: vi.fn(async () => ({ posted: true, journal_entry_id: "je-fund" })),
  postChargebackMock: vi.fn(async () => ({ posted: true, journal_entry_id: "je-cb" })),
}));
vi.mock("../accounting/factoring-posting/poster.service.js", () => ({
  FACTORING_GL_POSTING_FLAG: "FACTORING_GL_POSTING_ENABLED",
  postFactoringAdvanceEvent: postFundingMock,
  postFactoringChargebackEvent: postChargebackMock,
}));

// An advance (batch) that is made of TWO invoices; each invoice lookup resolves to the same advance.
vi.mock("../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM mdata.vendors v")) return { rows: [{ id: "factor-1" }] };
      if (sql.includes("UPDATE accounting.invoices")) return { rows: [{ id: "inv-1" }] };
      if (sql.includes("JOIN accounting.factoring_advances fa")) {
        return {
          rows: [
            {
              factoring_advance_id: "fa-1",
              display_id: "FA-1",
              invoice_total_cents: 150000,
              reserve_amount_cents: 7500,
              factor_fee_cents: 3750,
              total_invoice_count: 2,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO factoring.reserve_movement")) return { rows: [{ id: "mv-1" }] };
      return { rows: [] };
    });
    return fn({ query });
  }),
}));

describe("parseMoneyToCents", () => {
  it("parses accounting-format negatives in parentheses", () => {
    expect(parseMoneyToCents("(3,000.00)")).toBe(-300000);
  });
  it("parses standard positive with $ and thousands separator", () => {
    expect(parseMoneyToCents("$1,234.56")).toBe(123456);
  });
  it("parses leading-minus negatives", () => {
    expect(parseMoneyToCents("-50.00")).toBe(-5000);
  });
  it("treats empty/whitespace as zero", () => {
    expect(parseMoneyToCents("")).toBe(0);
    expect(parseMoneyToCents("   ")).toBe(0);
  });
  it("fails loud on non-empty unparseable input (never silently 0)", () => {
    expect(() => parseMoneyToCents("abc")).toThrow(FaroCsvImportError);
    expect(() => parseMoneyToCents("1.2.3")).toThrow(FaroCsvImportError);
    expect(() => parseMoneyToCents("()")).toThrow(FaroCsvImportError);
    expect(() => parseMoneyToCents("$")).toThrow(FaroCsvImportError);
  });
});

describe("parseFaroCsv", () => {
  it("parses sample Faro CSV headers and rows", () => {
    const parsed = parseFaroCsv(SAMPLE_CSV);
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]?.invoice_number).toBe("INV-2026-00001");
    expect(parsed.lines[0]?.gross_amount_cents).toBe(100000);
    expect(parsed.lines[0]?.reserve_amount_cents).toBe(5000);
  });

  it("captures a parenthesized chargeback as a negative amount", () => {
    const csv = `Invoice Number,Customer Name,Gross,Advance,Reserve,Fee,Chargeback,Net,Due Date
INV-CB-1,Gamma Co,1000.00,950.00,50.00,25.00,"(3,000.00)",925.00,2026-06-15`;
    const parsed = parseFaroCsv(csv);
    expect(parsed.lines[0]?.chargeback_amount_cents).toBe(-300000);
  });

  it("rejects an unparseable money cell (fail-loud, not silent zero)", () => {
    const csv = `Invoice Number,Customer Name,Gross,Advance,Reserve,Fee,Chargeback,Net,Due Date
INV-BAD,Delta Co,ABC,950.00,50.00,25.00,0.00,925.00,2026-06-15`;
    expect(() => parseFaroCsv(csv)).toThrow(FaroCsvImportError);
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

  it("gates funding when not all of an advance's invoices are present (no phantom variance / no partial post)", async () => {
    postFundingMock.mockClear();
    postChargebackMock.mockClear();
    // Only ONE of the advance's two invoices is in this file; the advance carries a real chargeback.
    const partialCsv = `Invoice Number,Customer Name,Gross,Advance,Reserve,Fee,Chargeback,Net,Due Date
INV-2026-00001,Acme Freight,1000.00,950.00,50.00,25.00,"(3,000.00)",925.00,2026-06-15`;
    const result = await commitFaroCsvImport({
      userId: "user-1",
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      csvText: partialCsv,
      statementDate: "2026-06-04",
    });
    // Funding must NOT post for an incomplete batch.
    expect(postFundingMock).not.toHaveBeenCalled();
    expect(result.funding_posts.some((f) => f.reason === "incomplete_advance")).toBe(true);
    expect(result.incomplete_advance_count).toBe(1);
    // Chargeback is aggregated and routed regardless of batch completeness.
    expect(result.chargeback_total_cents).toBe(-300000);
    expect(postChargebackMock).not.toHaveBeenCalled(); // negative aggregate (recourse) => not a positive chargeback post
    // The chargeback presence flags the advance as a variance.
    expect(result.variances[0]?.has_variance).toBe(true);
    expect(result.variances[0]?.is_complete).toBe(false);
  });

  it("posts funding once all of an advance's invoices are present, and routes a positive chargeback", async () => {
    postFundingMock.mockClear();
    postChargebackMock.mockClear();
    // Both invoices present => complete; a positive chargeback amount routes to the chargeback poster.
    const fullCsv = `Invoice Number,Customer Name,Gross,Advance,Reserve,Fee,Chargeback,Net,Due Date
INV-2026-00001,Acme Freight,1000.00,950.00,50.00,25.00,300.00,925.00,2026-06-15
INV-2026-00002,Beta Logistics,500.00,475.00,25.00,12.50,0.00,462.50,2026-06-16`;
    const result = await commitFaroCsvImport({
      userId: "user-1",
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      csvText: fullCsv,
      statementDate: "2026-06-04",
    });
    expect(result.incomplete_advance_count).toBe(0);
    expect(postFundingMock).toHaveBeenCalledTimes(1);
    expect(result.chargeback_total_cents).toBe(30000);
    expect(postChargebackMock).toHaveBeenCalledTimes(1);
    expect(postChargebackMock).toHaveBeenCalledWith(
      expect.objectContaining({ chargeback_amount_cents: 30000, factoring_advance_id: "fa-1" })
    );
  });
});
