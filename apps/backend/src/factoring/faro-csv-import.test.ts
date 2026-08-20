import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitFaroCsvImport,
  FaroCsvImportError,
  parseFaroCsv,
  parseMoneyToCents,
  resolveFaroCsvStatementDate,
} from "./faro-csv-import.js";
import { isEnabled } from "../lib/feature-flags/service.js";

const SAMPLE_CSV = `Invoice Number,Customer Name,Gross,Advance,Reserve,Fee,Chargeback,Net,Due Date
INV-2026-00001,Acme Freight,1000.00,950.00,50.00,25.00,0.00,925.00,2026-06-15
INV-2026-00002,Beta Logistics,500.00,475.00,25.00,12.50,0.00,462.50,2026-06-16`;

const {
  upsertOnClientMock,
  faroGateMock,
  ensureAccrueMock,
  postFundingMock,
  postChargebackMock,
  loadExactMock,
  withCurrentUserMock,
} = vi.hoisted(() => ({
  upsertOnClientMock: vi.fn(async () => ({ id: "import-1" })),
  faroGateMock: vi.fn(async () => ({
    ok: true as const,
    vendorId: "faro-vendor-id",
    vendorName: "Faro",
    agreementId: "agr-1",
    factorProfileId: "fp-1",
    companyCode: "TRANSP",
    asOf: "2026-06-04",
  })),
  ensureAccrueMock: vi.fn(async () => ({ flag_off: false, accruals_posted: 0 })),
  postFundingMock: vi.fn(async () => ({ posted: true, journal_entry_id: "je-fund" })),
  postChargebackMock: vi.fn(async () => ({ posted: true, journal_entry_id: "je-cb" })),
  loadExactMock: vi.fn(async () => ({ liability_cents: 30000, recoursed_ar_cents: 150000 })),
  withCurrentUserMock: vi.fn(),
}));

vi.mock("../accounting/factoring-posting/faro-agreement-gate.js", () => ({
  requireEffectiveFaroFullRecourseAgreement: faroGateMock,
  advanceBoundToFaroVendor: vi.fn(async () => true),
  FARO_FULL_RECOURSE_AGREEMENT_CODE: "FARO_FULL_RECOURSE_V1",
  FARO_FULL_RECOURSE_V1: "FARO_FULL_RECOURSE_V1",
}));
vi.mock("../data-infra/data-infra.service.js", () => ({
  upsertFaroDailyImportOnClient: upsertOnClientMock,
  upsertFaroDailyImport: vi.fn(async () => ({ id: "import-1" })),
}));
vi.mock("../accounting/factoring-posting/default-interest.service.js", () => ({
  ensureDefaultInterestAccruedThroughDate: ensureAccrueMock,
}));
vi.mock("../lib/feature-flags/service.js", () => ({
  isEnabled: vi.fn(async () => true),
}));
vi.mock("../lib/company-business-date.js", () => ({
  companyBusinessDate: vi.fn(() => "2026-07-19"),
}));
vi.mock("../accounting/factoring-posting/poster.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../accounting/factoring-posting/poster.service.js")>();
  return {
    ...actual,
    postFactoringAdvanceEvent: postFundingMock,
    postFactoringChargebackEvent: postChargebackMock,
    loadExactLinkedChargebackAmounts: loadExactMock,
  };
});

vi.mock("../auth/db.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, withCurrentUser: withCurrentUserMock };
});

function installTxnClient(opts?: { throwAfterUpsert?: Error }) {
  withCurrentUserMock.mockImplementation(
    async (_userId: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
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
      const result = await fn({ query });
      if (opts?.throwAfterUpsert) throw opts.throwAfterUpsert;
      return result;
    }
  );
}

