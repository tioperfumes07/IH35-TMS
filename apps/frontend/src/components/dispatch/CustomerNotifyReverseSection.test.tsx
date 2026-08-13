import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CustomerNotifyReverseSection } from "./CustomerNotifyReverseSection";

const getCustomerNotifyPreferences = vi.fn().mockResolvedValue({ preferences: { opt_in: true, notify_email: true, notify_sms: false } });
const getCustomerNotifyLog = vi.fn().mockResolvedValue({ entries: [{ id: "log-1" }], count: 1 });
vi.mock("../../api/dispatch", () => ({
  getCustomerNotifyPreferences: (...args: unknown[]) => getCustomerNotifyPreferences(...args),
  getCustomerNotifyLog: (...args: unknown[]) => getCustomerNotifyLog(...args),
}));

describe("CustomerNotifyReverseSection", () => {
  it("queries the exact customer FK and drills to filtered notification preferences", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><CustomerNotifyReverseSection operatingCompanyId="usmca" customerId="customer-1" /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("link", { name: "Manage Notifications" })).toHaveAttribute("href", "/dispatch/notify-preferences?customer_id=customer-1");
    expect(getCustomerNotifyPreferences).toHaveBeenCalledWith("customer-1", "usmca");
    expect(getCustomerNotifyLog).toHaveBeenCalledWith("usmca", "customer-1");
  });
});
