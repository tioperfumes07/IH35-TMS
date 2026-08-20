import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { CreateWOSectionRenderV5Header } from "./CreateWOSectionRenderV5Header";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";

// Avoid a real network call for the Authorized-by user list; the labels must render regardless of data.
vi.mock("../../../api/identity", () => ({
  listUsers: () => Promise.resolve({ users: [] }),
  listAssignableUsers: () => Promise.resolve({ users: [{ id: "user-1", name: "Alex Mechanic", email: "alex@example.com" }] }),
}));

// The Authorized-by picker now scopes listAssignableUsers by operatingCompanyId (multi-tenant
// correctness — an unscoped roster could leak assignable users across companies), which needs
// useCompanyContext(); this harness doesn't mount a real CompanyProvider tree.
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

// GUARD render-guard (false-DONE lesson): prove the render-v5 header fields reach the DOM, not just the
// source file. Mounts the section and asserts each design label is rendered.
function Harness() {
  const form = useForm<CreateWOFormValues>({ defaultValues: { status: "open" } as Partial<CreateWOFormValues> as CreateWOFormValues });
  return <CreateWOSectionRenderV5Header register={form.register} watch={form.watch} setValue={form.setValue} />;
}

describe("CreateWOSectionRenderV5Header — render-v5 header fields render", () => {
  it("renders Status, Open date/time, Authorized by, Repaired by, Authorization #, Service location", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    );

    for (const label of [
      "Status",
      "Open date",
      "Open time",
      "Authorized by employees",
      "Repaired by",
      "Authorization #",
      "Service location (mobile / roadside)",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId("wo-renderv5-header")).toBeInTheDocument();
  });

  it("renders Authorized by as a searchable employee picker", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    );

    const authorizedBy = screen.getByRole("combobox", { name: "Authorized by employees" });
    expect(authorizedBy).toHaveAttribute("aria-autocomplete", "list");
    await user.click(authorizedBy);
    expect(await screen.findByText("Alex Mechanic")).toBeInTheDocument();
  });
});
