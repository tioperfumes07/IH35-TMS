import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useModuleCount } from "../useModuleCount";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "cccccccc-ccc-4ccc-8ccc-cccccccccccc" }),
}));

vi.mock("../../api/listsHub", () => ({
  getListsModuleCount: vi.fn(async () => ({ count: 42 })),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useModuleCount", () => {
  it("returns live count after fetch", async () => {
    const { result } = renderHook(() => useModuleCount("SAFETY"), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(42);
    expect(result.current.error).toBeNull();
  });
});
