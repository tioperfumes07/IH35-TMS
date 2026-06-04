import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as driverMessagesApi from "../../../api/driver-messages";
import * as mdataApi from "../../../api/mdata";
import { MessagesInboxPage } from "../MessagesInboxPage";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const driverId = "d1111111-1111-4111-8111-111111111111";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("MessagesInboxPage (A24-10)", () => {
  beforeEach(() => {
    vi.spyOn(driverMessagesApi, "getDriverMessagesInbox").mockResolvedValue({
      conversations: [
        {
          driver_id: driverId,
          driver_name: "Jane Driver",
          latest_message: "Need ETA",
          latest_at: "2026-06-04T12:00:00Z",
          unread_count: 1,
          latest_channel: "in_app",
        },
      ],
    });
    vi.spyOn(driverMessagesApi, "getDriverMessageThread").mockResolvedValue({
      driver_id: driverId,
      messages: [
        {
          id: "msg-1",
          operating_company_id: companyId,
          driver_id: driverId,
          message: "Need ETA",
          channel: "in_app",
          urgency: null,
          created_by: "user-driver",
          created_at: "2026-06-04T12:00:00Z",
          read_at: null,
          read_by: null,
          delivery_status: "delivered",
          delivery_ref: null,
          sender_side: "driver",
          driver_name: "Jane Driver",
        },
      ],
    });
    vi.spyOn(driverMessagesApi, "markDriverMessageRead").mockResolvedValue({
      message: {
        id: "msg-1",
        operating_company_id: companyId,
        driver_id: driverId,
        message: "Need ETA",
        channel: "in_app",
        urgency: null,
        created_by: "user-driver",
        created_at: "2026-06-04T12:00:00Z",
        read_at: "2026-06-04T12:05:00Z",
        read_by: "office-user",
        delivery_status: "delivered",
        delivery_ref: null,
        sender_side: "driver",
      },
    });
    vi.spyOn(mdataApi, "sendDriverProfileMessage").mockResolvedValue({
      id: "msg-2",
      channel: "in_app",
      urgency: null,
      created_at: "2026-06-04T12:10:00Z",
    });
  });

  it("renders inbox conversations", async () => {
    render(wrap(<MessagesInboxPage />));
    expect(await screen.findByText("Jane Driver")).toBeInTheDocument();
    expect(screen.getByText("Need ETA")).toBeInTheDocument();
  });

  it("opens thread when conversation selected", async () => {
    const user = userEvent.setup();
    render(wrap(<MessagesInboxPage />));
    await user.click(await screen.findByTestId(`inbox-conversation-${driverId}`));
    expect(await screen.findByTestId("inbox-thread")).toBeInTheDocument();
    expect(screen.getAllByText("Need ETA").length).toBeGreaterThan(0);
  });

  it("marks driver message read from thread", async () => {
    const user = userEvent.setup();
    render(wrap(<MessagesInboxPage />));
    await user.click(await screen.findByTestId(`inbox-conversation-${driverId}`));
    await user.click(await screen.findByText("Mark read"));
    await waitFor(() => {
      expect(driverMessagesApi.markDriverMessageRead).toHaveBeenCalledWith("msg-1", companyId);
    });
  });

  it("shows send message affordance in thread", async () => {
    const user = userEvent.setup();
    render(wrap(<MessagesInboxPage />));
    await user.click(await screen.findByTestId(`inbox-conversation-${driverId}`));
    expect(await screen.findByTestId("inbox-send-message")).toBeInTheDocument();
  });
});
