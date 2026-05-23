import { describe, expect, it, vi } from "vitest";

vi.mock("../dashcam.service.js", () => ({
  fetchSamsaraClipUrlForCompany: vi.fn(async () => "https://clips.example/test.mp4"),
  insertDashcamClip: vi.fn(async () => "clip-row-id"),
}));

import { processDashcamAutoLinkFromWebhook } from "../dashcam-auto-link.service.js";

describe("dashcam clips tenant isolation", () => {
  it("filters harsh lookup by operating_company_id", async () => {
    const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
        if (sql.includes("FROM safety.harsh_events")) return { rows: [{ id: "harsh-id-1" }] };
        return { rows: [] };
      }),
    };
    await processDashcamAutoLinkFromWebhook(client as never, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      occurred_at: "2026-05-24T00:00:00.000Z",
      payload: {
        harsh_events: [{ id: "evt-1", clip_id: "clip-1" }],
      },
    });
    const lookup = calls.find((c) => c.sql.includes("FROM safety.harsh_events"));
    expect(lookup?.sql).toContain("operating_company_id = $1::uuid");
    expect(lookup?.values?.[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
