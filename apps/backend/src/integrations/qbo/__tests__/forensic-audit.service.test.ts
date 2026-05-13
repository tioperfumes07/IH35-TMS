import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWithLuciaBypass = vi.fn();

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: (fn: (client: unknown) => Promise<unknown>) => mockWithLuciaBypass(fn),
}));

import { auditBatchEvent, auditForensicImportError } from "../forensic-audit.service.js";

describe("forensic-audit.service", () => {
  beforeEach(() => {
    mockWithLuciaBypass.mockReset();
  });

  it("critical auditBatchEvent logs via Fastify logger and does not throw on INSERT failure", async () => {
    mockWithLuciaBypass.mockRejectedValue(new Error("simulated_check_violation"));
    const error = vi.fn();
    await expect(
      auditBatchEvent(
        "b177729f-b0d9-40d1-a536-5a31b51caeb3",
        "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
        "forensic_import_error",
        { error_message: "x" },
        { critical: true, logger: { error } as never }
      )
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "b177729f-b0d9-40d1-a536-5a31b51caeb3",
        eventType: "forensic_import_error",
        err: expect.any(Error),
      }),
      "forensic audit insert failed"
    );
  });

  it("critical auditForensicImportError falls back to console.error when logger omitted", async () => {
    mockWithLuciaBypass.mockRejectedValue(new Error("db_unreachable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      auditForensicImportError(
        "b177729f-b0d9-40d1-a536-5a31b51caeb3",
        "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
        new Error("orig"),
        { phase: "runner", step: "cron_import_failed" }
      )
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("[forensic audit insert failed]", expect.any(Object));
    spy.mockRestore();
  });

  it("auditForensicImportError resolves normally so caller counter paths can continue", async () => {
    mockWithLuciaBypass.mockRejectedValue(new Error("audit_append_failed"));
    await expect(
      auditForensicImportError(
        "b177729f-b0d9-40d1-a536-5a31b51caeb3",
        "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
        new Error("worker failure"),
        { phase: "transactions", step: "transaction_page_process_failed", entity_type: "Purchase" }
      )
    ).resolves.toBeUndefined();
  });
});
