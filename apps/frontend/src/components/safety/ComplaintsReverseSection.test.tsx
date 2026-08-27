import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComplaintsReverseSection } from "./ComplaintsReverseSection";

const getComplaints = vi.fn();
let role = "Safety";

vi.mock("../../api/safety", () => ({
  getComplaints: (...args: unknown[]) => getComplaints(...args),
}));
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role } }),
}));

function renderSection(filter: { customer_id: string } | { user_id: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ComplaintsReverseSection operatingCompanyId="usmca" filter={filter} contextLabel="this record" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ComplaintsReverseSection", () => {
  beforeEach(() => {
    role = "Safety";
    getComplaints.mockReset();
    getComplaints.mockResolvedValue({
      complaints: [{ id: "complaint-1", summary: "Late delivery complaint", status: "open", filed_at: "2026-08-12T12:00:00Z" }],
      total_count: 1,
    });
  });

  it("uses the exact customer filter and drills to the highlighted complaint", async () => {
    renderSection({ customer_id: "customer-1" });
    const link = await screen.findByRole("link", { name: "Late delivery complaint" });
    expect(link.getAttribute("href")).toBe("/safety/complaints?complaint_id=complaint-1");
    expect(getComplaints).toHaveBeenCalledWith("usmca", { customer_id: "customer-1", limit: 25, offset: 0 });
  });

  it("uses the exact employee filter across complainant and respondent roles", async () => {
    renderSection({ user_id: "user-1" });
    await screen.findByRole("link", { name: "Late delivery complaint" });
    expect(getComplaints).toHaveBeenCalledWith("usmca", { user_id: "user-1", limit: 25, offset: 0 });
  });

  it("does not request or reveal complaints to an unauthorized role", () => {
    role = "Dispatcher";
    const view = renderSection({ user_id: "user-1" });
    expect(view.container).toBeEmptyDOMElement();
    expect(getComplaints).not.toHaveBeenCalled();
  });
});
