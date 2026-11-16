import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { EquipmentTypesPage } from "./EquipmentTypesPage";

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

// A child (the shared reason modal) reads the selected company; the app always renders it inside CompanyProvider.
vi.mock("../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "co-1" }),
}));

vi.mock("../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams()],
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isLoading: false,
    data: [
      {
        id: "active-1",
        code: "DRY_VAN",
        name: "Dry Van",
        description: null,
        is_active: true,
        sort_order: 10,
        deactivated_at: null,
        line_items: [],
      },
      {
        id: "archived-1",
        code: "DRY-VAN",
        name: "Dry Van",
        description: null,
        is_active: false,
        sort_order: 10,
        deactivated_at: "2026-06-01T00:00:00.000Z",
        line_items: [],
      },
    ],
  }),
  useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

describe("EquipmentTypesPage", () => {
  it("does not render archived equipment types", () => {
    render(
      <MemoryRouter>
        <EquipmentTypesPage />
      </MemoryRouter>
    );
    expect(screen.getByText("DRY_VAN")).toBeInTheDocument();
    expect(screen.queryByText("DRY-VAN")).not.toBeInTheDocument();
  });
});
