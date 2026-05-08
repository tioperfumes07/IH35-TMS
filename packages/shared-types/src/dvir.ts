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
