// FINDING H5-3 — proves the R2-evidence presence reconcile DETECTS a missing object and ALARMS fail-loud.
import { describe, expect, it, vi } from "vitest";
import {
  reconcileEvidencePresence,
  type EvidenceRef,
  type PresenceReconcileDeps,
} from "./evidence-presence-reconcile.cron.js";

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function ref(id: string, r2Key: string, oci = "91e0bf0a-133f-4ce8-a734-2586cfa66d96"): EvidenceRef {
  return { source: "docs.files", id, r2Key, bucket: "ih35-tms-evidence", operatingCompanyId: oci };
}

function makeDeps(overrides: Partial<PresenceReconcileDeps> = {}): {
  deps: PresenceReconcileDeps;
  raiseAlarm: ReturnType<typeof vi.fn>;
  appendAudit: ReturnType<typeof vi.fn>;
} {
  const raiseAlarm = vi.fn(async () => undefined);
  const appendAudit = vi.fn(async () => undefined);
  const deps: PresenceReconcileDeps = {
    sampleEvidenceRefs: async () => [],
    headObject: async () => true,
    raiseAlarm,
    appendAudit,
    logger: silentLogger,
    ...overrides,
  };
  return { deps, raiseAlarm, appendAudit };
}

describe("reconcileEvidencePresence (H5-3)", () => {
  it("raises a CRITICAL fail-loud alarm + audit when an evidence object is missing in R2", async () => {
    const rows = [ref("a", "org/x/files/a"), ref("b", "org/x/files/b"), ref("c", "org/x/files/c")];
    const { deps, raiseAlarm, appendAudit } = makeDeps({
      sampleEvidenceRefs: async () => rows,
      // "b" is gone from the bucket.
      headObject: async (_bucket, key) => key !== "org/x/files/b",
    });

    const result = await reconcileEvidencePresence(deps, { limit: 10 });

    expect(result.checked).toBe(3);
    expect(result.present).toBe(2);
    expect(result.missing.map((m) => m.r2Key)).toEqual(["org/x/files/b"]);
    expect(result.alarmed).toBe(true);

    // fail-loud: alarm dispatched at CRITICAL and audit recorded.
    expect(raiseAlarm).toHaveBeenCalledTimes(1);
    expect(raiseAlarm.mock.calls[0][0]).toMatchObject({ severity: "critical" });
    expect(appendAudit).toHaveBeenCalledTimes(1);
    expect(appendAudit.mock.calls[0][0]).toBe("critical");
  });

  it("does NOT alarm when every sampled object is present", async () => {
    const { deps, raiseAlarm, appendAudit } = makeDeps({
      sampleEvidenceRefs: async () => [ref("a", "k1"), ref("b", "k2")],
      headObject: async () => true,
    });

    const result = await reconcileEvidencePresence(deps, { limit: 10 });

    expect(result.missing).toHaveLength(0);
    expect(result.present).toBe(2);
    expect(result.alarmed).toBe(false);
    expect(raiseAlarm).not.toHaveBeenCalled();
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it("treats a thrown HEAD as inconclusive (NOT missing) — never cries wolf on a transient error", async () => {
    const { deps, raiseAlarm } = makeDeps({
      sampleEvidenceRefs: async () => [ref("a", "k1"), ref("b", "k2")],
      headObject: async (_bucket, key) => {
        if (key === "k2") throw new Error("network timeout");
        return true;
      },
    });

    const result = await reconcileEvidencePresence(deps, { limit: 10 });

    expect(result.missing).toHaveLength(0);
    expect(result.errored).toHaveLength(1);
    expect(result.alarmed).toBe(false);
    expect(raiseAlarm).not.toHaveBeenCalled();
  });

  it("groups missing objects per operating company and alarms each", async () => {
    const rows = [
      ref("a", "k1", "company-1"),
      ref("b", "k2", "company-2"),
    ];
    const { deps, raiseAlarm } = makeDeps({
      sampleEvidenceRefs: async () => rows,
      headObject: async () => false, // both missing
    });

    const result = await reconcileEvidencePresence(deps, { limit: 10 });

    expect(result.missing).toHaveLength(2);
    expect(raiseAlarm).toHaveBeenCalledTimes(2);
    const companies = raiseAlarm.mock.calls.map((c) => c[0].operatingCompanyId).sort();
    expect(companies).toEqual(["company-1", "company-2"]);
  });

  it("does not throw when sampling fails — returns a skip reason", async () => {
    const { deps, raiseAlarm } = makeDeps({
      sampleEvidenceRefs: async () => {
        throw new Error("db down");
      },
    });

    const result = await reconcileEvidencePresence(deps, { limit: 10 });

    expect(result.checked).toBe(0);
    expect(result.skippedReason).toContain("sample_failed");
    expect(raiseAlarm).not.toHaveBeenCalled();
  });
});
