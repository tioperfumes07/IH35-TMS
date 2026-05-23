import { describe, expect, it, vi } from "vitest";

vi.mock("../dashcam.service.js", () => ({
  fetchSamsaraClipUrlForCompany: vi.fn(async () => "https://clips.example/test.mp4"),
  insertDashcamClip: vi.fn(async () => "clip-row-id"),
}));

import { processDashcamAutoLinkFromWebhook } from "../dashcam-auto-link.service.js";

describe("dashcam auto-link harsh event", () => {
  it("creates clip rows when harsh event + clip id are present", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
        if (sql.includes("FROM safety.harsh_events")) return { rows: [{ id: "harsh-id-1" }] };
        return { rows: [] };
      }),
    };
    const inserted = await processDashcamAutoLinkFromWebhook(client as never, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      occurred_at: "2026-05-24T00:00:00.000Z",
      payload: {
        harsh_events: [{ id: "evt-1", clip_id: "clip-1" }],
      },
    });
    expect(inserted).toBe(1);
  });
});
