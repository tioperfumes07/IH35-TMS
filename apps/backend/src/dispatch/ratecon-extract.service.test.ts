import { describe, expect, it, vi } from "vitest";
import {
  countPdfPages,
  extractRateConPdf,
  parseRateConExtraction,
  RateConTooLargeError,
  RATECON_MAX_BYTES,
  RATECON_SYSTEM_PROMPT,
  totalMatchesComponents,
} from "./ratecon-extract.service.js";

const MODEL_JSON = JSON.stringify({
  broker: { name: "ACME Logistics", mc_number: "MC123456", phone: "555-1212", email: "d@acme.com", contact_name: "Sam" },
  load_reference: ["RC-9001", 42, "PO-7"],
  stops: [
    { type: "pickup", city: "Laredo", state: "TX", date: "2026-07-05", appointment_required: true },
    { type: "delivery", city: "Dallas", state: "TX" },
  ],
  equipment: "Dry Van 53'",
  rate: {
    linehaul_cents: 120000,
    fuel_surcharge_cents: 30000,
    accessorials: [{ label: "Detention", amount_cents: 5000 }, { label: "bad", amount_cents: 12.5 }],
    total_cents: 155000,
  },
  payment_terms: "Net 30",
  field_confidence: { broker: "high", rate: "medium", weight: "nope" },
});

function fakeAnthropicFetch(text: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text }] }),
    text: async () => "",
  });
}

// A tiny buffer that looks like a 1-page PDF to the page counter.
const FAKE_PDF = Buffer.from("%PDF-1.4\n/Type /Pages /Count 1\n/Type /Page\n%%EOF");

describe("ratecon-extract.service", () => {
  it("parses shape + coerces money to integer cents, dropping non-integer accessorials", () => {
    const e = parseRateConExtraction(MODEL_JSON);
    expect(e.broker.name).toBe("ACME Logistics");
    expect(e.load_reference).toEqual(["RC-9001", "PO-7"]); // the numeric 42 is dropped
    expect(e.rate.linehaul_cents).toBe(120000);
    expect(e.rate.accessorials).toHaveLength(1); // 12.5 (non-integer cents) dropped
    expect(e.rate.accessorials[0]).toEqual({ label: "Detention", amount_cents: 5000 });
    expect(e.field_confidence.weight).toBe("low"); // invalid confidence normalized
  });

  it("flags total that does NOT equal the sum of components", () => {
    const e = parseRateConExtraction(MODEL_JSON); // 120000+30000+5000 = 155000 == total ✓
    expect(totalMatchesComponents(e)).toBe(true);
    const bad = parseRateConExtraction(JSON.stringify({ rate: { linehaul_cents: 100000, total_cents: 999999, accessorials: [] } }));
    expect(totalMatchesComponents(bad)).toBe(false);
  });

  it("rejects a rate-con over the byte cap without calling the API", async () => {
    const fetchImpl = fakeAnthropicFetch("{}");
    const huge = Buffer.alloc(RATECON_MAX_BYTES + 1);
    await expect(extractRateConPdf(huge, { apiKey: "k", fetchImpl })).rejects.toBeInstanceOf(RateConTooLargeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the injection-hardened system prompt, a document block, and NO tools — exactly one call", async () => {
    const fetchImpl = fakeAnthropicFetch(MODEL_JSON);
    const res = await extractRateConPdf(FAKE_PDF, { apiKey: "k", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as { body: string }).body);
    expect(body.system).toBe(RATECON_SYSTEM_PROMPT);
    expect(body.tools).toBeUndefined(); // never enable tools on untrusted-document input
    expect(body.messages[0].content[0].type).toBe("document");
    expect(res.extraction.broker.mc_number).toBe("MC123456");
    expect(res.total_matches_components).toBe(true);
  });

  it("counts at least one page on a minimal PDF", () => {
    expect(countPdfPages(FAKE_PDF)).toBe(1);
    expect(countPdfPages(Buffer.from("no pdf markers"))).toBeNull();
  });
});
