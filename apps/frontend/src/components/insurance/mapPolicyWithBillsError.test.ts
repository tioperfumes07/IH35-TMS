import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { mapPolicyWithBillsError } from "./PolicyCreateWizard";

describe("mapPolicyWithBillsError", () => {
  it("maps insurance_vendor_not_found to actionable vendor-picker copy", () => {
    const msg = mapPolicyWithBillsError(
      new ApiError(409, { error: "insurance_vendor_not_found" })
    );
    expect(msg).toMatch(/mdata\.vendors/i);
    expect(msg).toMatch(/\+ Add new/i);
    expect(msg).not.toMatch(/API request failed/i);
  });

  it("maps insurance_seed_bank_account_not_found", () => {
    const msg = mapPolicyWithBillsError(
      new ApiError(409, { error: "insurance_seed_bank_account_not_found" })
    );
    expect(msg).toMatch(/bank account/i);
  });
});
