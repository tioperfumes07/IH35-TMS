import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopStatusBar } from "./TopStatusBar";

function setCompactViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  setCompactViewport(false);
});

describe("TopStatusBar QBO sync chrome", () => {
  const baseProps = {
    qboVis: { label: "QBO: connected", dot: "green" as const },
    samsaraVis: { label: "Samsara: OK", dot: "green" as const, title: undefined },
    relayVis: { label: "Relay: OK", dot: "green" as const, title: undefined },
    onOpenQboSyncDashboard: vi.fn(),
    onReconnectQbo: vi.fn(),
    onSyncNow: vi.fn(),
    syncNowPending: false,
  };

  it("shows last-success timestamp and distinct Sync now button when stale", () => {
    const onSyncNow = vi.fn();
    render(
      <TopStatusBar
        {...baseProps}
        onSyncNow={onSyncNow}
        qboSyncPill={{
          dot: "yellow",
          label: "QBO sync · Stale",
          status: "stale",
          needsReconnect: false,
          reconnectReason: null,
          lastSuccessLabel: "Last OK: 7/10, 8:00 AM",
        }}
      />
    );

    expect(screen.getByTestId("qbo-sync-last-success")).toHaveTextContent("Last OK: 7/10, 8:00 AM");
    fireEvent.click(screen.getByTestId("qbo-sync-now-button"));
    expect(onSyncNow).toHaveBeenCalledTimes(1);
  });

  it("shows Reconnect instead of Sync now when token is dead", () => {
    const onReconnectQbo = vi.fn();
    render(
      <TopStatusBar
        {...baseProps}
        onReconnectQbo={onReconnectQbo}
        qboSyncPill={{
          dot: "red",
          label: "QBO sync · Error",
          status: "error",
          needsReconnect: true,
          reconnectReason: "quickbooks_refresh_token_dead",
          lastSuccessLabel: "Last OK: never",
        }}
      />
    );

    expect(screen.queryByTestId("qbo-sync-now-button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Reconnect QuickBooks/i }));
    expect(onReconnectQbo).toHaveBeenCalledTimes(1);
  });
});

describe("StatusBarMobile QBO sync interactions", () => {
  const baseProps = {
    qboVis: { label: "QBO: connected", dot: "green" as const },
    samsaraVis: { label: "Samsara: OK", dot: "green" as const, title: undefined },
    relayVis: { label: "Relay: OK", dot: "green" as const, title: undefined },
    onOpenQboSyncDashboard: vi.fn(),
    onReconnectQbo: vi.fn(),
    onSyncNow: vi.fn(),
    syncNowPending: false,
  };

  it("shows Last OK and runs Sync now from the mobile status popover", () => {
    setCompactViewport(true);
    const onSyncNow = vi.fn();
    render(
      <TopStatusBar
        {...baseProps}
        onSyncNow={onSyncNow}
        qboSyncPill={{
          dot: "yellow",
          label: "QBO sync · Stale",
          status: "stale",
          needsReconnect: false,
          reconnectReason: null,
          lastSuccessLabel: "Last OK: 7/10, 8:00 AM",
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "QBO Sync" }));
    expect(screen.getByRole("dialog", { name: "QBO Sync" })).toHaveTextContent(
      "Last OK: 7/10, 8:00 AM"
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(onSyncNow).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "QBO Sync" })).toBeNull();
  });

  it("shows Syncing without invoking another sync request", () => {
    setCompactViewport(true);
    const onSyncNow = vi.fn();
    render(
      <TopStatusBar
        {...baseProps}
        onSyncNow={onSyncNow}
        syncNowPending
        qboSyncPill={{
          dot: "yellow",
          label: "QBO sync · Syncing",
          status: "syncing",
          needsReconnect: false,
          reconnectReason: null,
          lastSuccessLabel: "Last OK: 7/10, 8:00 AM",
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "QBO Sync" }));
    fireEvent.click(screen.getByRole("button", { name: "Syncing…" }));
    expect(onSyncNow).not.toHaveBeenCalled();
  });

  it("runs dashboard and reconnect actions from the mobile status popover", () => {
    setCompactViewport(true);
    const onOpenQboSyncDashboard = vi.fn();
    const onReconnectQbo = vi.fn();
    render(
      <TopStatusBar
        {...baseProps}
        onOpenQboSyncDashboard={onOpenQboSyncDashboard}
        onReconnectQbo={onReconnectQbo}
        qboSyncPill={{
          dot: "red",
          label: "QBO sync · Error",
          status: "error",
          needsReconnect: true,
          reconnectReason: "quickbooks_refresh_token_dead",
          lastSuccessLabel: "Last OK: never",
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "QBO Sync" }));
    fireEvent.click(screen.getByRole("button", { name: /View sync dashboard/i }));
    expect(onOpenQboSyncDashboard).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "QBO Sync" }));
    fireEvent.click(screen.getByRole("button", { name: "Reconnect QuickBooks" }));
    expect(onReconnectQbo).toHaveBeenCalledTimes(1);
  });
});
