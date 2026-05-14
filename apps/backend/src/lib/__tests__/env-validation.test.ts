import { describe, it, expect } from "vitest";
import { validateStartupEnvironment } from "../env-validation.js";

describe("env-validation", () => {
  it("flags missing R2 bucket aliases when unset", () => {
    const prevName = process.env.R2_BUCKET_NAME;
    const prevBucket = process.env.R2_BUCKET;
    try {
      delete process.env.R2_BUCKET_NAME;
      delete process.env.R2_BUCKET;
      const result = validateStartupEnvironment();
      expect(result.missingRequired.some((k) => k.includes("R2_BUCKET"))).toBe(true);
    } finally {
      process.env.R2_BUCKET_NAME = prevName;
      process.env.R2_BUCKET = prevBucket;
    }
  });
});