beforeEach(() => {
  upsertOnClientMock.mockClear();
  upsertOnClientMock.mockResolvedValue({ id: "import-1" });
  faroGateMock.mockReset();
  faroGateMock.mockResolvedValue({
    ok: true,
    vendorId: "faro-vendor-id",
    vendorName: "Faro",
    agreementId: "agr-1",
    factorProfileId: "fp-1",
    companyCode: "TRANSP",
    asOf: "2026-06-04",
  });
  ensureAccrueMock.mockClear();
  ensureAccrueMock.mockResolvedValue({ flag_off: false, accruals_posted: 0 });
  postFundingMock.mockClear();
  postChargebackMock.mockClear();
  loadExactMock.mockReset();
  loadExactMock.mockResolvedValue({ liability_cents: 30000, recoursed_ar_cents: 150000 });
  withCurrentUserMock.mockClear();
  installTxnClient();
});

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
    expect(parsed.statement_date).toBe("2026-06-15");
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

describe("resolveFaroCsvStatementDate", () => {
  it("rejects future statement dates vs company business date", () => {
    expect(() => resolveFaroCsvStatementDate("2099-01-01")).toThrow(FaroCsvImportError);
    try {
      resolveFaroCsvStatementDate("2099-01-01");
    } catch (e) {
      expect((e as FaroCsvImportError).code).toBe("policy_future_statement_date");
    }
  });

  it("rejects missing / invalid statement dates (no today salvage)", () => {
    expect(() => resolveFaroCsvStatementDate(null, undefined)).toThrow(FaroCsvImportError);
    expect(() => resolveFaroCsvStatementDate("07/19/2026")).toThrow(FaroCsvImportError);
  });

  it("accepts supplied YYYY-MM-DD on/before business date", () => {
    expect(resolveFaroCsvStatementDate("2026-06-04")).toBe("2026-06-04");
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
    expect(upsertOnClientMock).toHaveBeenCalled();
  });

  // ACCT-F5614 — flag OFF must write ZERO financial rows, including factoring.reserve_movement
  // (previously written unconditionally regardless of FACTORING_GL_POSTING_FLAG, so the reserve
  // balance screen could show a real, non-zero figure with no corresponding GL entry).
  it("flag OFF: invoices still update, but ZERO reserve movements are written (honest flag-off)", async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(false);
    const result = await commitFaroCsvImport({
      userId: "user-1",
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      csvText: SAMPLE_CSV,
      statementDate: "2026-06-04",
    });
    expect(result.invoices_updated).toBeGreaterThan(0);
    expect(result.reserve_movements).toBe(0);
    expect(result.factoring_gl_posting_enabled).toBe(false);
  });

  it("rejected Faro agreement leaves zero durable CSV rows (no upsert)", async () => {
    faroGateMock.mockResolvedValue({ ok: false, reason: "missing_faro_agreement_binding" });
    await expect(
      commitFaroCsvImport({
        userId: "user-1",
        operatingCompanyId: "11111111-1111-4111-8111-111111111111",
        csvText: SAMPLE_CSV,
        statementDate: "2026-06-04",
      })
    ).rejects.toMatchObject({ code: "policy_faro_agreement" });
    expect(upsertOnClientMock).not.toHaveBeenCalled();
  });

  it("resolves authoritative Faro agreement as-of statement/economic date (not today)", async () => {
    await commitFaroCsvImport({
      userId: "user-1",
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      csvText: SAMPLE_CSV,
      statementDate: "2026-06-04",
    });
    expect(faroGateMock).toHaveBeenCalledWith(
      expect.anything(),
      "11111111-1111-4111-8111-111111111111",
      "2026-06-04"
    );
  });

  it("expired / RTS / partial agreement as-of statement date rejects before upsert", async () => {
    faroGateMock.mockResolvedValue({ ok: false, reason: "faro_agreement_not_effective" });
    await expect(
      commitFaroCsvImport({
        userId: "user-1",
        operatingCompanyId: "11111111-1111-4111-8111-111111111111",
        csvText: SAMPLE_CSV,
        statementDate: "2026-06-04",
      })
    ).rejects.toMatchObject({ code: "policy_faro_agreement" });
    expect(upsertOnClientMock).not.toHaveBeenCalled();
  });

  it("future statement date rejects before any durable import", async () => {
    await expect(
      commitFaroCsvImport({
        userId: "user-1",
        operatingCompanyId: "11111111-1111-4111-8111-111111111111",
        csvText: SAMPLE_CSV,
        statementDate: "2099-12-31",
      })
    ).rejects.toMatchObject({ code: "policy_future_statement_date" });
    expect(withCurrentUserMock).not.toHaveBeenCalled();
    expect(upsertOnClientMock).not.toHaveBeenCalled();
  });

  it("gates funding when not all of an advance's invoices are present (no phantom variance / no partial post)", async () => {
    const partialCsv = `Invoice Number,Customer Name,Gross,Advance,Reserve,Fee,Chargeback,Net,Due Date
INV-2026-00001,Acme Freight,1000.00,950.00,50.00,25.00,"(3,000.00)",925.00,2026-06-15`;
    const result = await commitFaroCsvImport({
      userId: "user-1",
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      csvText: partialCsv,
      statementDate: "2026-06-04",
    });
    expect(postFundingMock).not.toHaveBeenCalled();
    expect(result.funding_posts.some((f) => f.reason === "incomplete_advance")).toBe(true);
    expect(result.incomplete_advance_count).toBe(1);
    expect(result.chargeback_total_cents).toBe(-300000);
    expect(postChargebackMock).not.toHaveBeenCalled();
    expect(result.variances[0]?.has_variance).toBe(true);
    expect(result.variances[0]?.is_complete).toBe(false);
  });

  it("posts funding once complete and accrues default interest through statement date before chargeback", async () => {
    ensureAccrueMock.mockResolvedValue({ flag_off: false, accruals_posted: 3 });
    loadExactMock.mockResolvedValue({ liability_cents: 30000, recoursed_ar_cents: 150000 });
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
    expect(ensureAccrueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        factoring_advance_id: "fa-1",
        as_of_date_iso: "2026-06-04",
      })
    );
    expect(postChargebackMock).toHaveBeenCalledTimes(1);
    expect(postChargebackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeback_amount_cents: 30000,
        default_interest_cents: 0,
        recoursed_ar_cents: 150000,
        factoring_advance_id: "fa-1",
      })
    );
    expect(result.chargeback_posts[0]?.default_interest_accruals_posted).toBe(3);
  });

  it("missed-cron completion: ensureDefaultInterestAccruedThroughDate runs before exact liability load", async () => {
    const order: string[] = [];
    ensureAccrueMock.mockImplementation(async () => {
      order.push("accrue");
      return { flag_off: false, accruals_posted: 2 };
    });
    loadExactMock.mockImplementation(async () => {
      order.push("exact");
      return { liability_cents: 30000, recoursed_ar_cents: 150000 };
    });
    postChargebackMock.mockImplementation(async () => {
      order.push("chargeback");
      return { posted: true, journal_entry_id: "je-cb" };
    });
    const fullCsv = `Invoice Number,Customer Name,Gross,Advance,Reserve,Fee,Chargeback,Net,Due Date
INV-2026-00001,Acme Freight,1000.00,950.00,50.00,25.00,300.00,925.00,2026-06-15
INV-2026-00002,Beta Logistics,500.00,475.00,25.00,12.50,0.00,462.50,2026-06-16`;
    await commitFaroCsvImport({
      userId: "user-1",
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      csvText: fullCsv,
      statementDate: "2026-06-04",
    });
    expect(order).toEqual(["accrue", "exact", "chargeback"]);
  });

  it("fail-closed when CSV chargeback ≠ exact linked liability (no partial / guessed recourse)", async () => {
    loadExactMock.mockResolvedValue({ liability_cents: 50000, recoursed_ar_cents: 150000 });
    const fullCsv = `Invoice Number,Customer Name,Gross,Advance,Reserve,Fee,Chargeback,Net,Due Date
INV-2026-00001,Acme Freight,1000.00,950.00,50.00,25.00,300.00,925.00,2026-06-15
INV-2026-00002,Beta Logistics,500.00,475.00,25.00,12.50,0.00,462.50,2026-06-16`;
    const result = await commitFaroCsvImport({
      userId: "user-1",
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      csvText: fullCsv,
      statementDate: "2026-06-04",
    });
    expect(postChargebackMock).not.toHaveBeenCalled();
    expect(result.chargeback_posts.some((c) => c.reason === "policy_partial_or_ambiguous_recourse")).toBe(
      true
    );
  });
});
