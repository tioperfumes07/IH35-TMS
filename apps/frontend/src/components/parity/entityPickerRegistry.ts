/**
 * C1 — per-kind entity picker registry.
 *
 * VERIFY-2 clause: readTable MUST equal writeTable (canonical, never QBO mirror / RETIRE).
 * Every kind is entity-scoped — operating_company_id is required on list and create.
 */
export type EntityPickerKind = "driver" | "unit" | "load" | "vendor" | "customer" | "equipment";

export type EntityPickerConfig = {
  kind: EntityPickerKind;
  label: string;
  entityScoped: true;
  readTable: string;
  writeTable: string;
  /** REST list path (relative to /api/v1). */
  listPath: string;
};

export const ENTITY_PICKERS = [
  {
    kind: "driver",
    label: "driver",
    entityScoped: true,
    readTable: "mdata.drivers",
    writeTable: "mdata.drivers",
    listPath: "/mdata/drivers",
  },
  {
    kind: "unit",
    label: "unit",
    entityScoped: true,
    readTable: "mdata.units",
    writeTable: "mdata.units",
    listPath: "/mdata/units",
  },
  {
    kind: "load",
    label: "load",
    entityScoped: true,
    readTable: "mdata.loads",
    writeTable: "mdata.loads",
    listPath: "/dispatch/loads",
  },
  {
    kind: "vendor",
    label: "vendor",
    entityScoped: true,
    readTable: "mdata.vendors",
    writeTable: "mdata.vendors",
    listPath: "/mdata/vendors",
  },
  {
    kind: "customer",
    label: "customer",
    entityScoped: true,
    readTable: "mdata.customers",
    writeTable: "mdata.customers",
    listPath: "/mdata/customers",
  },
  {
    kind: "equipment",
    label: "equipment",
    entityScoped: true,
    readTable: "mdata.equipment",
    writeTable: "mdata.equipment",
    listPath: "/mdata/equipment",
  },
] as const satisfies readonly EntityPickerConfig[];

export function getEntityPickerConfig(kind: EntityPickerKind): EntityPickerConfig {
  const found = ENTITY_PICKERS.find((e) => e.kind === kind);
  if (!found) {
    throw new Error(`Unknown EntityPicker kind: ${kind}`);
  }
  return found;
}
