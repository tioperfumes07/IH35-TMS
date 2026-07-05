import { describe, expect, it, vi, beforeEach } from "vitest";

// SWL-2: a failed local-count query must surface as an error/drift state (logged), NOT a silent
// count=0 that reads as "in sync". Mock the structured logger so we can assert it fired.
const { errorMock } = vi.hoisted(() => ({ errorMock: vi.fn() }));
vi.mock("../../observability/structured-logger.js", () => ({
  logger: { error: (...a: unknown[]) => errorMock(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { verifyQboMirror } from "./mirror-integrity.service.js";

describe("SWL-2 qbo mirror-integrity — count failure surfaces error, not silent in-sync", () => {
  beforeEach(() => errorMock.mockClear());

  it("a failing count query is flagged count_error + drift_detected and logged (never a false 0/in-sync)", async () => {
    // Fail the FIRST entity's count; succeed for the rest with a real count.
    let call = 0;
    const client = {
      query: async () => {
        call += 1;
        if (call === 1) throw new Error("permission denied for relation mdata.qbo_customers");
        return { rows: [{ cnt: "10" }] };
      },
    };

    const rows = await verifyQboMirror(client, "oci");
    expect(rows.length).toBe(5);

    const failed = rows[0];
    expect(failed.count_error).toBe(true);
    // The whole point: an errored count is NOT reported as "in sync".
    expect(failed.drift_detected).toBe(true);

    // The failure was logged with context, not swallowed.
    expect(errorMock).toHaveBeenCalledTimes(1);
    const [, , ctx] = errorMock.mock.calls[0];
    expect(ctx).toMatchObject({ company_id: "oci", entity: "customers", surface: "qbo.verifyQboMirror" });

    // The succeeding entities carry no error flag (genuine data path unchanged).
    for (const r of rows.slice(1)) expect(r.count_error).toBeUndefined();
  });

  it("a genuine 0 count is NOT flagged as an error (dormant-zero vs failure distinction)", async () => {
    const client = { query: async () => ({ rows: [{ cnt: "0" }] }) };
    const rows = await verifyQboMirror(client, "oci");
    for (const r of rows) expect(r.count_error).toBeUndefined();
    expect(errorMock).not.toHaveBeenCalled();
  });
});
