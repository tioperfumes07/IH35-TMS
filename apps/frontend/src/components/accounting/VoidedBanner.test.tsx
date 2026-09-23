import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoidedBanner } from "./VoidedBanner";

const getUser = vi.fn();
vi.mock("../../api/identity", () => ({ getUser: (...args: unknown[]) => getUser(...args) }));

function renderBanner(props: Partial<ComponentProps<typeof VoidedBanner>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VoidedBanner voidedAt={null} documentLabel="Invoice" {...props} />
    </QueryClientProvider>,
  );
}

describe("VoidedBanner", () => {
  beforeEach(() => getUser.mockReset());

  it("renders nothing for a live document", () => {
    const { container } = renderBanner({ voidedAt: null });
    expect(container.textContent).toBe("");
  });

  // R-102-B item 1 (THE STAMP): VOIDED, the reason in words, who voided it, when — in Central Time.
  it("renders the void stamp in Central Time with the reason, never a raw voided_by_user_id uuid", async () => {
    getUser.mockResolvedValue({ id: "u-1", name: "Maria Lopez", email: "maria@ih35.example" });
    renderBanner({
      voidedAt: "2026-09-23T15:00:00.000Z",
      voidReason: "duplicate entry",
      voidedByUserId: "u-1",
      documentLabel: "Invoice",
    });
    expect(screen.getByText("Invoice is VOID")).toBeTruthy();
    expect(await screen.findByText((text) => text.includes("by Maria Lopez"))).toBeTruthy();
    expect(screen.getByText((text) => text.includes("duplicate entry"))).toBeTruthy();
    expect(screen.getByText((text) => text.includes("CT"))).toBeTruthy();
    expect(screen.queryByText((text) => text.includes("u-1"))).toBeNull();
    expect(getUser).toHaveBeenCalledWith("u-1");
  });

  // Never fabricates an actor: a family whose write path doesn't populate voided_by_user_id (or one
  // still mid-migration) must render the stamp with no "by <name>" clause, not a guess or a blank name.
  it("omits the 'by' clause honestly when voidedByUserId is absent — never fabricates an actor", () => {
    renderBanner({ voidedAt: "2026-09-23T15:00:00.000Z", voidReason: "test", voidedByUserId: null });
    expect(screen.getByText("Invoice is VOID")).toBeTruthy();
    expect(screen.queryByText((text) => text.includes(" by "))).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });
});
