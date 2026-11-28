/** M20: terms / shipping / sales-tax picked from the catalogs on a document; the due rule follows the picked terms' days. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { addDays, DocCatalogPickers } from "../PerfumeDocCatalogPickers";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

const cats = { terms: [{ id: "t0", name: "Due on Receipt", days: 0 }, { id: "t30", name: "Net 30", days: 30 }], shipping_methods: ["UPS", "LTL freight"],
  tax_codes: [{ id: "x1", code: "RESALE_EXEMPT", name: "Exempt — resale certificate", rate_pct: 0 }], payment_methods: [] };

describe("DocCatalogPickers", () => {
  it("addDays crosses a month end", () => { expect(addDays("2026-11-27", 15)).toBe("2026-12-12"); });

  it("lists the catalogs, patches the pick, and states the due rule", async () => {
    vi.mocked(clientApi.apiRequest).mockResolvedValue(cats);
    const onPatch = vi.fn();
    const { rerender } = render(<QueryClientProvider client={new QueryClient()}>
      <DocCatalogPickers doc={{ terms: "net 30 typed" }} docDate="2026-11-27" withTax onPatch={onPatch} testId="t" dueAfter="invoice date" /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("t-terms").querySelectorAll("option").length).toBe(3));
    expect(screen.getByTestId("t-terms").querySelector("option")!.textContent).toBe("— net 30 typed (typed, pick one) —");
    fireEvent.change(screen.getByTestId("t-terms"), { target: { value: "t30" } });
    expect(onPatch).toHaveBeenCalledWith({ payment_terms_id: "t30" });
    fireEvent.change(screen.getByTestId("t-ship"), { target: { value: "UPS" } });
    expect(onPatch).toHaveBeenCalledWith({ shipping_method: "UPS" });
    expect(screen.getByTestId("t-tax").textContent).toContain("Exempt — resale certificate · 0%");
    rerender(<QueryClientProvider client={new QueryClient()}>
      <DocCatalogPickers doc={{ payment_terms_id: "t30", terms_days: 30 }} docDate="2026-11-27" withTax={false} onPatch={onPatch} testId="t" dueAfter="vendor bill date" /></QueryClientProvider>);
    expect(screen.getByTestId("t-due").textContent).toBe("Due 30 days after the vendor bill date");
    expect(screen.queryByTestId("t-tax")).toBeNull();
  });
});
