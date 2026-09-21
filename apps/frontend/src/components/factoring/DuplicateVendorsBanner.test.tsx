// @vitest-environment jsdom
import * as matchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const PAIR = {
  from_vendor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  from_vendor_name: "NEFTALI URBANO CORONADO",
  from_qbo_vendor_id: null,
  to_vendor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  to_vendor_name: "Neftali Coronado Urbano",
  to_qbo_vendor_id: null,
  similarity: 1,
};

describe("DuplicateVendorsBanner — merge action", () => {
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

  // FIX-DVB135 (Round 27.1 step 5.7): the old QBO-id-gated deep link never rendered for USMCA —
  // 0 of 618 vendors carry a qbo_vendor_id (USMCA never pushes to/from QBO). "Merge these" must
  // render and work using the TMS's own vendor ids alone, with neither side synced to QBO.
  it("renders 'Merge these' for a pair with no qbo_vendor_id on either side", async () => {
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [PAIR] });

    renderBanner();

    expect(await screen.findByTestId("factoring-duplicate-vendors-banner-merge-pair-link")).toBeTruthy();
  });

  it("clicking 'Merge these' then a survivor name flags-then-merges using the TMS's own vendor ids, never QBO ids", async () => {
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [PAIR] });
    const flagSpy = vi.spyOn(factoringApi, "flagVendorDuplicate").mockResolvedValue({ id: PAIR.to_vendor_id, is_duplicate: true, merge_target_id: PAIR.from_vendor_id });
    const mergeSpy = vi.spyOn(factoringApi, "mergeVendor").mockResolvedValue({ merge: { ok: true } });

    renderBanner();

    fireEvent.click(await screen.findByTestId("factoring-duplicate-vendors-banner-merge-pair-link"));
    fireEvent.click(await screen.findByTestId("factoring-duplicate-vendors-banner-merge-keep-from"));

    await waitFor(() => expect(mergeSpy).toHaveBeenCalled());

    expect(flagSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        survivorVendorId: PAIR.from_vendor_id,
        duplicateVendorId: PAIR.to_vendor_id,
        companyId: COMPANY_ID,
      })
    );
    expect(mergeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        survivorVendorId: PAIR.from_vendor_id,
        duplicateVendorId: PAIR.to_vendor_id,
        companyId: COMPANY_ID,
      })
    );
  });

  it("keeping the 'to' name merges the 'from' vendor into it (survivor is whichever name was clicked)", async () => {
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [PAIR] });
    const flagSpy = vi.spyOn(factoringApi, "flagVendorDuplicate").mockResolvedValue({ id: PAIR.from_vendor_id, is_duplicate: true, merge_target_id: PAIR.to_vendor_id });
    vi.spyOn(factoringApi, "mergeVendor").mockResolvedValue({ merge: { ok: true } });

    renderBanner();

    fireEvent.click(await screen.findByTestId("factoring-duplicate-vendors-banner-merge-pair-link"));
    fireEvent.click(await screen.findByTestId("factoring-duplicate-vendors-banner-merge-keep-to"));

    await waitFor(() =>
      expect(flagSpy).toHaveBeenCalledWith(
        expect.objectContaining({ survivorVendorId: PAIR.to_vendor_id, duplicateVendorId: PAIR.from_vendor_id })
      )
    );
  });

  it("cancel returns to the 'Merge these' prompt without calling either API", async () => {
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [PAIR] });
    const flagSpy = vi.spyOn(factoringApi, "flagVendorDuplicate");
    const mergeSpy = vi.spyOn(factoringApi, "mergeVendor");

    renderBanner();

    fireEvent.click(await screen.findByTestId("factoring-duplicate-vendors-banner-merge-pair-link"));
    fireEvent.click(await screen.findByTestId("factoring-duplicate-vendors-banner-merge-cancel"));

    expect(await screen.findByTestId("factoring-duplicate-vendors-banner-merge-pair-link")).toBeTruthy();
    expect(flagSpy).not.toHaveBeenCalled();
    expect(mergeSpy).not.toHaveBeenCalled();
  });

  it("still renders the generic fallback link to the merge tab", async () => {
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [PAIR] });

    renderBanner();

    const fallback = await screen.findByTestId("factoring-duplicate-vendors-banner-merge-link");
    expect(fallback.getAttribute("href")).toBe("/factoring/vendor-merges");
  });
});
