import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "./reports/MaintenanceReportsPage.tsx",
  "./WorkOrderDetailPage.tsx",
  "./FaultCodeAlertsPage.tsx",
  "./drivers/DriversMasterDataPage.tsx",
  "./MaintKpiDashboardPage.tsx",
  "./WarrantyClaimsPage.tsx",
  "./TireProgramPage.tsx",
  "./PmAutoEnginePage.tsx",
  "./inspections/InspectionsPage.tsx",
  "./compliance/Compliance425CPage.tsx",
  "./vehicles/VehiclesMasterDataPage.tsx",
  "./parts/PartsMasterDataPage.tsx",
] as const;

describe("ROUND 8.20 board22 — Maintenance child Backs honor ?ret=", () => {
  for (const rel of files) {
    it(`${rel} resolves Back from ret (no hard-coded /maintenance alone)`, () => {
      const source = readFileSync(resolve(__dirname, rel), "utf8");
      expect(source).toMatch(/resolveBackHref/);
      expect(source).toMatch(/maintBackHref/);
      expect(source).not.toMatch(/backHref="\/maintenance"/);
    });
  }
});
