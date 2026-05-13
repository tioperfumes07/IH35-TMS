import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as homeApi from "../../api/home";
import { AttentionList } from "./AttentionList";

function renderAttentionList(companyId: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AttentionList operatingCompanyId={companyId} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AttentionList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders normalized items from fetchHomeAttentionList", async () => {
    vi.spyOn(homeApi, "fetchHomeAttentionList").mockResolvedValue({
      items: [
        {
          type: "loads_unassigned",
          severity: "warning",
          title: "Loads need review",
          count: 3,
          action_url: "/dispatch",
          action_label: "Open dispatch",
        },
      ],
    });
    renderAttentionList("co-1");
    await waitFor(() => expect(screen.getByText("Loads need review")).toBeInTheDocument());
    expect(screen.getByText(/Count 3/)).toBeInTheDocument();
  });

  it("shows empty message when no countable items", async () => {
    vi.spyOn(homeApi, "fetchHomeAttentionList").mockResolvedValue({
      items: [{ type: "x", severity: "info", title: "Quiet", count: 0, action_url: "/", action_label: "Home" }],
    });
    renderAttentionList("co-1");
    await waitFor(() => expect(screen.getByText("No attention items")).toBeInTheDocument());
  });

  it("shows error state when fetch fails", async () => {
    vi.spyOn(homeApi, "fetchHomeAttentionList").mockRejectedValue(new Error("network"));
    renderAttentionList("co-1");
    await waitFor(() => expect(screen.getByText("Couldn't load attention list")).toBeInTheDocument());
  });
});
