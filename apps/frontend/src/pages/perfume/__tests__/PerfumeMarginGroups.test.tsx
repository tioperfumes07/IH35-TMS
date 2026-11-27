import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { MarginGroupsEditor } from "../PerfumeMarginGroups";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-27 15:40 CT: different % per group (exclusive, new launches, testers, mini, sets, regular) — my margin and what vendors earn.
const puts: unknown[] = [];
beforeEach(() => {
  puts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === "/api/v1/perfume/rules" && opts?.method === "PUT") { puts.push(opts.body); return {}; }
    if (path === "/api/v1/perfume/rules") return { round_step: "25", round_dir: "up", wholesale_targets_pct: [11], group_margins: { tester: 30 }, group_earn: {} };
    return {};
  });
});
describe("margins by group", () => {
  it("shows the saved %, saves every group (blank = the tab's %), refuses a bad %", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><MarginGroupsEditor /></ToastProvider></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("perfume-margin-groups-open").textContent).toContain("(1)"));
    fireEvent.click(screen.getByTestId("perfume-margin-groups-open"));
    expect((screen.getByTestId("perfume-group-tester-mine") as HTMLInputElement).value).toBe("30");
    fireEvent.change(screen.getByTestId("perfume-group-exclusive-mine"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("perfume-group-tester-earn"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("perfume-group-set-mine"), { target: { value: "120" } });
    fireEvent.click(screen.getByTestId("perfume-margin-groups-save"));
    expect(puts).toHaveLength(0);
    fireEvent.change(screen.getByTestId("perfume-group-set-mine"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("perfume-margin-groups-save"));
    await waitFor(() => expect(puts).toEqual([{
      group_margins: { regular: null, exclusive: 20, new_launch: null, tester: 30, mini: null, set: null },
      group_earn: { regular: null, exclusive: null, new_launch: null, tester: 5, mini: null, set: null },
    }]));
  });
});
