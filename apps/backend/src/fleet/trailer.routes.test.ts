import { describe, expect, it, vi } from "vitest";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";

vi.mock("../auth/db.js", () => ({
  withCurrentUser: vi.fn(),
}));

describe("fleet trailer PATCH audit", () => {
  it("emits before/after diff via buildPatchChanges for patch payloads", () => {
    const oldRow = { vin: "OLD", length_ft: 53, notes: "a" };
    const newRow = { vin: "NEW", length_ft: 53, notes: "b" };
    const patch = { vin: "NEW", notes: "b" };
    const changes = buildPatchChanges(patch, oldRow, newRow);
    expect(changes.vin).toEqual({ from: "OLD", to: "NEW" });
    expect(changes.notes).toEqual({ from: "a", to: "b" });
    expect(changes.length_ft).toBeUndefined();
  });

  it("uses fleet.trailer.updated audit event class on save", async () => {
    const client = { query: vi.fn(async () => ({})) };
    await appendCrudAudit(client, "user-1", "fleet.trailer.updated", {
      resource_id: "eq-1",
      resource_type: "mdata.equipment",
      changes: { vin: { from: "A", to: "B" } },
    });
    const sql = String(client.query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("audit.append_event");
    expect(client.query.mock.calls[0]?.[1]?.[0]).toBe("fleet.trailer.updated");
  });
});
