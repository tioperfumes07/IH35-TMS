import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as reportsApi from "../../api/reports";
import * as schedApi from "../../api/scheduled-reports";
import { ToastProvider } from "../../components/Toast";
import { ScheduleReportModal } from "./ScheduleReportModal";
import { pickCombo } from "../../test-utils/pickCombo";

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
    // GO-0045: getReportLibrary's own catalog can list ids the scheduler can't actually deliver
    // (e.g. "customer-profitability" — no on-demand PDF/xlsx/csv path exists for it). The Report
    // picker must filter those out, so this mock intentionally includes one such non-deliverable id
    // alongside "profit-per-truck-week", which IS one of the 6 SCHEDULABLE_REPORT_IDS.
    vi.spyOn(reportsApi, "getReportLibrary").mockResolvedValue([
      { id: "customer-profitability", name: "Customer profitability", category: "financial", description: "", status: "real" },
      { id: "profit-per-truck-week", name: "Profit per truck (week)", category: "financial", description: "", status: "real" },
    ]);
  });

  it("shows min revenue when profit report selected", async () => {
    // No userEvent here anymore: the report picker is a SelectCombobox, driven via pickCombo (fireEvent).
    const onClose = vi.fn();
    render(
      wrap(
        <ScheduleReportModal open operatingCompanyId="co-1" defaultEmail="me@test.com" onClose={onClose} onCreated={vi.fn()} />,
      ),
    );
    await screen.findByRole("heading", { name: /schedule a report/i });
    const reportSelect = screen.getAllByRole("combobox")[0]!;
    // The control is a `SelectCombobox` (the shared Combobox), NOT a native <select>: its rows exist only
    // while the listbox is OPEN and are addressed by VISIBLE TEXT, not by value. `user.selectOptions(el, id)`
    // therefore threw `Value "…" not found in options`, a message that names the ID and never the widget —
    // so it read as missing DATA rather than a control that changed shape.
    pickCombo(reportSelect, /Profit per truck \(week\)/);
    expect(await screen.findByLabelText(/min revenue/i)).toBeInTheDocument();
  });

  it("GO-0045: report picker excludes a non-deliverable report_id from the library", async () => {
    render(
      wrap(<ScheduleReportModal open operatingCompanyId="co-1" defaultEmail="me@test.com" onClose={vi.fn()} onCreated={vi.fn()} />),
    );
    await screen.findByRole("heading", { name: /schedule a report/i });
    const reportSelect = screen.getAllByRole("combobox")[0]!;
    expect(() => pickCombo(reportSelect, /Customer profitability/)).toThrow(/no option named/);
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
