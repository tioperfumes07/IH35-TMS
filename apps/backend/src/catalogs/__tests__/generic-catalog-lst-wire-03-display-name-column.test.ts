import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  accidentTypesCatalogConfig,
  workplaceIncidentTypesCatalogConfig,
  leaveTypesCatalogConfig,
  cashAdvanceTypesCatalogConfig,
  pmIntervalsCatalogConfig,
  repairLocationsCatalogConfig,
  workOrderTemplatesCatalogConfig,
  airBagCatalogCatalogConfig,
  batteryCatalogCatalogConfig,
  tireCatalogCatalogConfig,
  trailerPartsCatalogConfig,
  truckPartsCatalogConfig,
  defStationsCatalogConfig,
  fuelStationsCatalogConfig,
  relayAccountsCatalogConfig,
  tollProvidersCatalogConfig,
  loadTrailerEquipmentCatalogConfig,
  mxCustomsBrokersCatalogConfig,
} from "../generic-catalog.routes.js";

// CATALOG-DISPLAY-NAME-COLUMN-MISMATCH (2026-08-13, discovered live during CC-2's rank-8 Live gate
// verification: POST /api/v1/catalogs/safety/accident-types 500'd on prod when creating an accident
// type inline from the Create Accident Report form). ROOT CAUSE: the LST-WIRE-03 batch's own doc
// comment states all 23 catalogs in this block "share the canonical catalog shape — code,
// display_name, description, is_active, sort_order" — and every config's own `allowedColumns` /
// `validators` already correctly reference `display_name` — but `displayNameColumn` (the field the
// generic-catalog query engine actually uses for list/search/create display) was copy-pasted from an
// older `name`-shaped template and never updated, on 18 of the 23. Verified live against prod
// information_schema (tiny-field-89581227) before fixing: catalogs.accident_types, .workplace_incident_types,
// .pm_intervals, .fuel_stations, .trailer_parts, .leave_types all have `display_name`, none have `name`.
const BATCH = [
  accidentTypesCatalogConfig,
  workplaceIncidentTypesCatalogConfig,
  leaveTypesCatalogConfig,
  cashAdvanceTypesCatalogConfig,
  pmIntervalsCatalogConfig,
  repairLocationsCatalogConfig,
  workOrderTemplatesCatalogConfig,
  airBagCatalogCatalogConfig,
  batteryCatalogCatalogConfig,
  tireCatalogCatalogConfig,
  trailerPartsCatalogConfig,
  truckPartsCatalogConfig,
  defStationsCatalogConfig,
  fuelStationsCatalogConfig,
  relayAccountsCatalogConfig,
  tollProvidersCatalogConfig,
  loadTrailerEquipmentCatalogConfig,
  mxCustomsBrokersCatalogConfig,
];

describe("catalogs/generic-catalog.routes CATALOG-DISPLAY-NAME-COLUMN-MISMATCH", () => {
  it("every LST-WIRE-03 batch config's displayNameColumn matches its own allowedColumns/validators shape (display_name, not name)", () => {
    for (const cfg of BATCH) {
      expect(cfg.displayNameColumn, `${cfg.catalogName} displayNameColumn`).toBe("display_name");
      expect(cfg.allowedColumns, `${cfg.catalogName} allowedColumns`).toContain("display_name");
    }
  });

  it("catalogs OUTSIDE this batch that genuinely use a name-shaped column are left untouched (no over-correction)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "../generic-catalog.routes.ts"), "utf8");
    // accountTypesCatalogConfig is explicitly documented as a real `name`-shape global lookup —
    // this guard proves the fix didn't blindly regex-replace every "name" occurrence in the file.
    expect(src).toMatch(/accountTypesCatalogConfig[\s\S]{0,300}displayNameColumn:\s*"name"/);
  });
});
