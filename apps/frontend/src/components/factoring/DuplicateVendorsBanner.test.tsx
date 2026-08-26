// @vitest-environment jsdom
import * as matchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
expect.extend(matchers);

import { DuplicateVendorsBanner } from "./DuplicateVendorsBanner";
import * as factoringApi from "../../api/factoring";

const COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function renderBanner() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DuplicateVendorsBanner companyId={COMPANY_ID} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DuplicateVendorsBanner — merge deep-link", () => {
  beforeEach(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* jsdom sessionStorage may already be clean */
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // BANNER-MERGE-DEEPLINK-DROPS-CONTEXT: the scan already resolves real from/to vendor ids for
  // each duplicate pair. The "Open Driver Vendor Merges" link used to discard that context (a
  // bare nav link with zero query params), landing the office user on an empty merge form whose
  // from/to fields are free text with no way to know the raw QBO vendor uuid the scan just found.
  it("each pair's 'Merge these' link carries the real from/to vendor ids and names as query params", async () => {
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({
      pairs: [
        {
          from_vendor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          from_vendor_name: "NEFTALI URBANO CORONADO",
          to_vendor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          to_vendor_name: "Neftali Coronado Urbano",
          similarity: 1,
        },
      ],
    });

    renderBanner();

    const mergeLink = await screen.findByTestId("factoring-duplicate-vendors-banner-merge-pair-link");
    const href = mergeLink.getAttribute("href") ?? "";
    expect(href).toContain("/factoring/vendor-merges");

    const params = new URLSearchParams(href.split("?")[1] ?? "");
    expect(params.get("merge_from_vendor_id")).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(params.get("merge_from_vendor_name")).toBe("NEFTALI URBANO CORONADO");
    expect(params.get("merge_to_vendor_id")).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(params.get("merge_to_vendor_name")).toBe("Neftali Coronado Urbano");
  });

  it("still renders the generic fallback link to the merge tab", async () => {
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({
      pairs: [
        {
          from_vendor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          from_vendor_name: "A",
          to_vendor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          to_vendor_name: "B",
          similarity: 0.9,
        },
      ],
    });

    renderBanner();

    const fallback = await screen.findByTestId("factoring-duplicate-vendors-banner-merge-link");
    expect(fallback.getAttribute("href")).toBe("/factoring/vendor-merges");
  });
});
