import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { CreateWOSectionRenderV5Header } from "./CreateWOSectionRenderV5Header";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";

// Avoid a real network call for the Authorized-by user list; the labels must render regardless of data.
vi.mock("../../../api/identity", () => ({ listUsers: () => Promise.resolve({ users: [] }) }));

// GUARD render-guard (false-DONE lesson): prove the render-v5 header fields reach the DOM, not just the
// source file. Mounts the section and asserts each design label is rendered.
function Harness() {
  const form = useForm<CreateWOFormValues>({ defaultValues: { status: "open" } as Partial<CreateWOFormValues> as CreateWOFormValues });
  return <CreateWOSectionRenderV5Header register={form.register} />;
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
});
