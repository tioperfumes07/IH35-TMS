import { describe, expect, it } from "vitest";
import { createBodySchema } from "./civil-fine-types.routes.js";

// SAFETY-CIVIL-FINE-TYPES-CREATE-DESCRIPTION-NULL-400 — live-reproduced this session: POST
// /api/v1/catalogs/safety/civil-fine-types with description:null (CivilFineTypeModal.tsx's real
// blank-Description value) 400'd with fieldErrors.description: ["Invalid input: expected string,
// received null"]. createBodySchema.description was a bare .optional() (accepts undefined, rejects
// null); the sibling updateBodySchema.description already had .nullable().
const VALID_CREATE_BODY = {
  code: "TEST-CODE",
  display_name: "Test Code",
};

describe("civil-fine-types createBodySchema — SAFETY-CIVIL-FINE-TYPES-CREATE-DESCRIPTION-NULL-400", () => {
  it("accepts description: null (the frontend's real blank-field value)", () => {
    expect(createBodySchema.safeParse({ ...VALID_CREATE_BODY, description: null }).success).toBe(true);
  });

  it("accepts description omitted entirely", () => {
    expect(createBodySchema.safeParse(VALID_CREATE_BODY).success).toBe(true);
  });

  it("still accepts a real description string", () => {
    expect(createBodySchema.safeParse({ ...VALID_CREATE_BODY, description: "a real reason" }).success).toBe(true);
  });
});
