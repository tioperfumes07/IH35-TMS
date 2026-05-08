export type DvirStatus = "pass" | "minor" | "major";

export type DvirInspectionItemKey =
  | "service_brakes"
  | "parking_brake"
  | "steering"
  | "lights"
  | "tires"
  | "horn"
  | "wipers"
  | "mirrors"
  | "coupling"
  | "wheels"
  | "emergency_eq"
  | "fuel_system"
  | "exhaust"
  | "frame_body"
  | "suspension"
  | "reefer";

export type DvirInspectionItem = {
  key: DvirInspectionItemKey;
  status: DvirStatus;
  note: string;
  photo_keys: string[];
};

export type DvirSubmission = {
  load_id: string;
  mode: "pre" | "post";
  unit: string;
  trailer: string;
  odometer: number;
  location: string;
  certified_at: string;
  signature_data_url: string;
  out_of_service: boolean;
  items: DvirInspectionItem[];
};

export const FMCSA_DVIR_ITEMS: DvirInspectionItemKey[] = [
  "service_brakes",
  "parking_brake",
  "steering",
  "lights",
  "tires",
  "horn",
  "wipers",
  "mirrors",
  "coupling",
  "wheels",
  "emergency_eq",
  "fuel_system",
  "exhaust",
  "frame_body",
  "suspension",
  "reefer",
];

export function createEmptyInspectionItems(): DvirInspectionItem[] {
  return FMCSA_DVIR_ITEMS.map((key) => ({
    key,
    status: "pass",
    note: "",
    photo_keys: [],
  }));
}

// TODO: wire to /api/driver/dvir in P3-T11.15.4
export async function submitDvir(_payload: DvirSubmission): Promise<{ queued: boolean }> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  return { queued: true };
}
