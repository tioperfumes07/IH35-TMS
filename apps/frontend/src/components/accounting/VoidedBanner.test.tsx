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

  // ROUND 112 CORRECTION (owner, verbatim): "a voider CAN be missing — invoices 13541 and 13572 are
  // voided with a reason and no actor. Render 'voided by — unknown'. Never crash, never hide the
  // stamp, never invent an actor." An earlier cut of this component OMITTED the "by" clause
  // entirely when voidedByUserId was absent, silently dropping the fact the actor is unknown.
  it("renders 'by — unknown' honestly when voidedByUserId is absent — never fabricates a real name", () => {
    renderBanner({ voidedAt: "2026-09-23T15:00:00.000Z", voidReason: "test", voidedByUserId: null });
    expect(screen.getByText("Invoice is VOID")).toBeTruthy();
    expect(screen.getByText((text) => text.includes("by — unknown"))).toBeTruthy();
    expect(getUser).not.toHaveBeenCalled();
  });
});
