import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { incrementTrailingNumber, parseOperatorDocumentNumber } from "../qbo-custom-document-number.js";

describe("incrementTrailingNumber — QBO last-entered becomes next", () => {
  it("turns 13560 into 13561", () => {
    expect(incrementTrailingNumber("13560")).toBe("13561");
  });
  it("preserves padding on a minted series until the operator types a bare number", () => {
    expect(incrementTrailingNumber("INV-2026-00004")).toBe("INV-2026-00005");
  });
  it("returns null when there are no digits", () => {
    expect(incrementTrailingNumber("ABC")).toBeNull();
  });
});

describe("parseOperatorDocumentNumber", () => {
  it("keeps 13560 verbatim", () => {
    expect(parseOperatorDocumentNumber(" 13560 ")).toBe("13560");
  });
  it("rejects whitespace inside the number", () => {
    expect(() => parseOperatorDocumentNumber("13 560")).toThrow();
  });
});

describe("QboDocumentNumberField — empty box (GO-06 owner 2026-09-01)", () => {
  it("never auto-fills suggested into the input", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "../../../../frontend/src/components/forms/QboDocumentNumberField.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/onChange\(suggested\)/);
    expect(src).not.toMatch(/placeholder=\{suggested\}/);
    expect(src).toMatch(/placeholder=""/);
    expect(src).toMatch(/Leave blank to use the next unused number/);
  });
});

describe("GO-07 counting law", () => {
  it("does not add at-risk + late for the tile", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "../../../../frontend/src/pages/dispatch/DispatchOverview.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/atRiskCount\s*\+\s*lateCount/);
  });
});
