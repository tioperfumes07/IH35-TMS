// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

expect.extend(jestDomMatchers);

const mocks = vi.hoisted(() => ({ list: vi.fn(), open: vi.fn() }));
vi.mock("../../../api/accounting", () => ({ listDocumentWorkOrderCopies: mocks.list }));
vi.mock("../../../lib/openPrintableDocument", () => ({ openPrintableDocument: mocks.open }));

import { WorkOrderCopyLinks } from "../WorkOrderCopyLinks";

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkOrderCopyLinks kind="bill" documentId="bill-1" operatingCompanyId="co-1" />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("U16 WorkOrderCopyLinks — the stored work order opens from the document", () => {
  it("lists each stored copy and opens it (not the live work order)", async () => {
    mocks.list.mockResolvedValue({
      rows: [{ id: "copy-1", work_order_id: "wo-1", work_order_display_id: "WO-2026-0007", captured_at: "2026-10-03T15:00:00Z" }],
    });
    renderIt();
    const link = await screen.findByRole("button", { name: /WO-2026-0007 — stored/ });
    expect(mocks.list).toHaveBeenCalledWith("co-1", "bill", "bill-1");
    fireEvent.click(link);
    expect(mocks.open).toHaveBeenCalledWith("/api/v1/accounting/work-order-copies/copy-1.html?operating_company_id=co-1");
  });

  it("renders nothing when the document has no work order copy", async () => {
    mocks.list.mockResolvedValue({ rows: [] });
    const { container } = renderIt();
    await vi.waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("says so when the copies cannot be loaded, with a retry", async () => {
    mocks.list.mockRejectedValue(new Error("down"));
    renderIt();
    expect(await screen.findByTestId("wo-copy-error")).toHaveTextContent("could not be loaded");
  });
});
