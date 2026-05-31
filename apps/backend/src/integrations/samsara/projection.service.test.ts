import { describe, expect, it } from "vitest";
import { projectSamsaraDriver, projectSamsaraVehicle } from "./projection.service.js";

describe("projection.service", () => {
  const opcoId = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

  it("projects a Samsara vehicle payload", () => {
    const projected = projectSamsaraVehicle(
      {
        id: "212014918125677",
        name: "127",
        vin: "1XPBD49X8FD280884",
        make: "PETERBILT",
        model: "579",
        year: "2015",
        licensePlate: "R398379",
      },
      opcoId
    );

    expect(projected).toMatchObject({
      unit_number: "127",
      vin: "1XPBD49X8FD280884",
      make: "PETERBILT",
      model: "579",
      year: 2015,
      license_plate: "R398379",
      samsara_vehicle_id: "212014918125677",
      owner_company_id: opcoId,
      status: "InService",
    });
  });

  it("falls back when optional vehicle fields are missing", () => {
    const projected = projectSamsaraVehicle({ id: "veh-1", year: "" }, opcoId);

    expect(projected.unit_number).toBe("veh-1");
    expect(projected.vin).toBe("SMS-veh-1");
    expect(projected.year).toBeNull();
  });

  it("projects a Samsara driver payload", () => {
    const projected = projectSamsaraDriver(
      {
        id: "141707",
        name: "Juan Manuel Saldana Gonzalez",
        phone: "+12145550000",
        licenseNumber: "TAMP201768",
        licenseState: "TA",
        driverActivationStatus: "active",
      },
      opcoId
    );

    expect(projected).toMatchObject({
      first_name: "Juan",
      last_name: "Manuel Saldana Gonzalez",
      phone: "+12145550000",
      cdl_number: "TAMP201768",
      cdl_state: "TA",
      status: "Active",
      operating_company_id: opcoId,
      samsara_driver_id: "141707",
    });
  });

  it("handles single-token names and defaults", () => {
    const projected = projectSamsaraDriver({ id: "driver-7", name: "Mononym", driverActivationStatus: "inactive" }, opcoId);

    expect(projected.first_name).toBe("Mononym");
    expect(projected.last_name).toBe("driver-7");
    expect(projected.phone).toBe("sms-driver-7");
    expect(projected.status).toBe("Inactive");
  });
});
