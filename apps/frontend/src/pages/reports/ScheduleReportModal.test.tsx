import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as reportsApi from "../../api/reports";
import * as schedApi from "../../api/scheduled-reports";
import { ToastProvider } from "../../components/Toast";
import { ScheduleReportModal } from "./ScheduleReportModal";

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("ScheduleReportModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(reportsApi, "getReportLibrary").mockResolvedValue([
      { id: "customer-profitability", name: "Customer profitability", category: "financial", description: "", status: "real" },
    ]);
  });

  it("shows min revenue when profit report selected", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      wrap(
        <ScheduleReportModal open operatingCompanyId="co-1" defaultEmail="me@test.com" onClose={onClose} onCreated={vi.fn()} />,
      ),
    );
    await screen.findByRole("heading", { name: /schedule a report/i });
    const reportSelect = screen.getAllByRole("combobox")[0]!;
    await user.selectOptions(reportSelect, "customer-profitability");
    expect(await screen.findByLabelText(/min revenue/i)).toBeInTheDocument();
  });

  it("cron toggle switches payload shape on save", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(schedApi, "createScheduledReport").mockResolvedValue({ id: "n1" });
    render(
      wrap(
        <ScheduleReportModal open operatingCompanyId="co-1" defaultEmail="me@test.com" onClose={vi.fn()} onCreated={vi.fn()} />,
      ),
    );
    await screen.findByRole("heading", { name: /schedule a report/i });
    await user.click(screen.getByRole("checkbox", { name: /advanced \(cron\)/i }));
    await user.click(screen.getByRole("button", { name: /save schedule/i }));
    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const body = createSpy.mock.calls[0]![0];
    expect(body.frequency.kind).toBe("cron");
    expect(body.frequency.cron).toBeTruthy();
  });

  it("test send invokes API", async () => {
    const user = userEvent.setup();
    const testSpy = vi.spyOn(schedApi, "testSendScheduledReport").mockResolvedValue({ ok: true });
    render(
      wrap(
        <ScheduleReportModal open operatingCompanyId="co-1" defaultEmail="me@test.com" onClose={vi.fn()} onCreated={vi.fn()} />,
      ),
    );
    await screen.findByRole("heading", { name: /schedule a report/i });
    await user.click(screen.getByRole("button", { name: /test send/i }));
    await waitFor(() => expect(testSpy).toHaveBeenCalled());
  });
});
