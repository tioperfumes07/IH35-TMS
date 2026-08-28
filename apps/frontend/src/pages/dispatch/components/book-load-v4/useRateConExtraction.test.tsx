import type { ReactElement } from "react";
import { render, fireEvent, renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRateConExtraction, rateConErrorMessage } from "./useRateConExtraction";
import { OcrDropZone } from "./OcrDropZone";
import { RateConUploadPanel } from "./RateConUploadPanel";

// The docs pipeline is mocked — the hook's contract is upload→confirm→extract→prefill, not the network.
// LV-DOCS-FILES-NOT-HASHED: the hook now calls requestUploadUrlFromFile (hashes the file's bytes
// before minting the upload URL), not the lower-level requestUploadUrl it used to call directly.
vi.mock("../../../../api/docs", () => ({
  requestUploadUrlFromFile: vi.fn(async () => ({ file_id: "file-1", presigned_url: "https://r2.example/put" })),
  confirmUpload: vi.fn(async () => ({ ok: true, file_id: "file-1", already_completed: false })),
}));

const extractRateCon = vi.fn();
vi.mock("../../../../api/ratecon", () => ({
  extractRateCon: (...args: unknown[]) => extractRateCon(...args),
}));

const fixtureResponse = {
  extraction_id: "x1",
  total_matches_components: true,
  page_count: 2,
  duplicate_of: null,
  extraction: {
    // Faithful to the CURRENT backend contract. `parseExtraction` normalises every branch — broker, rate and
    // terms each default to {} and are then written key-by-key — so a real response ALWAYS carries `terms`
    // and the after-hours/invoice fields. This fixture predates RATECON-4 and omitted `terms` entirely,
    // which made `rateConExtractionToPrefill` read `e.terms.detention_rate_per_hour_cents` off undefined and
    // throw AFTER a SUCCESSFUL extraction — surfacing to the dispatcher as
    // "Couldn't extract this rate confirmation (Cannot read properties of undefined …)". That was the
    // fixture lying about the contract, not the product breaking: the live backend cannot emit this shape.
    broker: { name: "ACME Broker", mc_number: "MC123", address: null, phone: null, email: null, contact_name: null, after_hours_phone: null, after_hours_email: null },
    invoice_to_email: null,
    terms: { detention_rate_per_hour_cents: null, detention_free_hours: null, layover_per_day_cents: null, tonu_fee_cents: null },
    load_reference: ["REF-1"],
    stops: [
      { type: "pickup", name: "Shipper", address: "1 A St", city: "Laredo", state: "TX", zip: "78040", date: "2026-07-10", time_window: "08:00-12:00", appointment_required: true },
      { type: "delivery", name: "Consignee", address: "2 B St", city: "Dallas", state: "TX", zip: "75201", date: "2026-07-11", time_window: null, appointment_required: false },
    ],
    equipment: "Dry Van",
    commodity: "Freight",
    weight: "40000",
    rate: { linehaul_cents: 200000, fuel_surcharge_cents: 30000, accessorials: [{ label: "Detention", amount_cents: 5000 }], total_cents: 235000 },
    payment_terms: "Net 30",
    notes: "Handle with care",
    field_confidence: { "rate.total_cents": "high", "broker.name": "low" },
  },
} as const;

function makePdf(): File {
  const file = new File([new Uint8Array([1, 2, 3, 4])], "ratecon.pdf", { type: "application/pdf" });
  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
  }
  return file;
}

beforeEach(() => {
  extractRateCon.mockReset();
  // The hook PUTs the file to the presigned R2 URL directly with `fetch` (added by #2001). jsdom has a real
  // global fetch, so leaving this unmocked made every "success" run attempt a live request to
  // https://r2.example/put, fail, and land in the error branch — which is why the success test asserted
  // phase "done" and got "error". Mock the transport, not the contract.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response));
  // Deterministic, env-independent digest (jsdom does not provide crypto.subtle).
  vi.stubGlobal("crypto", { subtle: { digest: async () => new ArrayBuffer(32) } });
});

describe("rateConErrorMessage", () => {
  it("maps each backend failure to its single canonical copy", () => {
    expect(rateConErrorMessage(new Error("ratecon_extract_disabled 409"))).toBe("Rate-con extraction is turned off for this company.");
    expect(rateConErrorMessage(new Error("413 too_large"))).toBe("That file is too large (max 10 MB / 15 pages).");
    expect(rateConErrorMessage(new Error("503 ai_not_configured"))).toBe("AI extraction isn't configured on the server.");
    expect(rateConErrorMessage(new Error("502 extraction_failed"))).toBe("AI extraction failed — try again; if it persists tell the administrator.");
    // #2001 ("extraction error self-reports the real cause") deliberately made the GENERIC fallback name the
    // underlying reason instead of always reading as a bare "couldn't extract". This file was written in
    // #1878 and never updated, so it asserted the pre-#2001 copy. The contract being tested is still "one
    // canonical mapping shared by both entry points" — that has not changed; only the generic branch now
    // carries the detail. Both shapes are asserted so neither can regress silently.
    expect(rateConErrorMessage(new Error("boom"))).toBe("Couldn't extract this rate confirmation (boom). You can still book the load manually.");
    expect(rateConErrorMessage(new Error(""))).toBe("Couldn't extract this rate confirmation. You can still book the load manually.");
  });
});

