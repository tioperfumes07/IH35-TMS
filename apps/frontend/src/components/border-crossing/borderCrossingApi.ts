import { useEffect, useState } from "react";
import { resolveApiUrl } from "../../api/client";

export type PortOfEntry = {
  id: string;
  name: string;
  short_name: string | null;
  country: string;
  cbp_port_code: string | null;
};

export type WaitTimeRow = {
  cbp_port_code: string;
  lane_type: string;
  wait_time_minutes: number | null;
  lanes_open: number | null;
  fetched_at: string;
};

export type CustomsBroker = {
  id: string;
  name: string;
};

export type WizardFormState = {
  loadId: string;
  unitId: string;
  driverId: string;
  direction: "northbound" | "southbound" | "";
  portOfEntryId: string;
  plannedDate: string;
  commodity: string;
  commodityValue: string;
  weight: string;
  hazmat: boolean;
  customsBrokerId: string;
  bondNumber: string;
};

export const initialWizardForm: WizardFormState = {
  loadId: "",
  unitId: "",
  driverId: "",
  direction: "",
  portOfEntryId: "",
  plannedDate: "",
  commodity: "",
  commodityValue: "",
  weight: "",
  hazmat: false,
  customsBrokerId: "",
  bondNumber: "",
};

export async function fetchPortsOfEntry(): Promise<PortOfEntry[]> {
  const res = await fetch(resolveApiUrl("/api/v1/border-crossing/ports-of-entry"), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load ports of entry");
  const data = (await res.json()) as { ports: PortOfEntry[] };
  return data.ports;
}

export async function fetchWaitTimes(cbpPortCode: string): Promise<WaitTimeRow[]> {
  const res = await fetch(resolveApiUrl(`/api/v1/border-crossing/wait-times?cbp_port_code=${encodeURIComponent(cbpPortCode)}`), {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { rows: WaitTimeRow[] };
  return data.rows ?? [];
}

export async function fetchCustomsBrokers(operatingCompanyId: string): Promise<CustomsBroker[]> {
  const res = await fetch(
    `/api/v1/border-crossing/customs-brokers?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { credentials: "include" }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { brokers: CustomsBroker[] };
  return data.brokers ?? [];
}

export function useBorderCrossingApi(operatingCompanyId: string | undefined) {
  const [ports, setPorts] = useState<PortOfEntry[]>([]);
  const [brokers, setBrokers] = useState<CustomsBroker[]>([]);

  useEffect(() => {
    void fetchPortsOfEntry().then(setPorts).catch(() => setPorts([]));
  }, []);

  useEffect(() => {
    if (!operatingCompanyId) return;
    void fetchCustomsBrokers(operatingCompanyId).then(setBrokers).catch(() => setBrokers([]));
  }, [operatingCompanyId]);

  return { ports, brokers };
}
