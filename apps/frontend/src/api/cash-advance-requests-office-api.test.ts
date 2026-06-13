import * as client from "./client";
import { cashAdvanceRequestsOfficeApi } from "./cashAdvanceRequests";
import { beforeEach, describe, expect, it, vi } from "vitest";

const OC = "11111111-1111-4111-8111-111111111111";
const ID = "33333333-3333-4333-8333-333333333333";

describe("cash advance requests office API client (B6 wiring)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("approve POSTs to the OFFICE cascade endpoint (B5 path), not a deduction-only hub path", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ request: {} } as never);
    await cashAdvanceRequestsOfficeApi.approve(OC, ID, { credit_account_id: "acct-9" });
    expect(spy).toHaveBeenCalledTimes(1);
    const [path, opts] = spy.mock.calls[0];
    // The /approve route is the B5 cascade (branch-detect + post), NOT the hub deduction shortcut.
    expect(path).toContain(`/api/v1/driver-finance/cash-advance-requests/${ID}/approve`);
    expect(path).not.toContain("/deduction");
    expect(path).not.toContain("/driver-hub");
    expect(path).toContain(`operating_company_id=${OC}`);
    expect(opts).toMatchObject({ method: "POST", body: { credit_account_id: "acct-9" } });
  });

  it("approve omits credit_account_id when no pay-from is chosen", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ request: {} } as never);
    await cashAdvanceRequestsOfficeApi.approve(OC, ID, { credit_account_id: undefined });
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "POST", body: { credit_account_id: undefined } });
  });

  it("cascadePreview GETs the read-only dry-run endpoint", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({} as never);
    await cashAdvanceRequestsOfficeApi.cascadePreview(OC, ID);
    const [path, opts] = spy.mock.calls[0];
    expect(path).toContain(`/cash-advance-requests/${ID}/cascade-preview`);
    expect(opts).toBeUndefined(); // GET — no method/body
  });

  it("timeline GETs the B4 timeline endpoint", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ timeline: null } as never);
    await cashAdvanceRequestsOfficeApi.timeline(OC, ID);
    const [path, opts] = spy.mock.calls[0];
    expect(path).toContain(`/cash-advance-requests/${ID}/timeline`);
    expect(opts).toBeUndefined();
  });
});
