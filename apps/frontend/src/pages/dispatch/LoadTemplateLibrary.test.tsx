import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { listLoadTemplates } from "../../api/dispatch";
import "../../design/design-tokens.css";
import { LoadTemplatePicker } from "./LoadTemplateLibrary";
import { openCombo } from "../../test-utils/pickCombo";

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
        <MemoryRouter>
          <LoadTemplatePicker operatingCompanyId="00000000-0000-4000-8000-000000000001" onSelectTemplate={onSelect} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(listLoadTemplates).toHaveBeenCalled());
    // The picker is a SelectCombobox (shared Combobox), not a native <select>: its options exist only
    // while the listbox is OPEN. Without this the assertion failed with "Unable to find role=option",
    // which reads as "the templates API returned nothing" rather than "the dropdown is shut".
    openCombo(await screen.findByRole("combobox"));
    expect(await screen.findByRole("option", { name: /DFW → SAT/i })).toBeInTheDocument();
  });
});
