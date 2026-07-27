import { describe, expect, it } from "vitest";
import {
  FUEL_CARD_OVERAGE_ENGINE_FLAG_KEY,
  FUEL_CARD_OVERAGE_GL_POSTING_FLAG_KEY,
} from "../fuel-card-overage.service.js";

describe("FUEL-03 fuel-card-overage.service exports", () => {
  it("uses per-entity engine and GL posting flag keys", () => {
    expect(FUEL_CARD_OVERAGE_ENGINE_FLAG_KEY).toBe("FUEL_CARD_OVERAGE_ENGINE_ENABLED");
    expect(FUEL_CARD_OVERAGE_GL_POSTING_FLAG_KEY).toBe("FUEL_CARD_OVERAGE_GL_POSTING_ENABLED");
  });
});
