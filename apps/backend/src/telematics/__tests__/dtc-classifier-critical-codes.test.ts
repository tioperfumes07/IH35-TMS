import { describe, expect, it } from "vitest";
import { classifyDtcCode } from "../dtc-classifier.service.js";

describe("dtc classifier critical codes", () => {
  it("marks known high-risk codes as critical", () => {
    expect(classifyDtcCode("P0301")).toBe("critical");
    expect(classifyDtcCode("P0700")).toBe("critical");
    expect(classifyDtcCode("U0100")).toBe("critical");
  });
});
