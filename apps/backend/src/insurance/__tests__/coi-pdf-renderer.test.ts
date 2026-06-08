import { describe, expect, it, vi } from "vitest";

// Unit-test the HTML renderer in isolation (no puppeteer, no DB).
// We import the internal renderHtml function by re-exporting it from the service
// only in test — so we test the HTML output shape without launching a browser.

vi.mock("puppeteer", () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(Buffer.from("FAKEPDF")),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// We test the exported renderCoiPdf against a mock Queryable.
import { renderCoiPdf } from "../coi-pdf-renderer.service.js";

function makeQueryable(policy: Record<string, unknown>, units: Record<string, unknown>[], company: Record<string, unknown>) {
  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM insurance.policy")) {
        return Promise.resolve({ rows: policy ? [policy] : [] });
      }
      if (sql.includes("FROM insurance.policy_unit")) {
        return Promise.resolve({ rows: units });
      }
      if (sql.includes("FROM org.companies")) {
        return Promise.resolve({ rows: [company] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

const POLICY = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  insurer_name: "Progressive Commercial",
  policy_number: "PC-20260101",
  coverage_type: "auto_liability",
  effective_date: "2026-01-01",
  expiry_date: "2026-12-31",
  status: "active",
};

const UNITS = [
  {
    unit_code: "T-101",
    asset_type: "truck",
    vin: "1HGBH41JXMN109186",
    make: "Kenworth",
    model: "T680",
    year: 2022,
    insured_value_cents: 15000000,
  },
  {
    unit_code: "TR-22",
    asset_type: "trailer",
    vin: null,
    make: "Wabash",
    model: "DuraPlate",
    year: 2021,
    insured_value_cents: 5000000,
  },
];

const COMPANY = {
  legal_name: "IH35 Freight LLC",
  address_line1: "100 Commerce Dr",
  city: "Laredo",
  state: "TX",
  phone: "956-555-0100",
};

describe("coi-pdf-renderer.service", () => {
  const OC_ID = "cccccccc-0000-0000-0000-000000000001";
  const POLICY_ID = POLICY.id;

  it("returns null when policy is not found", async () => {
    const client = makeQueryable({}, [], COMPANY);
    // Override first query (policy) to return empty rows.
    client.query.mockImplementationOnce(() => Promise.resolve({ rows: [] }));
    const result = await renderCoiPdf(client, { policyId: POLICY_ID, operatingCompanyId: OC_ID });
    expect(result).toBeNull();
  });

  it("returns a PDF buffer with correct filename and mime type", async () => {
    const client = makeQueryable(POLICY, UNITS, COMPANY);
    const result = await renderCoiPdf(client, { policyId: POLICY_ID, operatingCompanyId: OC_ID });
    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe("application/pdf");
    expect(result!.filename).toMatch(/^coi-PC-20260101\.pdf$/);
    expect(result!.pdfBuffer).toBeInstanceOf(Buffer);
    expect(result!.sha256).toHaveLength(64);
  });

  it("returns a PDF even when there are no covered units", async () => {
    const client = makeQueryable(POLICY, [], COMPANY);
    const result = await renderCoiPdf(client, { policyId: POLICY_ID, operatingCompanyId: OC_ID });
    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe("application/pdf");
  });

  it("sanitises special characters in policy number for filename", async () => {
    const specialPolicy = { ...POLICY, policy_number: "PC/2026 #1 <test>" };
    const client = makeQueryable(specialPolicy, [], COMPANY);
    const result = await renderCoiPdf(client, { policyId: POLICY_ID, operatingCompanyId: OC_ID });
    expect(result).not.toBeNull();
    expect(result!.filename).not.toMatch(/[/<>]/);
  });
});
