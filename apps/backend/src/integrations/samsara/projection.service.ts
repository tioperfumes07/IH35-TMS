type JsonObject = Record<string, unknown>;

export type UnitRow = {
  unit_number: string;
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
  license_plate: string | null;
  samsara_vehicle_id: string;
  owner_company_id: string;
  status: "InService";
};

export type DriverRow = {
  first_name: string;
  last_name: string;
  phone: string;
  cdl_number: string | null;
  cdl_state: string | null;
  status: "Active" | "Inactive";
  operating_company_id: string;
  samsara_driver_id: string;
};

function asObject(rawPayload: unknown): JsonObject {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    throw new Error("raw_payload must be an object");
  }
  return rawPayload as JsonObject;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseYear(value: unknown): number | null {
  const yearText = asString(value);
  if (!yearText || !/^\d{4}$/.test(yearText)) return null;
  const parsed = Number.parseInt(yearText, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitName(fullName: string | null, fallback: string): { first: string; last: string } {
  if (!fullName) return { first: "Unknown", last: fallback };
  const [firstToken, ...rest] = fullName.split(/\s+/).filter(Boolean);
  const first = firstToken ?? "Unknown";
  const last = rest.join(" ").trim() || fallback;
  return { first, last };
}

export function projectSamsaraVehicle(rawPayload: unknown, opcoId: string): UnitRow {
  const payload = asObject(rawPayload);
  const vehicleId = asString(payload.id);
  if (!vehicleId) throw new Error("vehicle payload missing id");

  const unitNumber = asString(payload.name) ?? vehicleId;
  const vin = asString(payload.vin) ?? `SMS-${vehicleId}`;

  return {
    unit_number: unitNumber,
    vin,
    make: asString(payload.make),
    model: asString(payload.model),
    year: parseYear(payload.year),
    license_plate: asString(payload.licensePlate),
    samsara_vehicle_id: vehicleId,
    owner_company_id: opcoId,
    status: "InService",
  };
}

export function projectSamsaraDriver(rawPayload: unknown, opcoId: string): DriverRow {
  const payload = asObject(rawPayload);
  const driverId = asString(payload.id);
  if (!driverId) throw new Error("driver payload missing id");

  const fullName = asString(payload.name);
  const { first, last } = splitName(fullName, driverId);
  const activationStatus = asString(payload.driverActivationStatus);

  return {
    first_name: first,
    last_name: last,
    phone: asString(payload.phone) ?? `sms-${driverId}`,
    cdl_number: asString(payload.licenseNumber),
    cdl_state: asString(payload.licenseState),
    status: activationStatus === "active" || !activationStatus ? "Active" : "Inactive",
    operating_company_id: opcoId,
    samsara_driver_id: driverId,
  };
}
