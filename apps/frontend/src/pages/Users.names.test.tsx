// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/Toast";
import { UsersPage } from "./Users";

expect.extend(jestDomMatchers);
afterEach(() => cleanup());

const listUsersMock = vi.fn();

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({
    user: { role: "Owner", uuid: "81111181-1111-4111-8111-111111111111" },
    session: null,
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
    companies: [],
    setSelectedCompanyId: vi.fn(),
  }),
}));

vi.mock("../api/identity", async () => {
  const actual = await vi.importActual<typeof import("../api/identity")>("../api/identity");
  return { ...actual, listUsers: (...args: unknown[]) => listUsersMock(...args) };
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const base = { role: "Dispatcher", created_at: "2026-10-01T00:00:00Z", deactivated_at: null, last_login_at: null };

describe("Users master-detail labels (row 233 / D057)", () => {
  it("HUGO GAYTAN → Hugo Gaytan; blank-name users show their email, not a repeated generic User label", async () => {
    listUsersMock.mockResolvedValue({
      users: [
        { ...base, id: "a1111111-1111-4111-8111-111111111111", name: "HUGO GAYTAN", email: "hugo@ih35trucking.net" },
        { ...base, id: "a2222222-2222-4222-8222-222222222222", name: "", email: "ops@ih35trucking.net" },
        { ...base, id: "a3333333-3333-4333-8333-333333333333", name: "", email: "billing@ih35trucking.net" },
      ],
      total_count: 3,
    });
    render(wrap(<UsersPage />));
    expect((await screen.findAllByText("Hugo Gaytan")).length).toBeGreaterThan(0);
    expect(screen.queryByText("HUGO GAYTAN")).toBeNull();
    expect(screen.getAllByText("ops@ih35trucking.net").length).toBeGreaterThan(0);
    expect(screen.getAllByText("billing@ih35trucking.net").length).toBeGreaterThan(0);
    expect(screen.queryByText("User — not visible")).toBeNull();
    expect(screen.queryByText("Ops@ih35trucking.net")).toBeNull();
  });
});
