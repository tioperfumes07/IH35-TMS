import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { SendContractModal } from "./SendContractModal";
import { legalTemplatesApi } from "../../../api/legal-templates";
import { ToastProvider } from "../../../components/Toast";

// LEGAL-F6250 — the "Fill variables" step's row-level React key was derived from row.key, which
// is also the live value the row's own "variable_name" input writes on every keystroke. That
// remounted the input on every keystroke and dropped focus, silently truncating anything typed
// past the first character. This test types a multi-character string into that field and asserts
// the full string survives — it must FAIL on the buggy `key={`${row.key}-${index}`}` shape and
// PASS on the fixed `key={index}` shape.
vi.mock("../../../api/legal-templates", () => ({
  legalTemplatesApi: {
    list: vi.fn(),
  },
}));

vi.mock("../../../api/legal-contracts", () => ({
  legalContractsApi: {
    create: vi.fn(),
  },
}));

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SendContractModal
          open
          operatingCompanyId="test-company"
          onClose={() => {}}
          onSent={() => {}}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("SendContractModal — Fill variables step", () => {
  it("preserves the full variable name typed, not just the first character", async () => {
    vi.mocked(legalTemplatesApi.list).mockResolvedValue({
      templates: [
        {
          id: "tmpl-1",
          template_code: "driver_hire_agreement",
          version: 1,
          display_name_en: "Driver Services and Hiring Agreement",
          display_name_es: "Acuerdo de Servicios y Contratación del Conductor",
          category: "driver",
          requires_witness: false,
          status: "active",
          submitted_for_review_at: null,
          attorney_approved_by: null,
          attorney_bar_number: null,
          attorney_approved_at: null,
          activated_at: null,
          retired_at: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    } as never);

    const user = userEvent.setup();
    renderModal();

    // Step 1: pick template via the SelectCombobox (Combobox-style: click to open, click option)
    const templateCombobox = (await screen.findAllByRole("combobox"))[0];
    await user.click(templateCombobox);
    await user.click(await screen.findByText(/Driver Services and Hiring Agreement/));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 2: pick signer — name + email required to advance
    await user.type(await screen.findByPlaceholderText("Full legal name"), "CC3 Test Signer");
    await user.type(screen.getByPlaceholderText("name@example.com"), "cc3-test@example.invalid");
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 3: Fill variables — add a row and type a multi-character variable name
    await user.click(await screen.findByRole("button", { name: "+ Create Variable" }));
    const nameInput = screen.getByPlaceholderText("variable_name");
    await user.type(nameInput, "driver_name");

    expect(nameInput).toHaveValue("driver_name");
  });
});
