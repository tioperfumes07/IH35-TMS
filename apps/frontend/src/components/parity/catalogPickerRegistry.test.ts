import { describe, expect, it } from "vitest";
import {
  CATALOG_PICKER_CONFIGS,
  CATALOG_PICKER_KEYS,
  catalogAddNewLabel,
  deriveCatalogCode,
  getCatalogPickerConfig,
  type CatalogPickerKey,
} from "./catalogPickerRegistry";

/** The six kinds that existed before LST-PICKER-01, with their pre-existing backends. */
const LEGACY_SIX: Array<[CatalogPickerKey, "inline-drawer" | "quick-create-modal"]> = [
  ["vendor", "inline-drawer"],
  ["customer", "inline-drawer"],
  ["account", "inline-drawer"],
  ["service", "inline-drawer"],
  ["item", "quick-create-modal"],
  ["category", "quick-create-modal"],
  ["part", "quick-create-modal"],
  ["class", "quick-create-modal"],
];

describe("catalogPickerRegistry — VERIFY-2 clause 5", () => {
  it("every config-driven catalog writes the SAME table it reads", () => {
    for (const key of CATALOG_PICKER_KEYS) {
      const config = getCatalogPickerConfig(key);
      expect(config.writeTable, `${key}: create must target the table the picker reads`).toBe(config.readTable);
    }
  });

  it("every config-driven catalog POSTs to the SAME collection it lists from", () => {
    for (const key of CATALOG_PICKER_KEYS) {
      const config = getCatalogPickerConfig(key);
      if (config.backend !== "catalog") continue;
      expect(config.writeEndpoint, `${key}: read and write must be one REST collection`).toBe(config.readEndpoint);
      expect(config.readWriteParity).toBe("same-endpoint-verified");
    }
  });

  it("every entry is entity-scoped and carries backend evidence", () => {
    for (const key of CATALOG_PICKER_KEYS) {
      const config = getCatalogPickerConfig(key);
      expect(config.entityScoped, `${key} must be entity-scoped`).toBe(true);
      expect(config.evidence.length, `${key} must cite file:line evidence`).toBeGreaterThan(10);
      expect(config.evidence).toMatch(/:\d+/);
    }
  });
});

describe("catalogPickerRegistry — the original six do not move", () => {
  it("keeps every legacy kind on its original create backend", () => {
    for (const [key, backend] of LEGACY_SIX) {
      expect(getCatalogPickerConfig(key).backend, `${key} changed backend`).toBe(backend);
    }
  });

  it('reproduces the legacy "+ Add new <kind>" label byte-for-byte', () => {
    for (const [key] of LEGACY_SIX) {
      expect(catalogAddNewLabel(key)).toBe(`+ Add new ${key}`);
    }
  });

  it('uses the §7 "+ Create" vocabulary for config-driven catalogs', () => {
    for (const key of CATALOG_PICKER_KEYS) {
      if (getCatalogPickerConfig(key).backend !== "catalog") continue;
      expect(catalogAddNewLabel(key)).toMatch(/^\+ Create /);
      expect(catalogAddNewLabel(key)).not.toMatch(/\+ (New|Add)\b/);
    }
  });
});

describe("catalogPickerRegistry — config-driven means no new component", () => {
  it("wires a batch of catalogs beyond the original six", () => {
    const configDriven = CATALOG_PICKER_KEYS.filter((k) => getCatalogPickerConfig(k).backend === "catalog");
    expect(configDriven.length).toBeGreaterThanOrEqual(10);
  });

  it("gives every config-driven catalog its create fn and fields from config alone", () => {
    for (const key of CATALOG_PICKER_KEYS) {
      const config = getCatalogPickerConfig(key);
      if (config.backend !== "catalog") continue;
      expect(typeof config.create, `${key} needs a config-supplied create`).toBe("function");
      expect(config.fields?.some((f) => f.name === "display_name" && f.required)).toBe(true);
    }
  });

  it("keys the registry by its own entry keys (no drift between map key and config.key)", () => {
    for (const [key, config] of Object.entries(CATALOG_PICKER_CONFIGS)) {
      expect(config.key).toBe(key);
    }
  });
});

describe("deriveCatalogCode — must satisfy the backend /^[A-Z][A-Z0-9-]+$/ rule", () => {
  const CODE_RE = /^[A-Z][A-Z0-9-]+$/;

  it.each([
    ["Fuel Surcharge", "FUEL-SURCHARGE"],
    ["detention", "DETENTION"],
    ["  Lumper  fee ", "LUMPER-FEE"],
    ["24 hour layover", "C-24-HOUR-LAYOVER"],
    ["!!!", "CATALOG"],
    ["", "CATALOG"],
  ])("derives %s → %s", (input, expected) => {
    expect(deriveCatalogCode(input)).toBe(expected);
  });

  it("always produces a backend-valid code", () => {
    for (const name of ["Fuel Surcharge", "9 lives", "-leading dash", "a", "", "!!!", "Ünïcode nàme"]) {
      expect(deriveCatalogCode(name), `derived from ${JSON.stringify(name)}`).toMatch(CODE_RE);
    }
  });

  it("prefers an explicit code over the derived one", () => {
    expect(deriveCatalogCode("Fuel Surcharge", "FSC")).toBe("FSC");
  });

  it("normalises an explicit code rather than sending an invalid one", () => {
    expect(deriveCatalogCode("Fuel Surcharge", "fsc 2")).toBe("FSC-2");
  });
});
