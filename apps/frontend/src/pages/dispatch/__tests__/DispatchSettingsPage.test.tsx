import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import {
  DISPATCH_LOCAL_SETTINGS_KEY,
  DispatchSettingsPage,
  dispatchLocalSettingsKey,
} from "../DispatchSettingsPage";
import * as dispatchApi from "../../../api/dispatch";
import { readDispatchBoardDefaultSort } from "../../../lib/dispatch-local-settings";

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
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
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, String(value)),
      },
    });
    window.localStorage.clear();
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

  it("stores browser-local dispatcher settings under the selected company only", async () => {
    const user = userEvent.setup();
    wrap(<DispatchSettingsPage />);
    const yellow = await screen.findByTestId("dispatch-alert-yellow-minutes");
    await user.clear(yellow);
    await user.type(yellow, "12");

    const companyKey = dispatchLocalSettingsKey("91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071");
    expect(JSON.parse(window.localStorage.getItem(companyKey) ?? "{}").alert_yellow_minutes).toBe(12);
    expect(window.localStorage.getItem(DISPATCH_LOCAL_SETTINGS_KEY)).toBeNull();
  });

  it("does not load a legacy global setting into the selected company", async () => {
    window.localStorage.setItem(DISPATCH_LOCAL_SETTINGS_KEY, JSON.stringify({ alert_yellow_minutes: 99 }));
    wrap(<DispatchSettingsPage />);
    expect((await screen.findByTestId("dispatch-alert-yellow-minutes") as HTMLInputElement).value).toBe("1");
  });

  it("maps saved sort options to real board columns and falls back safely", () => {
    const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
    const key = dispatchLocalSettingsKey(companyId);
    window.localStorage.setItem(key, JSON.stringify({ default_sort: "load_number:asc" }));
    expect(readDispatchBoardDefaultSort(companyId)).toEqual({ key: "load", direction: "asc" });

    window.localStorage.setItem(key, JSON.stringify({ default_sort: "rate_total_cents:desc" }));
    expect(readDispatchBoardDefaultSort(companyId)).toEqual({ key: "linehaul", direction: "desc" });

    window.localStorage.setItem(key, JSON.stringify({ default_sort: "not-a-column:sideways" }));
    expect(readDispatchBoardDefaultSort(companyId)).toEqual({ key: "created_at", direction: "desc" });
  });

  // DISP-S34: getDispatchPreferences failing silently fell back to the "home" default with no
  // indication the saved preference never loaded — a swallowed error presented as a settled fact.
  it("names a fetch failure instead of silently defaulting to home", async () => {
    const user = userEvent.setup();
    vi.mocked(dispatchApi.getDispatchPreferences).mockRejectedValueOnce(new Error("boom"));
    wrap(<DispatchSettingsPage />);
    expect(await screen.findByTestId("dispatch-settings-prefs-error")).toBeTruthy();
    const loadsRadio = screen.getByTestId("dispatch-default-view-loads") as HTMLInputElement;
    expect(loadsRadio.disabled).toBe(true);
    await user.click(loadsRadio);
    expect(updateDispatchPreferences).not.toHaveBeenCalled();
  });
});
