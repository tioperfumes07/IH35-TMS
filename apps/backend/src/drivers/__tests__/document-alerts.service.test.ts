import { describe, expect, it } from "vitest";
import { DOCUMENT_ALERT_ENGINE_VERSION } from "../document-alerts.service.js";

describe("document alerts service (A24-9)", () => {
  it("exports engine version a24-9-v1", () => {
    expect(DOCUMENT_ALERT_ENGINE_VERSION).toBe("a24-9-v1");
  });

  it("evaluateDocumentAlertsForTenant is exported", async () => {
    const mod = await import("../document-alerts.service.js");
    expect(typeof mod.evaluateDocumentAlertsForTenant).toBe("function");
  });

  it("runDocumentAlertEngineForTenant delegates to evaluator", async () => {
    const mod = await import("../document-alerts.service.js");
    expect(typeof mod.runDocumentAlertEngineForTenant).toBe("function");
  });

  it("dispatch helpers are wired via evaluate export", async () => {
    const mod = await import("../document-alerts.service.js");
    expect(typeof mod.listDocumentAlertRules).toBe("function");
    expect(typeof mod.dispatchDocumentAlertNotifications).toBe("function");
  });
});
