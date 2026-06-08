/**
 * GAP-59 / CAP-9 — Shared at-time-of-event driver lookup.
 * WO creation, accident creation, fuel txn matching, and damage reports
 * should call this helper to resolve who was driving which truck.
 */
import type { DbClient } from "../integrations/samsara/vehicle-driver-pairing/pairing.service.js";
import { lookupDriverForVehicleAtTime as lookupPairingDriver } from "../integrations/samsara/vehicle-driver-pairing/pairing.service.js";

export type AtTimeOfEventLookupInput = {
  operating_company_id: string;
  vehicle_id: string;
  at_time: string;
};

/**
 * Returns the driver UUID assigned to the vehicle at the exact event timestamp,
 * or null when no pairing window covers that moment.
 */
export async function lookupDriverForVehicleAtTime(
  client: DbClient,
  input: AtTimeOfEventLookupInput
): Promise<string | null> {
  return lookupPairingDriver(client, input.operating_company_id, input.vehicle_id, input.at_time);
}
