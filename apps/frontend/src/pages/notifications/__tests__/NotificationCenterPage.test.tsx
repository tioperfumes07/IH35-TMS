import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as notificationsHook from "../../../hooks/useNotifications";
import { NotificationCenterPage } from "../NotificationCenterPage";

describe("NotificationCenterPage", () => {
  beforeEach(() => {
    vi.spyOn(notificationsHook, "useNotifications").mockReturnValue({
      notifications: [
        {
          id: "n1",
          type: "maintenance_alert",
          severity: "medium",
          title: "PM due",
          body: "Schedule service",
          action_link: "/fleet/units/u1",
          entity_type: "unit",
          entity_id: "u1",
          source_block: "maintenance_pm",
          read_at: null,
          dismissed_at: null,
          created_at: "2026-06-02T12:00:00Z",
        },
      ],
      unreadCount: 1,
      loading: false,
      refresh: vi.fn(),
      markRead: vi.fn(),
      dismiss: vi.fn(),
      markAllRead: vi.fn(),
    });
    vi.spyOn(notificationsHook, "fetchNotificationPreferences").mockResolvedValue({
      preferences: {
        id: "p1",
        user_id: "u1",
        channels_per_type: { compliance: ["in_app", "email"] },
        quiet_hours_start: null,
        quiet_hours_end: null,
        email_digest_enabled: false,
        email_digest_frequency: null,
        updated_at: "2026-06-02T12:00:00Z",
      },
    });
  });

  it("renders notification center with preferences panel", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <NotificationCenterPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByTestId("notification-center-page")).toBeTruthy();
    expect(screen.getByTestId("notification-preferences-panel")).toBeTruthy();
    expect(screen.getByText("PM due")).toBeTruthy();
  });
});
