import { beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  recordDocumentMilesSources: vi.fn(),
  setMilesChoice: vi.fn(),
  milesRecommendationsForLoad: vi.fn(),
}));

vi.mock("../../dispatch/mileage/miles-recommendations.service.js", async (orig) => {
  const real = await orig<typeof import("../../dispatch/mileage/miles-recommendations.service.js")>();
  return { ...real, ...engine };
});

import { MilesChoiceError } from "../../dispatch/mileage/miles-recommendations.service.js";
import { applyCreatorMilesChoices, CreatorMilesChoiceError } from "../settlement-creator-miles-choice.js";

const field = (value: number | null, source: string | null, h: number | null, g: number | null) => ({
  current: value == null ? null : { value, source, chosen_by: "u", chosen_at: "t", reason: null },
  historical: h == null ? null : { value: h, n_loads: 3, min: null, max: null, last_seen: null, confidence: "high", autofill_allowed: true, untrustworthy_reason: null },
  historical_missing_reason: null,
  google: g == null ? null : { value: g, fetched_at: "2026-10-11" },
  google_missing_reason: null,
  difference: null,
  default_source: "document",
});
const recs = (short: [number, string]) => ({
  load_id: "L1",
  fields: { practical: field(520, "document", 509, 515), short: field(short[0], short[1], 498, 515), empty: field(40, "document", null, 42) },
});
const args = (choice: Record<string, unknown> | null) => ({
  operatingCompanyId: "co",
  actorUserId: "u",
  loads: [{ loadId: "L1", loadNumber: "13530", choice: choice as never }],
});

beforeEach(() => {
  vi.clearAllMocks();
  engine.recordDocumentMilesSources.mockResolvedValue({ recorded: ["practical", "short", "empty"] });
  engine.milesRecommendationsForLoad.mockResolvedValue(recs([500, "document"]));
  engine.setMilesChoice.mockResolvedValue(recs([515, "google"]));
});

describe("Lead 443.57 — the Creator applies the load's miles choice through CC-2's engine only", () => {
  it("no choice: every field is recorded as 'document' and nothing else is written", async () => {
    const out = await applyCreatorMilesChoices({} as never, args(null));
    expect(engine.recordDocumentMilesSources).toHaveBeenCalledWith({}, { operatingCompanyId: "co", loadId: "L1", actorUserId: "u" });
    expect(engine.setMilesChoice).not.toHaveBeenCalled();
    expect(out[0]!.fields.short).toEqual({ value: 500, source: "document", historical: 498, google: 515 });
  });

  it("an explicit 'document' choice is the same as no choice", async () => {
    await applyCreatorMilesChoices({} as never, args({ short: { source: "document" } }));
    expect(engine.setMilesChoice).not.toHaveBeenCalled();
  });

  it("Google for Short: the engine writes that one field; the result carries its value and source", async () => {
    const out = await applyCreatorMilesChoices({} as never, args({ short: { source: "google" } }));
    expect(engine.setMilesChoice).toHaveBeenCalledTimes(1);
    expect(engine.setMilesChoice.mock.calls[0]![1]).toMatchObject({ loadId: "L1", field: "short", source: "google", manualValue: null });
    expect(out[0]!.fields.short).toEqual({ value: 515, source: "google", historical: 498, google: 515 });
  });

  it("Manual passes the value and the reason to the engine", async () => {
    await applyCreatorMilesChoices({} as never, args({ practical: { source: "manual", manual_value: 530, reason: "driver detoured around I-35 closure" } }));
    expect(engine.setMilesChoice.mock.calls[0]![1]).toMatchObject({ field: "practical", source: "manual", manualValue: 530, reason: "driver detoured around I-35 closure" });
  });

  it("an engine refusal becomes a Creator refusal naming the load and the field", async () => {
    engine.setMilesChoice.mockRejectedValueOnce(new MilesChoiceError("google_has_no_value_for_empty"));
    await expect(applyCreatorMilesChoices({} as never, args({ empty: { source: "google" } }))).rejects.toThrow(CreatorMilesChoiceError);
    engine.setMilesChoice.mockRejectedValueOnce(new MilesChoiceError("google_has_no_value_for_empty"));
    await expect(applyCreatorMilesChoices({} as never, args({ empty: { source: "google" } }))).rejects.toThrow(/Load 13530 Empty miles/);
  });
});
