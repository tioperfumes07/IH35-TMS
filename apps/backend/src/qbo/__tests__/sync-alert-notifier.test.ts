import { describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({
      query: queryMock,
    }),
}));

vi.mock("../../email/queue.service.js", () => ({
  enqueueEmail: vi.fn(async () => ({ queueId: "queue-1" })),
}));

import { enqueueEmail } from "../../email/queue.service.js";
import { notifyQboSyncDeadLetter } from "../sync-alert-notifier.js";

describe("sync-alert-notifier", () => {
  it("returns throttled when an alert already exists for the company/kind/day", async () => {
    queryMock.mockReset();
    vi.mocked(enqueueEmail).mockClear();

    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({ rows: [{ hit: 1 }] });

    const res = await notifyQboSyncDeadLetter({
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
      kind: "qbo.invoice.push",
      syncRunId: "00000000-0000-4000-8000-000000000099",
      errorMessage: "boom",
    });

    expect(res.sent).toBe(false);
    expect(res.reason).toBe("throttled");
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("enqueues email and inserts throttle row on success", async () => {
    queryMock.mockReset();
    vi.mocked(enqueueEmail).mockClear();

    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await notifyQboSyncDeadLetter({
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
      kind: "qbo.invoice.push",
      syncRunId: "00000000-0000-4000-8000-000000000099",
      errorMessage: "boom",
    });

    expect(res.sent).toBe(true);
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalled();
  });
});
