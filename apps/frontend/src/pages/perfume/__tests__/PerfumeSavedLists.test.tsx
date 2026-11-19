import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeSavedListsBar, savedListLabel } from "../PerfumeSavedListsBar";
import type { PerfumeSavedList } from "../../../api/perfume";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-19 05:46 CT: save the current lists, then switch between them and the new testers list — "offer 1, 2 3 …
// or by date". Nothing is deleted; the picker puts one saved list in use.
const S = (o: Partial<PerfumeSavedList>): PerfumeSavedList => ({ key: "k", vendor_id: "vo", vendor_name: "MY OFFER", kind: "offer", number: 1, name: "n", list_ids: ["l"], files: ["f"],
  first_date: "2026-11-13", last_date: "2026-11-13", lines: 582, in_use: false, imported_at: "2026-11-13T10:00:00Z", ...o });
let saved: PerfumeSavedList[] = [];
const posts: unknown[] = [];
beforeEach(() => {
  posts.length = 0;
  saved = [S({ key: "l1", number: 1, name: "TIO offer.csv · 2026-11-13", in_use: true }), S({ key: "LISTA IVA testers", number: 2, name: "LISTA IVA testers", first_date: "2026-11-19", last_date: "2026-11-19", lines: 108 })];
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === "/api/v1/perfume/mine/saved-lists") return { saved };
    if (path === "/api/v1/perfume/mine/saved-lists/use") {
      posts.push(opts?.body);
      const b = opts?.body as { key: string | null };
      saved = saved.map((s) => ({ ...s, in_use: s.key === b.key }));
      return { ok: true, in_use: 1 };
    }
    throw new Error(`unexpected ${path}`);
  });
});

describe("My saved lists", () => {
  it("names each saved list by number, name, date and lines", () => {
    expect(savedListLabel(saved[1])).toBe("Offer 2 · LISTA IVA testers · Nov 19, 2026 · 108 lines");
    expect(savedListLabel(S({ kind: "inventory", number: 3, name: "Costs", first_date: "2026-11-13", last_date: "2026-11-19" }))).toBe("Import 3 · Costs · Nov 13, 2026 – Nov 19, 2026 · 582 lines");
  });
  it("shows the list in use and switches to another saved list without deleting anything", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeSavedListsBar /></ToastProvider></QueryClientProvider>);
    const input = await screen.findByRole("combobox", { name: "My offer list" }) as HTMLInputElement;
    await waitFor(() => expect(input.value).toContain("Offer 1 · TIO offer.csv"));
    fireEvent.focus(input); fireEvent.click(input);
    fireEvent.click(await screen.findByText("Offer 2 · LISTA IVA testers · Nov 19, 2026 · 108 lines"));
    await waitFor(() => expect(posts).toEqual([{ vendor_id: "vo", key: "LISTA IVA testers" }]));
    await waitFor(() => expect((screen.getByRole("combobox", { name: "My offer list" }) as HTMLInputElement).value).toContain("Offer 2 · LISTA IVA testers"));
  });
});
