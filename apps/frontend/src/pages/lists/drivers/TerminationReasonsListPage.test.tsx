import { describe, expect, it } from "vitest";
import { ApiError } from "../../../api/client";
import { parseConflict } from "./TerminationReasonsListPage";

// LISTS-TERMINATION-REASONS-PARSE-CONFLICT-NARROW-FIELD — sibling of
// LISTS-LOAD-CANCELLATION-REASONS-CREATE-DESCRIPTION-NULL-400 (#16702): parseConflict only ever read
// fieldErrors.code, silently swallowing a validation error on any other field (label, description,
// severity). Widened to surface the first field error from ANY field.
describe("parseConflict — LISTS-TERMINATION-REASONS-PARSE-CONFLICT-NARROW-FIELD", () => {
  it("surfaces a label field error (previously silently swallowed)", () => {
    const error = new ApiError(400, {
      error: "validation_error",
      details: { fieldErrors: { label: ["label is too long"] } },
    });
    expect(parseConflict(error)).toBe("label is too long");
  });

  it("still surfaces a code field error (the original, already-working case)", () => {
    const error = new ApiError(400, {
      error: "validation_error",
      details: { fieldErrors: { code: ["code must be uppercase"] } },
    });
    expect(parseConflict(error)).toBe("code must be uppercase");
  });

  it("still returns the 409 conflict message for a duplicate code", () => {
    const error = new ApiError(409, { error: "termination_reason_code_conflict" });
    expect(parseConflict(error)).toBe("A termination reason with this code already exists.");
  });

  it("returns null for a non-ApiError", () => {
    expect(parseConflict(new Error("network down"))).toBeNull();
  });

  it("returns null when there are no field errors at all", () => {
    const error = new ApiError(500, { error: "internal_error" });
    expect(parseConflict(error)).toBeNull();
  });
});