describe("useRateConExtraction", () => {
  it("success: uploads, extracts, applies prefill, phase=done", async () => {
    extractRateCon.mockResolvedValueOnce(fixtureResponse);
    const onPrefill = vi.fn();
    const { result } = renderHook(() => useRateConExtraction({ operatingCompanyId: "oc-1", onPrefill }));
    await act(async () => {
      await result.current.handleFile(makePdf());
    });
    expect(extractRateCon).toHaveBeenCalledWith("oc-1", "file-1");
    expect(result.current.phase).toBe("done");
    expect(result.current.error).toBeNull();
    expect(onPrefill).toHaveBeenCalledTimes(1);
    expect((onPrefill.mock.calls[0][0] as { brokerMatch: { name: string } }).brokerMatch.name).toBe("ACME Broker");
  });

  it("suppresses a prior-company extraction completion after scope changes", async () => {
    let resolveExtraction!: (value: typeof fixtureResponse) => void;
    extractRateCon.mockImplementationOnce(
      () => new Promise<typeof fixtureResponse>((resolve) => { resolveExtraction = resolve; }),
    );
    const onPrefill = vi.fn();
    const { result, rerender } = renderHook(
      ({ companyId }) => useRateConExtraction({ operatingCompanyId: companyId, onPrefill }),
      { initialProps: { companyId: "oc-1" } },
    );

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleFile(makePdf());
    });
    await waitFor(() => expect(extractRateCon).toHaveBeenCalledWith("oc-1", "file-1"));
    rerender({ companyId: "oc-2" });
    await act(async () => {
      resolveExtraction(fixtureResponse);
      await pending;
    });

    expect(onPrefill).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
    expect(result.current.result).toBeNull();
  });

  it("refuses concurrent intake calls at the shared hook boundary", async () => {
    let resolveExtraction!: (value: typeof fixtureResponse) => void;
    extractRateCon.mockImplementationOnce(
      () => new Promise<typeof fixtureResponse>((resolve) => { resolveExtraction = resolve; }),
    );
    const onPrefill = vi.fn();
    const { result } = renderHook(() => useRateConExtraction({ operatingCompanyId: "oc-1", onPrefill }));

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.handleFile(makePdf());
      await result.current.handleFile(makePdf());
    });
    await waitFor(() => expect(extractRateCon).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveExtraction(fixtureResponse);
      await first;
    });
    expect(onPrefill).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ratecon_extract_disabled 409", "Rate-con extraction is turned off for this company."],
    ["413 too_large", "That file is too large (max 10 MB / 15 pages)."],
    ["503 ai_not_configured", "AI extraction isn't configured on the server."],
    // Thrown from inside step("extract", …), which prefixes the step name onto the message — so the raw
    // reason the dispatcher sees names WHICH call broke, which is the whole point of #2001.
    ["boom", "Couldn't extract this rate confirmation (extract: boom). You can still book the load manually."],
  ])("error path %s → phase=error, no prefill", async (thrown, message) => {
    extractRateCon.mockRejectedValueOnce(new Error(thrown));
    const onPrefill = vi.fn();
    const { result } = renderHook(() => useRateConExtraction({ operatingCompanyId: "oc-1", onPrefill }));
    await act(async () => {
      await result.current.handleFile(makePdf());
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.error).toBe(message);
    expect(onPrefill).not.toHaveBeenCalled();
  });
});

describe("single intake flow — byte-identical prefill from both entry points", () => {
  async function fireFile(node: ReactElement): Promise<void> {
    const { container } = render(node);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makePdf()] } });
    });
  }

  it("OcrDropZone and RateConUploadPanel produce the same prefill.json for one fixture", async () => {
    extractRateCon.mockResolvedValue(fixtureResponse);

    const dzPrefill = vi.fn();
    await fireFile(<OcrDropZone operatingCompanyId="oc-1" onPrefill={dzPrefill} />);
    await waitFor(() => expect(dzPrefill).toHaveBeenCalled());

    const panelPrefill = vi.fn();
    await fireFile(<RateConUploadPanel operatingCompanyId="oc-1" onPrefill={panelPrefill} />);
    await waitFor(() => expect(panelPrefill).toHaveBeenCalled());

    const dzJson = (dzPrefill.mock.calls[0][0] as { json: unknown }).json;
    const panelJson = (panelPrefill.mock.calls[0][0] as { json: unknown }).json;
    expect(JSON.stringify(dzJson)).toBe(JSON.stringify(panelJson));
  });
});
