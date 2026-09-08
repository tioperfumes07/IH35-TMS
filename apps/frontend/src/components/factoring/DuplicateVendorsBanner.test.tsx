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
  //
  // VENDOR-MERGE-QBO-ID-MISMATCH (owner-live-tested 2026-09-08): the merge endpoint validates
  // fromQboVendorId/toQboVendorId against QuickBooks' own entity id, NOT the internal
  // from_vendor_id/to_vendor_id uuid (that one is only for EntityLink navigation) -- deep-linking
  // the internal uuid 404'd every time, confirmed live. The fixtures below deliberately use
  // DIFFERENT values for the internal id vs. the qbo id so this test cannot pass by accident if
  // the component regresses to using the wrong field.
  it("each pair's 'Merge these' link carries the real QBO vendor ids (not the internal uuid) and names as query params", async () => {
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({
      pairs: [
        {
          from_vendor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          from_vendor_name: "NEFTALI URBANO CORONADO",
          from_qbo_vendor_id: "QBO-VENDOR-101",
          to_vendor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          to_vendor_name: "Neftali Coronado Urbano",
          to_qbo_vendor_id: "QBO-VENDOR-202",
          similarity: 1,
        },
      ],
    });

    renderBanner();

    const mergeLink = await screen.findByTestId("factoring-duplicate-vendors-banner-merge-pair-link");
    const href = mergeLink.getAttribute("href") ?? "";
    expect(href).toContain("/factoring/vendor-merges");

    const params = new URLSearchParams(href.split("?")[1] ?? "");
    expect(params.get("merge_from_vendor_id")).toBe("QBO-VENDOR-101");
    expect(params.get("merge_from_vendor_name")).toBe("NEFTALI URBANO CORONADO");
    expect(params.get("merge_to_vendor_id")).toBe("QBO-VENDOR-202");
    expect(params.get("merge_to_vendor_name")).toBe("Neftali Coronado Urbano");
  });

  it("shows an honest 'not yet synced to QBO' note instead of a merge link when either vendor has no qbo_vendor_id", async () => {
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({
      pairs: [
        {
          from_vendor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          from_vendor_name: "NEFTALI URBANO CORONADO",
          from_qbo_vendor_id: null,
          to_vendor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          to_vendor_name: "Neftali Coronado Urbano",
          to_qbo_vendor_id: null,
          similarity: 1,
        },
      ],
    });

    renderBanner();

    expect(await screen.findByTestId("factoring-duplicate-vendors-banner-merge-pair-unsynced")).toBeTruthy();
    expect(screen.queryByTestId("factoring-duplicate-vendors-banner-merge-pair-link")).toBeNull();
  });

  it("still renders the generic fallback link to the merge tab", async () => {
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({
      pairs: [
        {
          from_vendor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          from_vendor_name: "A",
          from_qbo_vendor_id: "QBO-VENDOR-101",
          to_vendor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          to_vendor_name: "B",
          to_qbo_vendor_id: "QBO-VENDOR-202",
          similarity: 0.9,
        },
      ],
    });

    renderBanner();

    const fallback = await screen.findByTestId("factoring-duplicate-vendors-banner-merge-link");
    expect(fallback.getAttribute("href")).toBe("/factoring/vendor-merges");
  });
});
