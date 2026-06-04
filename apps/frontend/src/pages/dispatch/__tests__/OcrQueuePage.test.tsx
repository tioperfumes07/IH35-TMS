import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as dispatchApi from "../../../api/dispatch";
import { OcrQueuePage } from "../OcrQueuePage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../components/BookLoadModal", () => ({
  BookLoadModal: (props: { open: boolean; templatePrefillJson?: Record<string, unknown> | null }) =>
    props.open ? (
      <div data-testid="book-load-modal-open" data-prefill={props.templatePrefillJson ? "yes" : "no"} />
    ) : null,
}));

const readyItem: dispatchApi.OcrIntakeQueueItem = {
  id: "q1",
  operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
  status: "ready_review",
  source: "email_forward",
  email_from: "broker@example.com",
  email_subject: "Rate con 4401",
  source_pdf_r2_key: "dispatch/ocr/oc/x.pdf",
  attachment_filename: "ACME_2500.pdf",
  extracted_fields: {
    customer_name_raw: "Acme Freight",
    origin_city: "Dallas",
    origin_state: "TX",
    destination_city: "Houston",
    destination_state: "TX",
    pickup_date: "2026-06-03",
    delivery_date: "2026-06-04",
    rate_cents: 250000,
    confidence_score: 0.82,
  },
  confidence_score: 0.82,
  error_message: null,
  created_at: "2026-06-03T12:00:00.000Z",
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OcrQueuePage (B21-D7)", () => {
  beforeEach(() => {
    vi.spyOn(dispatchApi, "getOcrIntakeQueue").mockResolvedValue({ items: [readyItem] });
    vi.spyOn(dispatchApi, "convertOcrIntakeToBookLoad").mockResolvedValue({
      item: { ...readyItem, status: "converted" },
      book_load_prefill: { customer_name: "Acme Freight", linehaul_cents: 250000 },
    });
  });

  it("renders OCR queue page shell", async () => {
    wrap(<OcrQueuePage />);
    expect(await screen.findByTestId("dispatch-ocr-queue-page")).toBeTruthy();
    expect(await screen.findByText("OCR queue")).toBeTruthy();
  });

  it("shows extracted fields for ready_review items", async () => {
    wrap(<OcrQueuePage />);
    expect(await screen.findByText("Acme Freight")).toBeTruthy();
    expect(await screen.findByText(/Dallas/)).toBeTruthy();
    expect(await screen.findByText(/\$2,500\.00/)).toBeTruthy();
  });

  it("convert opens Book Load with prefill", async () => {
    wrap(<OcrQueuePage />);
    await userEvent.click(await screen.findByTestId("ocr-convert-q1"));
    expect(await screen.findByTestId("book-load-modal-open")).toBeTruthy();
    expect(screen.getByTestId("book-load-modal-open").getAttribute("data-prefill")).toBe("yes");
  });

  it("shows processing hint for pending OCR status", async () => {
    vi.spyOn(dispatchApi, "getOcrIntakeQueue").mockResolvedValue({
      items: [{ ...readyItem, id: "q2", status: "processing", extracted_fields: {} }],
    });
    wrap(<OcrQueuePage />);
    expect(await screen.findByText("OCR processing…")).toBeTruthy();
  });
});
