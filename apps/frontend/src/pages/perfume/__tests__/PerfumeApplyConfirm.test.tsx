import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import PerfumeDeskPage from "../PerfumeDeskPage";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-15 13:49 CT: "in all reports in the perfumes i need to have a confirm or save so i can know the changes
// are taking effect."
describe("Perfume grid: a typed % takes effect only on Apply, and says so", () => {
  it("typing alone does not recompute; the line says Not applied; Apply recomputes and confirms with the server's numbers", async () => {
    const paths: string[] = [];
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      paths.push(path);
      if (path === "/api/v1/perfume/access") return { allowed: true };
      if (path.startsWith("/api/v1/perfume/review")) return { rows: [], total: 0 };
      if (path.startsWith("/api/v1/perfume/grid")) {
        const t = /target_pct=([\d.]+)/.exec(path)?.[1];
        const e = /earn_pct=([\d.]+)/.exec(path)?.[1];
        return { cols: [{ key: "brand", label: "Brand", group: "Item", kind: "text" }], rows: [{ id: "i1", brand: "X" }], total: 1, facets: {}, rules: {}, vendors: [],
          target_pct: t ? Number(t) : 11, earn_pct: e ? Number(e) : 16, measured_at: "2026-11-15T19:55:00.000Z" };
      }
      throw new Error(`unexpected ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter initialEntries={["/perfume?tab=comp"]}><PerfumeDeskPage /></MemoryRouter></ToastProvider></QueryClientProvider>);
    const earn = await screen.findByTestId("perfume-earn-pct");
    fireEvent.change(earn, { target: { value: "20" } });
    fireEvent.blur(earn);
    expect(screen.getByTestId("perfume-apply-status").textContent).toContain("Not applied yet");
    expect(paths.some((p) => p.includes("earn_pct=20"))).toBe(false);
    fireEvent.click(screen.getByTestId("perfume-apply"));
    await waitFor(() => expect(paths.some((p) => p.includes("earn_pct=20"))).toBe(true));
    await waitFor(() => expect(screen.getByTestId("perfume-apply-status").textContent).toContain("✓ Applied"));
    expect(screen.getByTestId("perfume-apply-status").textContent).toContain("Their margin 20%");
    expect(screen.getByTestId("perfume-apply-status").textContent).toContain("1 items recomputed");
  });
});
