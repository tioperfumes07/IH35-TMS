import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import {
  DISPATCH_LOCAL_SETTINGS_KEY,
  DispatchSettingsPage,
} from "../DispatchSettingsPage";

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

const updateDispatchPreferences = vi.fn(async (view: "home" | "loads") => ({
  dispatch_default_view: view,
}));

vi.mock("../../../api/dispatch", () => ({
  getDispatchPreferences: vi.fn(async () => ({ dispatch_default_view: "home" as const })),
  updateDispatchPreferences: (view: "home" | "loads") => updateDispatchPreferences(view),
}));

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DispatchSettingsPage (B21-D11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.removeItem(DISPATCH_LOCAL_SETTINGS_KEY);
  });

  it("renders dispatch settings shell with preference sections", async () => {
    wrap(<DispatchSettingsPage />);
    expect(await screen.findByTestId("dispatch-settings-page")).toBeTruthy();
    expect(screen.getByText("Dispatch settings")).toBeTruthy();
    expect(screen.getByTestId("dispatch-settings-default-view")).toBeTruthy();
    expect(screen.getByTestId("dispatch-settings-default-sort")).toBeTruthy();
    expect(screen.getByTestId("dispatch-settings-alert-thresholds")).toBeTruthy();
    expect(screen.getByTestId("dispatch-settings-auto-routing")).toBeTruthy();
  });

  it("loads default view from dispatch preferences API", async () => {
    wrap(<DispatchSettingsPage />);
    const homeRadio = await screen.findByTestId("dispatch-default-view-home");
    const loadsRadio = screen.getByTestId("dispatch-default-view-loads");
    expect((homeRadio as HTMLInputElement).checked).toBe(true);
    expect((loadsRadio as HTMLInputElement).checked).toBe(false);
  });

  it("persists default view via PATCH when loads is selected", async () => {
    const user = userEvent.setup();
    wrap(<DispatchSettingsPage />);
    const loadsRadio = await screen.findByTestId("dispatch-default-view-loads");
    await user.click(loadsRadio);
    expect(updateDispatchPreferences).toHaveBeenCalledWith("loads");
  });
});
