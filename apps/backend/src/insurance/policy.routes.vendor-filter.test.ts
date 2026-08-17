import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routePath = path.resolve("apps/backend/src/insurance/policy.routes.ts");
const textPredicate = "filters.push(`p.vendor_id = $${values.length}::text`)";
const uuidPredicate = "filters.push(`p.vendor_id = $${values.length}::uuid`)";

function verifyVendorFilter(source: string) {
  return {
    hasTextPredicate: source.includes(textPredicate),
    hasUuidPredicate: source.includes(uuidPredicate),
  };
}

describe("insurance policy vendor reverse filter", () => {
  it("keeps the legacy TEXT vendor FK comparison type-safe", () => {
    const source = fs.readFileSync(routePath, "utf8");
    expect(verifyVendorFilter(source)).toEqual({
      hasTextPredicate: true,
      hasUuidPredicate: false,
    });
  });

  it("catches a planted text-to-uuid regression", () => {
    const source = fs.readFileSync(routePath, "utf8");
    const planted = source.replace(textPredicate, () => uuidPredicate);
    expect(verifyVendorFilter(planted)).toEqual({
      hasTextPredicate: false,
      hasUuidPredicate: true,
    });
  });
});
