import { describe, expect, it } from "vitest";
import { nextTripTypeFromKey } from "./tripTypeKeyboard";

describe("ROUND 8.20 board17 tripTypeKeyboard", () => {
  it("ArrowRight cycles NB → TR → SB → NB", () => {
    expect(nextTripTypeFromKey("ArrowRight", "NB")).toBe("TR");
    expect(nextTripTypeFromKey("ArrowRight", "TR")).toBe("SB");
    expect(nextTripTypeFromKey("ArrowRight", "SB")).toBe("NB");
  });

  it("ArrowLeft cycles backwards; Home/End jump ends", () => {
    expect(nextTripTypeFromKey("ArrowLeft", "NB")).toBe("SB");
    expect(nextTripTypeFromKey("Home", "SB")).toBe("NB");
    expect(nextTripTypeFromKey("End", "NB")).toBe("SB");
  });

  it("unknown keys return null; empty current starts at NB on ArrowRight", () => {
    expect(nextTripTypeFromKey("Enter", "NB")).toBeNull();
    expect(nextTripTypeFromKey("ArrowRight", "")).toBe("NB");
  });
});
