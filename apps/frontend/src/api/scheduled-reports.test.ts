import * as client from "./client";
import {
  createScheduledReport,
  deleteScheduledReport,
  listScheduledReports,
  pauseScheduledReport,
  resumeScheduledReport,
  sendScheduledReportNow,
  testSendScheduledReport,
  updateScheduledReport,
} from "./scheduled-reports";
import { beforeEach, describe, expect, it, vi } from "vitest";

const samplePayload = {
  operating_company_id: "co-1",
  report_id: "ar-aging",
  parameters: { range: { type: "rolling" } },
  frequency: { kind: "daily" as const, time_local: "07:00" },
  recipients: ["a@b.com"],
  format: "pdf" as const,
  subject_template: "{report_name}",
};

describe("scheduled-reports API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("listScheduledReports GETs with operating company", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ rows: [] } as never);
    await listScheduledReports("co-1");
    expect(spy).toHaveBeenCalledWith("/api/v1/scheduled-reports?operating_company_id=co-1");
  });

  it("createScheduledReport POSTs JSON body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ id: "new" } as never);
    await createScheduledReport(samplePayload);
    expect(spy).toHaveBeenCalledWith("/api/v1/scheduled-reports", { method: "POST", body: samplePayload });
  });

  it("updateScheduledReport PATCHes", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await updateScheduledReport("s1", { operating_company_id: "co-1", format: "csv" });
    expect(spy).toHaveBeenCalledWith("/api/v1/scheduled-reports/s1", {
      method: "PATCH",
      body: { operating_company_id: "co-1", format: "csv" },
    });
  });

  it("pauseScheduledReport POSTs", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await pauseScheduledReport("s1", "co-1");
    expect(spy).toHaveBeenCalledWith("/api/v1/scheduled-reports/s1/pause", {
      method: "POST",
      body: { operating_company_id: "co-1" },
    });
  });

  it("resumeScheduledReport POSTs", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await resumeScheduledReport("s1", "co-1");
    expect(spy).toHaveBeenCalledWith("/api/v1/scheduled-reports/s1/resume", {
      method: "POST",
      body: { operating_company_id: "co-1" },
    });
  });

  it("sendScheduledReportNow POSTs", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await sendScheduledReportNow("s1", "co-1");
    expect(spy).toHaveBeenCalledWith("/api/v1/scheduled-reports/s1/send-now", {
      method: "POST",
      body: { operating_company_id: "co-1" },
    });
  });

  it("deleteScheduledReport DELETEs with query string", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await deleteScheduledReport("s1", "co-1");
    expect(spy).toHaveBeenCalledWith("/api/v1/scheduled-reports/s1?operating_company_id=co-1", { method: "DELETE" });
  });

  it("testSendScheduledReport POSTs to test-send", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await testSendScheduledReport("co-1", samplePayload);
    expect(spy).toHaveBeenCalledWith("/api/v1/scheduled-reports/test-send?operating_company_id=co-1", {
      method: "POST",
      body: samplePayload,
    });
  });
});
