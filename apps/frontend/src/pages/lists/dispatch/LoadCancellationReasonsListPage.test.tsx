import { describe, expect, it } from "vitest";
import { ApiError } from "../../../api/client";
import { parseConflict } from "./LoadCancellationReasonsListPage";

// LISTS-LOAD-CANCELLATION-REASONS-CREATE-DESCRIPTION-NULL-400 — live-reproduced this session:
// createReasonBodySchema rejected `description: null` (the frontend's real blank-field value), 400-ing
// with fieldErrors.description — but parseConflict only ever read fieldErrors.reason_code, so
// setConflictError(null) left the Create Entry modal showing NOTHING on a real failure. Fixed on both
// ends: the schema now accepts null (see load-cancellation-reasons.routes.test.ts), and parseConflict now
// surfaces the first field error from ANY field, not just reason_code.
describe("parseConflict — LISTS-LOAD-CANCELLATION-REASONS-CREATE-DESCRIPTION-NULL-400", () => {
  it("surfaces a description field error (previously silently swallowed)", () => {
    const error = new ApiError(400, {
      error: "validation_error",
      details: { fieldErrors: { description: ["Invalid input: expected string, received null"] } },
    });
    expect(parseConflict(error)).toBe("Invalid input: expected string, received null");
  });

  it("still surfaces a reason_code field error (the original, already-working case)", () => {
    const error = new ApiError(400, {
      error: "validation_error",
      details: { fieldErrors: { reason_code: ["reason_code must be uppercase letters/digits/underscores"] } },
    });
    expect(parseConflict(error)).toBe("reason_code must be uppercase letters/digits/underscores");
  });

  it("still returns the 409 conflict message for a duplicate code", () => {
    const error = new ApiError(409, { error: "cancellation_reason_code_conflict" });
    expect(parseConflict(error)).toBe("A reason with this code already exists for this company.");
  });

  it("returns null for a non-ApiError", () => {
    expect(parseConflict(new Error("network down"))).toBeNull();
  });

  it("returns null when there are no field errors at all", () => {
    const error = new ApiError(500, { error: "internal_error" });
    expect(parseConflict(error)).toBeNull();
  });
});
