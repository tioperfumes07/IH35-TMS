import { describe, expect, it } from "vitest";
import { chunkDriverLabelIds } from "./useDriverLabels";

describe("chunkDriverLabelIds", () => {
  it("preserves every linked ID while respecting the backend batch ceiling", () => {
    const ids = Array.from({ length: 401 }, (_, index) => `driver-${index}`);
    const chunks = chunkDriverLabelIds(ids);
    expect(chunks.map((chunk) => chunk.length)).toEqual([200, 200, 1]);
    expect(chunks.flat()).toEqual(ids);
  });
});
