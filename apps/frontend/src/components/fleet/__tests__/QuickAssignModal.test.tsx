import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modalSrc = readFileSync(resolve(import.meta.dirname, "../QuickAssignModal.tsx"), "utf8");
const vehicleSrc = readFileSync(
  resolve(import.meta.dirname, "../../../pages/fleet/VehicleProfilePage.tsx"),
  "utf8"
);
const mdataApiSrc = readFileSync(resolve(import.meta.dirname, "../../../api/mdata.ts"), "utf8");

describe("QuickAssignModal wiring", () => {
  it("exports driver picker quick-assign modal", () => {
    expect(modalSrc).toContain("export function QuickAssignModal");
    expect(modalSrc).toContain("listDrivers");
    expect(modalSrc).toContain("Confirm assign");
  });

  it("vehicle profile opens quick assign from driver assignment section", () => {
    expect(vehicleSrc).toContain("QuickAssignModal");
    expect(vehicleSrc).toContain("quicksaveEquipmentAssignment");
    expect(vehicleSrc).toContain('equipment_kind: "truck"');
  });

  it("api client posts to assignments quicksave route", () => {
    expect(mdataApiSrc).toContain('"/api/v1/assignments/quicksave"');
  });
});
