import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegalHomeBoard } from "./LegalHomeBoard";

vi.mock("../../../api/legal-templates", () => ({
  legalTemplatesApi: {
    list: vi.fn().mockResolvedValue({ templates: [] }),
  },
}));

vi.mock("../../../api/legal-contracts", () => ({
  legalContractsApi: {
    list: vi.fn().mockResolvedValue({ contracts: [] }),
  },
}));

vi.mock("../../../api/legal-matters", () => ({
  legalMattersApi: {
    list: vi.fn().mockResolvedValue({ matters: [] }),
  },
}));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter initialEntries={["/legal"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ROUND 8.20 board21 LegalHomeBoard ret", () => {
  afterEach(cleanup);

  it("KPI + pipeline stage links carry ?ret=/legal", async () => {
    render(wrap(<LegalHomeBoard companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" />));
    const kpi = await screen.findByTestId("legal-kpi-active-templates");
    await waitFor(() => expect(kpi.getAttribute("href") ?? "").toContain("ret="));
    expect(decodeURIComponent(kpi.getAttribute("href") ?? "")).toContain("/legal");
    const draft = await screen.findByTestId("legal-pipeline-link-draft");
    expect(draft.getAttribute("href") ?? "").toContain("ret=");
    expect(screen.getByTestId("legal-home-main-grid").className).toContain(
      "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]",
    );
  });
});
