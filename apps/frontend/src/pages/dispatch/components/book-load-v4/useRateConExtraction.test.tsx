import type { ReactElement } from "react";
import { render, fireEvent, renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRateConExtraction, rateConErrorMessage } from "./useRateConExtraction";
import { OcrDropZone } from "./OcrDropZone";
import { RateConUploadPanel } from "./RateConUploadPanel";

// The docs pipeline is mocked — the hook's contract is upload→confirm→extract→prefill, not the network.
vi.mock("../../../../api/docs", () => ({
  requestUploadUrl: vi.fn(async () => ({ file_id: "file-1", presigned_url: "https://r2.example/put" })),
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
    broker: { name: "ACME Broker", mc_number: "MC123", address: null, phone: null, email: null, contact_name: null },
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
  // Deterministic, env-independent digest (jsdom does not provide crypto.subtle).
  vi.stubGlobal("crypto", { subtle: { digest: async () => new ArrayBuffer(32) } });
});

describe("rateConErrorMessage", () => {
  it("maps each backend failure to its single canonical copy", () => {
    expect(rateConErrorMessage(new Error("ratecon_extract_disabled 409"))).toBe("Rate-con extraction is turned off for this company.");
    expect(rateConErrorMessage(new Error("413 too_large"))).toBe("That file is too large (max 10 MB / 15 pages).");
    expect(rateConErrorMessage(new Error("503 ai_not_configured"))).toBe("AI extraction isn't configured on the server.");
    expect(rateConErrorMessage(new Error("502 extraction_failed"))).toBe("AI extraction failed — try again; if it persists tell the administrator.");
    expect(rateConErrorMessage(new Error("boom"))).toBe("Couldn't extract this rate confirmation. You can still book the load manually.");
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

  it.each([
    ["ratecon_extract_disabled 409", "Rate-con extraction is turned off for this company."],
    ["413 too_large", "That file is too large (max 10 MB / 15 pages)."],
    ["503 ai_not_configured", "AI extraction isn't configured on the server."],
    ["boom", "Couldn't extract this rate confirmation. You can still book the load manually."],
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
