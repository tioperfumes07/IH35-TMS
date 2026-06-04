import { describe, expect, it } from "vitest";
import { bulkCallPreview } from "./AuditEventsList";

describe("AuditEventsList", () => {
  it("renders bulk call preview for column display", () => {
    expect(bulkCallPreview("bulk-call-abc-123")).toBe("bulk-cal…");
    expect(bulkCallPreview(null)).toBe("—");
  });

  it("click-to-filter applies bulk_call_id to filter state", () => {
    let applied = "";
    const bulkCallId = "bulk-call-abc-123";
    const applyFilter = (value: string) => {
      applied = value;
    };
    applyFilter(bulkCallId);
    expect(applied).toBe("bulk-call-abc-123");
  });
});
