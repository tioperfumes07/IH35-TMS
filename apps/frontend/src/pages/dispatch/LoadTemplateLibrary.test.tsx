import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { listLoadTemplates } from "../../api/dispatch";
import "../../design/design-tokens.css";
import { LoadTemplatePicker } from "./LoadTemplateLibrary";

vi.mock("../../api/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/dispatch")>();
  return {
    ...actual,
    listLoadTemplates: vi.fn().mockResolvedValue({
      templates: [
        { id: "tpl-1", name: "DFW → SAT", template_json: { customer_id: "c1" }, created_at: "", updated_at: "" },
      ],
    }),
  };
});

describe("LoadTemplatePicker (P5-T21)", () => {
  it("lists templates from API", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onSelect = vi.fn();
    render(
      <QueryClientProvider client={qc}>
        <LoadTemplatePicker operatingCompanyId="00000000-0000-4000-8000-000000000001" onSelectTemplate={onSelect} />
      </QueryClientProvider>
    );
    await waitFor(() => expect(listLoadTemplates).toHaveBeenCalled());
    expect(await screen.findByRole("option", { name: /DFW → SAT/i })).toBeInTheDocument();
  });
});
