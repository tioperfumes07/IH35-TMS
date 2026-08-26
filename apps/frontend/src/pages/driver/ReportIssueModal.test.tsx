import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { ReportIssueModal } from "./ReportIssueModal";

describe("ReportIssueModal", () => {
  it("renders when open", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <ReportIssueModal open onClose={() => {}} />
        </I18nextProvider>
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/Submit report|Enviar reporte/i)).toBeTruthy();
    });
  });
});
