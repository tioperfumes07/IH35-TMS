import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverrideButton } from "./OverrideButton";

const listOverrideReasons = vi.fn();
let role = "Owner";

vi.mock("../../api/catalogs", () => ({
  listOverrideReasons: (...args: unknown[]) => listOverrideReasons(...args),
}));
vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ user: { role } }) }));
vi.mock("../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "usmca" }) }));

function renderButton(onConfirm: (code: string | null) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OverrideButton context="factoring" onConfirm={onConfirm} />
    </QueryClientProvider>
  );
}

describe("443.294 OverrideButton — nothing to type", () => {
  beforeEach(() => {
    listOverrideReasons.mockReset();
    listOverrideReasons.mockResolvedValue({
      reasons: [{ reason_code: "already_sent", label_en: "Already sent", label_es: "Ya enviado", contexts: ["factoring"], role_only: false }],
    });
  });

  it("Owner: button + Confirm only — no reason list, no text box, onConfirm(null)", async () => {
    role = "Owner";
    const onConfirm = vi.fn();
    renderButton(onConfirm);
    fireEvent.click(screen.getByTestId("override-button"));
    expect(screen.getByTestId("override-button-confirm-only")).toBeTruthy();
    expect(document.querySelector("textarea")).toBeNull();
    fireEvent.click(screen.getByTestId("override-button-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(null));
    expect(listOverrideReasons).not.toHaveBeenCalled();
  });

  it("Dispatcher: the reason list is filtered to the context, and Confirm waits for a pick", async () => {
    role = "Dispatcher";
    const onConfirm = vi.fn();
    renderButton(onConfirm);
    fireEvent.click(screen.getByTestId("override-button"));
    await waitFor(() => expect(listOverrideReasons).toHaveBeenCalledWith("usmca", { context: "factoring" }));
    expect((screen.getByTestId("override-button-confirm") as HTMLButtonElement).disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
