import { describe, it, expect, vi } from "vitest";
import { insertRetainedEarningsClosingJournalIfNeeded } from "./period-close-retained-earnings.service.js";

describe("period close retained earnings", () => {
  it("skips JE insert when period_end is not fiscal year-end", async () => {
    const client = { query: vi.fn() };
    const jeId = await insertRetainedEarningsClosingJournalIfNeeded(client as never, {
      operating_company_id: "00000000-0000-4000-8000-000000000001",
      period_start: "2026-01-01",
      period_end: "2026-06-30",
      fiscal_year: 2026,
      closer_user_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(jeId).toBeNull();
    expect(client.query).not.toHaveBeenCalled();
  });
});
