import { describe, expect, it, vi } from "vitest";
import { createLoadWithFullSideEffects, type BookLoadInput } from "../book-load.service.js";
import { updateDispatchLoad } from "../update-load.service.js";
import { requireRecordedTrailerChoice, trailerChoiceShapeRefusal, type TrailerChoice } from "../load-trailer-choice.js";

const company = "5c854333-6ea5-4faa-af31-67cb272fef80";
const id = "11111111-1111-4111-8111-111111111111";

describe("G1 trailer choice cannot bypass the canonical writer", () => {
  for (const source of ["live_feed", "historical_backfill"] as const) {
    it(`refuses missing choice at direct create (${source}) before any database access`, async () => {
      const query = vi.fn(async () => { throw new Error("unexpected database access"); });
      const input = { operating_company_id: company, charges: [], save_mode: "book_dispatch" } as unknown as BookLoadInput;
      await expect(createLoadWithFullSideEffects({ query }, input, { source })).resolves.toMatchObject({
        kind: "error", status: 422, payload: { error: "trailer_choice_required" },
      });
      expect(query).not.toHaveBeenCalled();
    });
  }
  it("refuses an edit of a load without a recorded choice before any write", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT * FROM mdata.loads")) return { rows: [{ id, status: "booked", trailer_source: null }] };
      throw new Error("unexpected query after missing trailer choice");
    });
    await expect(updateDispatchLoad({ query } as never, {
      loadId: id, operatingCompanyId: company, requestingUserUuid: id, fields: { notes: "operator correction" },
    })).rejects.toMatchObject({ code: "trailer_choice_required" });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("refuses unknown choice kinds instead of treating them as no trailer", () => {
    expect(trailerChoiceShapeRefusal({ kind: "unknown" } as unknown as TrailerChoice))
      .toEqual({ error: "trailer_choice_required" });
  });
  it("retains an explicit no-trailer choice without a query", async () => {
    const query = vi.fn();
    expect(await requireRecordedTrailerChoice({ query }, company, id, { trailer_source: "none" })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
  it("retains company history across driver-only assignment and later equipment retirement", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [{ new_trailer_id: id }] }));
    expect(await requireRecordedTrailerChoice({ query } as never, company, id, { trailer_source: "company" })).toBeNull();
    const sql = query.mock.calls[0]?.[0] as unknown as string;
    expect(sql).toContain("h.new_trailer_id IS NOT NULL");
    expect(sql).toContain("h.operating_company_id = $2::uuid");
    expect(sql).not.toContain("deactivated_at");
  });
});
