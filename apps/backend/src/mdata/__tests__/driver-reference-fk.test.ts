import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const aggregate = fs.readFileSync(path.join(here, "../driver-aggregate.service.ts"), "utf8");
const fkService = fs.readFileSync(path.join(here, "../driver-reference-fk.service.ts"), "utf8");
const migration = fs.readFileSync(
  path.join(here, "../../../../../db/migrations/0343_drivers_reference_fk_wire.sql"),
  "utf8"
);

describe("driver reference FK enrichment (A17.1)", () => {
  it("joins reference.* tables in enrichment service", () => {
    expect(fkService).toMatch(/reference\.license_classes/);
    expect(fkService).toMatch(/reference\.employment_statuses/);
    expect(fkService).toMatch(/reference\.medical_card_statuses/);
    expect(fkService).toMatch(/driver_cdl_endorsements/);
    expect(fkService).toMatch(/driver_cdl_restrictions/);
  });

  it("surfaces reference FK data in driver aggregate license and medical sections", () => {
    expect(aggregate).toMatch(/loadDriverReferenceFkEnrichment/);
    expect(aggregate).toMatch(/license_class_id/);
    expect(aggregate).toMatch(/medical_card_status_id/);
    expect(aggregate).toMatch(/endorsement_codes/);
  });

  it("migration defines sync triggers for inline-to-FK wire", () => {
    expect(migration).toMatch(/trg_sync_driver_reference_fks_row/);
    expect(migration).toMatch(/trg_sync_driver_endorsement_links/);
  });
});
