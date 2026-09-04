/**
 * WIZ-48 — silent data loss on Edit Load save (owner-blocking).
 *
 * The owner changed the TRUCK on load 13508, saved, saw "Load 13508 is saved", yet the audit showed
 *   assigned_unit_id           a10cd288… -> a10cd288…   UNCHANGED   (the change he made)
 *   assigned_primary_driver_id null       -> fba21d80…  SAVED      (a change made later)
 *
 * ROOT CAUSE (instrumented here, not assumed): BookLoadModalV4's Edit prefill effect calls
 *   form.reset({ ...form.getValues(), ...buildEditPrefill(editLoad) })
 * keyed on the `editLoad` object. `editLoadQuery` uses staleTime:0, so it refetches (focus/mount/
 * reconnect); when the returned reference changes the effect RE-RUNS, and form.reset OVERWRITES the
 * operator's in-progress edits AND clears their dirtyFields. A field changed BEFORE a refetch loses
 * its dirty flag and is dropped from the dirtyFields-gated PATCH; a field changed AFTER survives.
 * The picker commits fine (EntityPicker.onChange → setValue{shouldDirty}); the value is lost by the
 * reset, not the picker.
 *
 * This is a pure react-hook-form reproduction so the anti-data-loss behavior is provable without
 * rendering the whole modal. The FIX applies the prefill EXACTLY ONCE per opened load id
 * (shouldApplyEditPrefill) so a refetch never re-clobbers in-progress edits.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { LoadDetail } from "../../../../api/loads";
import { buildEditPatchBody, buildEditPrefill, shouldApplyEditPrefill } from "./editLoadMapping";

const OCID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const OLD_UNIT = "a10cd288-1111-4aaa-8bbb-000000000001";
const NEW_UNIT = "b20de399-2222-4ccc-9ddd-000000000002";
const NEW_DRIVER = "fba21d80-3333-4eee-8fff-000000000003";

const persistedLoad = {
  id: "13508",
  operating_company_id: OCID,
  load_number: "13508",
  customer_id: "cust-1",
  customer_name: "ACME",
  status: "booked",
  rate_total_cents: 250000,
  currency_code: "USD",
  assigned_unit_id: OLD_UNIT,
  assigned_primary_driver_id: null,
  assigned_secondary_driver_id: null,
  team_id: null,
  commodity: "STEEL COILS",
  cargo_weight_lbs: 42000,
  trip_type: "NB",
  stops: [],
} as unknown as LoadDetail;

/** Edit-mode form baseline, matching BookLoadModalV4's assignment defaults. */
function editDefaults() {
  return {
    assigned_unit_id: "",
    assignment_mode: "solo" as const,
    assigned_primary_driver_id: "",
    assigned_secondary_driver_id: "",
    team_id: "",
    commodity: "",
    weight_lbs: 0,
    trip_type: "",
  };
}

describe("WIZ-48 — Edit Load prefill reset must not clobber in-progress edits", () => {
  it("REPRO (old behavior): re-running form.reset on an editLoad refetch drops a field changed before it", () => {
    const { result } = renderHook(() => useForm({ defaultValues: editDefaults() }));

    // Open: apply persisted prefill as the clean baseline.
    act(() => result.current.reset(({ ...result.current.getValues(), ...(buildEditPrefill(persistedLoad) as Record<string, unknown>) }) as never));

    // Operator changes the TRUCK (EntityPicker.onChange → setValue{shouldDirty}).
    act(() => result.current.setValue("assigned_unit_id", NEW_UNIT, { shouldDirty: true }));
    expect(result.current.formState.dirtyFields.assigned_unit_id).toBe(true);

    // editLoadQuery refetches (staleTime:0) → OLD effect re-runs form.reset unconditionally.
    act(() => result.current.reset(({ ...result.current.getValues(), ...(buildEditPrefill(persistedLoad) as Record<string, unknown>) }) as never));

    // The truck is silently reverted and no longer dirty → dropped from the PATCH. This is the bug.
    expect(result.current.getValues("assigned_unit_id")).toBe(OLD_UNIT);
    expect(result.current.formState.dirtyFields.assigned_unit_id).toBeFalsy();
    const body = buildEditPatchBody(result.current.getValues(), result.current.formState.dirtyFields, OCID);
    expect("assigned_unit_id" in body).toBe(false); // SAVED with the field silently dropped
  });

  it("FIX: prefill is applied ONCE per load id → a field changed before a refetch survives into the PATCH", () => {
    const { result } = renderHook(() => useForm({ defaultValues: editDefaults() }));
    let appliedLoadId: string | null = null;

    // The component's guarded effect: reset only when this load id has not been prefilled yet.
    const applyPrefillOnce = (loadId: string) => {
      if (!shouldApplyEditPrefill(appliedLoadId, loadId)) return;
      appliedLoadId = loadId;
      act(() => result.current.reset(({ ...result.current.getValues(), ...(buildEditPrefill(persistedLoad) as Record<string, unknown>) }) as never));
    };

    applyPrefillOnce("13508"); // open
    act(() => result.current.setValue("assigned_unit_id", NEW_UNIT, { shouldDirty: true }));

    applyPrefillOnce("13508"); // editLoad refetch — guarded, so NO re-clobber
    act(() => result.current.setValue("assigned_primary_driver_id", NEW_DRIVER, { shouldDirty: true }));

    // Both the earlier (truck) and later (driver) edits are preserved and dirty.
    expect(result.current.getValues("assigned_unit_id")).toBe(NEW_UNIT);
    expect(result.current.formState.dirtyFields.assigned_unit_id).toBe(true);

    const body = buildEditPatchBody(result.current.getValues(), result.current.formState.dirtyFields, OCID);
    expect(body.assigned_unit_id).toBe(NEW_UNIT); // truck persists
    expect(body.assigned_primary_driver_id).toBe(NEW_DRIVER); // driver persists (assignment block)
  });

  it("shouldApplyEditPrefill: first id applies once; same id never re-applies; a new id re-applies", () => {
    expect(shouldApplyEditPrefill(null, "13508")).toBe(true);
    expect(shouldApplyEditPrefill("13508", "13508")).toBe(false);
    expect(shouldApplyEditPrefill("13508", "13509")).toBe(true);
    expect(shouldApplyEditPrefill(null, "")).toBe(false);
  });

  it("audit — every editable equipment/cargo field changed after prefill lands in the PATCH", () => {
    const { result } = renderHook(() => useForm({ defaultValues: editDefaults() }));
    act(() => result.current.reset(({ ...result.current.getValues(), ...(buildEditPrefill(persistedLoad) as Record<string, unknown>) }) as never));

    act(() => {
      result.current.setValue("assigned_unit_id", NEW_UNIT, { shouldDirty: true });
      result.current.setValue("trip_type", "SB", { shouldDirty: true });
      result.current.setValue("commodity", "ALUMINUM", { shouldDirty: true });
      result.current.setValue("weight_lbs", 38000, { shouldDirty: true });
    });

    const body = buildEditPatchBody(result.current.getValues(), result.current.formState.dirtyFields, OCID);
    expect(body.assigned_unit_id).toBe(NEW_UNIT);
    expect(body.trip_type).toBe("SB");
    expect(body.commodity).toBe("ALUMINUM");
    expect(body.cargo_weight_lbs).toBe(38000);
  });
});
