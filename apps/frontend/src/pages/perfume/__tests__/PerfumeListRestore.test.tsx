import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { VoidedListsCard } from "../PerfumeListsPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-27 08:51 CT: "Add void buttons etc restore buttons".
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/lists/voided") return { lists: [{ id: "l1", vendor_id: "v1", vendor_name: "Sushmaa Intl Inc", list_date: "2026-11-03", label: null,
      file_name: "Sushmaa_Order_Form_2026-11-04.xlsx", rows_saved: 312, voided_at: "2026-11-27T12:31:13Z", void_reason: "Replaced by catalog_2026-11-16.pdf", linked: 289, vendor_has_current: true }] };
    if (path === "/api/v1/perfume/lists/l1/restore") return { ok: true, voided_now: ["l2"], is_current: true };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><VoidedListsCard /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("voided lists", () => {
  it("lists a voided list with why, and restores it in place of the list in use with a reason", async () => {
    mount();
    expect(await screen.findByText("Sushmaa_Order_Form_2026-11-04.xlsx")).toBeTruthy();
    expect(screen.getByText("Replaced by catalog_2026-11-16.pdf")).toBeTruthy();
    fireEvent.click(screen.getByTestId("perfume-list-restore"));
    const save = screen.getByTestId("perfume-list-restore-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("perfume-list-restore-replace").getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "PDF was misread" } });
    fireEvent.click(save);
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/lists/l1/restore", { reason: "PDF was misread", replace: true }]));
  });
});
