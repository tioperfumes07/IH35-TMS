import * as client from "./client";
import {
  acknowledgeQboSyncAlert,
  dismissQboSyncRun,
  listQboSyncRuns,
  retryQboSyncRun,
} from "./qbo-integration";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("qbo-integration Block V sync dashboard client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("listQboSyncRuns passes query params", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ runs: [] } as never);
    await listQboSyncRuns({
      operating_company_id: "co-1",
      status: "failed",
      kind: "invoice_push",
      time_range: "7d",
      search: "timeout",
      limit: 50,
    });
    const url = String(spy.mock.calls[0]?.[0]);
    expect(url).toContain("/api/v1/qbo/sync/runs?");
    expect(url).toContain("operating_company_id=co-1");
    expect(url).toContain("status=failed");
    expect(url).toContain("kind=invoice_push");
    expect(url).toContain("time_range=7d");
    expect(url).toContain("search=timeout");
    expect(url).toContain("limit=50");
  });

  it("retryQboSyncRun POSTs body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await retryQboSyncRun("run-9", "co-1");
    expect(spy).toHaveBeenCalledWith("/api/v1/qbo/sync/runs/run-9/retry", {
      method: "POST",
      body: { operating_company_id: "co-1" },
    });
  });

  it("dismissQboSyncRun POSTs body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await dismissQboSyncRun("run-9", "co-1");
    expect(spy).toHaveBeenCalledWith("/api/v1/qbo/sync/runs/run-9/dismiss", {
      method: "POST",
      body: { operating_company_id: "co-1" },
    });
  });

  it("acknowledgeQboSyncAlert POSTs body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true, id: "a1" } as never);
    await acknowledgeQboSyncAlert("al-1", "co-1", "seen");
    expect(spy).toHaveBeenCalledWith("/api/v1/qbo/sync/alerts/al-1/acknowledge", {
      method: "POST",
      body: { operating_company_id: "co-1", note: "seen" },
    });
  });
});
