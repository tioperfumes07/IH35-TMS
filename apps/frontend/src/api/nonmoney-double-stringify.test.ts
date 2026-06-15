import * as client from "./client";
import { createComplianceRule } from "./compliance";
import { updateDocumentAlertRule, acknowledgeDocumentAlert } from "./document-alerts";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression (sibling of the task-create + money-path sweeps): these api clients must pass a RAW OBJECT
// body to apiRequest (which performs the single JSON.stringify). A pre-stringified body double-encodes to
// '"{...}"' and the server rejects with 400 "expected object, received string".
describe("non-money api clients send a raw object body (double-stringify regression)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("createComplianceRule POSTs a raw object body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ rule: {} } as never);
    const payload = { rule_name: "CDL expiry", days_before_expiry: [30, 7] };
    await createComplianceRule(payload);
    const [path, options] = spy.mock.calls[0];
    expect(path).toBe("/api/v1/compliance/notification-rules");
    expect(options?.method).toBe("POST");
    expect(typeof options?.body).toBe("object");
    expect(options?.body).toEqual(payload);
  });

  it("updateDocumentAlertRule PATCHes a raw object body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ document_alert_rule: {} } as never);
    await updateDocumentAlertRule("rule-1", "co-1", { enabled: false });
    const [, options] = spy.mock.calls[0];
    expect(options?.method).toBe("PATCH");
    expect(typeof options?.body).toBe("object");
    expect(options?.body).toEqual({ enabled: false });
  });

  it("acknowledgeDocumentAlert POSTs a raw object body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ event: { id: "e1" } } as never);
    await acknowledgeDocumentAlert("evt-1", "co-1", "seen");
    const [, options] = spy.mock.calls[0];
    expect(typeof options?.body).toBe("object");
    expect(options?.body).toEqual({ note: "seen" });
  });
});
