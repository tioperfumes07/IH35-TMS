import { describe, expect, it } from "vitest";
import {
  EMPTY_LEGAL_MATTER_FORM,
  formStateToCreatePayload,
  formStateToUpdatePayload,
  matterRowToFormState,
} from "./LegalMatterFormFields";

describe("legal matter trailer FK round trip", () => {
  it("sends equipment_id on create and update", () => {
    const form = { ...EMPTY_LEGAL_MATTER_FORM, matter_number: "LEGAL-1", equipment_id: "trailer-1" };
    expect(formStateToCreatePayload(form).equipment_id).toBe("trailer-1");
    expect(formStateToUpdatePayload(form).equipment_id).toBe("trailer-1");
  });

  it("hydrates equipment_id on reload and supports an intentional clear", () => {
    expect(matterRowToFormState({ equipment_id: "trailer-1" }).equipment_id).toBe("trailer-1");
    expect(formStateToUpdatePayload(EMPTY_LEGAL_MATTER_FORM).equipment_id).toBeNull();
  });
});
