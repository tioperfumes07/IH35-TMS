import { describe, expect, it } from "vitest";
import { validateFilledVariablesAgainstSchema } from "./templates.service.js";

/**
 * CC3-LEGAL-LEASE-VARSCHEMA-500-20260822 regression coverage.
 *
 * ROOT CAUSE: catalogs.contract_templates rows for bespoke-wizard-driven contract types
 * (lease_to_own, truck_lease -- both live on prod with variable_schema = {}, no `fields` key at
 * all, since their real form fields are hardcoded in LeaseToOwnCreatorModal.tsx / the truck-lease
 * equivalent, never meant to flow through the generic flat variable-interpolation model) crashed
 * validateFilledVariablesAgainstSchema: `variableSchemaSchema.parse({})` threw an uncaught ZodError
 * because `fields` was a required property with no default. That exception propagated out of
 * createContractInstance uncaught, was not one of the 3 error messages POST /api/v1/legal/contracts
 * maps to a specific status, and fell through to a raw 500 `legal_contract_create_failed` --
 * live-reproduced 2026-08-22 clicking "Save draft" on a real New Lease-to-Own Contract with real
 * seller/lessee/vehicle data filled in.
 */
describe("validateFilledVariablesAgainstSchema — bespoke-wizard templates with no declared fields", () => {
  it("treats a template with no variable_schema.fields key as zero required variables (does not throw)", () => {
    // The exact live shape of lease_to_own / truck_lease's variable_schema on prod: {}.
    expect(() => validateFilledVariablesAgainstSchema({}, { seller: {}, lessee: {}, terms: {}, vehicles: [] })).not.toThrow();
    const result = validateFilledVariablesAgainstSchema({}, { seller: {}, lessee: {}, terms: {}, vehicles: [] });
    expect(result).toEqual({ ok: true, missing_required: [] });
  });

  it("still enforces required fields normally for a properly-shaped schema (regression control)", () => {
    const schema = {
      fields: {
        driver_name: { type: "text", required: true },
        effective_date: { type: "date", required: true },
      },
    };
    const missing = validateFilledVariablesAgainstSchema(schema, { driver_name: "Jorge" });
    expect(missing.ok).toBe(false);
    expect(missing.missing_required).toContain("effective_date");

    const complete = validateFilledVariablesAgainstSchema(schema, {
      driver_name: "Jorge",
      effective_date: "2026-08-22",
    });
    expect(complete).toEqual({ ok: true, missing_required: [] });
  });
});
