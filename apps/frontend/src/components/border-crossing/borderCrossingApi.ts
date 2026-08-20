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
  loadLabel: string;
  unitId: string;
  unitLabel: string;
  driverId: string;
  driverLabel: string;
  direction: "northbound" | "southbound" | "";
  portOfEntryId: string;
  plannedDate: string;
  commodity: string;
  commodityValue: string;
  weight: string;
  hazmat: boolean;
  customsBrokerId: string;
  customsBrokerLabel: string;
  bondNumber: string;
};

export const initialWizardForm: WizardFormState = {
  loadId: "",
  loadLabel: "",
  unitId: "",
  unitLabel: "",
  driverId: "",
  driverLabel: "",
  direction: "",
  portOfEntryId: "",
  plannedDate: "",
  commodity: "",
  commodityValue: "",
  weight: "",
  hazmat: false,
  customsBrokerId: "",
  customsBrokerLabel: "",
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
  const res = await fetch(resolveApiUrl(`/api/v1/border-crossing/customs-brokers?operating_company_id=${encodeURIComponent(operatingCompanyId)}`),
    { credentials: "include" }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { brokers: CustomsBroker[] };
  return data.brokers ?? [];
}

export function useBorderCrossingApi(operatingCompanyId: string | undefined) {
  const [ports, setPorts] = useState<PortOfEntry[]>([]);
  const [brokers, setBrokers] = useState<CustomsBroker[]>([]);
  const [portsLoading, setPortsLoading] = useState(true);
  const [brokersLoading, setBrokersLoading] = useState(false);
  const [portsError, setPortsError] = useState<string | null>(null);
  const [brokersError, setBrokersError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPortsLoading(true);
    setPortsError(null);
    void fetchPortsOfEntry()
      .then((rows) => {
        if (!cancelled) setPorts(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPorts([]);
          setPortsError(err instanceof Error ? err.message : "Failed to load ports of entry");
        }
      })
      .finally(() => {
        if (!cancelled) setPortsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!operatingCompanyId) {
      setBrokers([]);
      setBrokersLoading(false);
      setBrokersError(null);
      return;
    }
    let cancelled = false;
    setBrokersLoading(true);
    setBrokersError(null);
    void fetchCustomsBrokers(operatingCompanyId)
      .then((rows) => {
        if (!cancelled) setBrokers(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBrokers([]);
          setBrokersError(err instanceof Error ? err.message : "Failed to load customs brokers");
        }
      })
      .finally(() => {
        if (!cancelled) setBrokersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [operatingCompanyId]);

  return { ports, brokers, portsLoading, brokersLoading, portsError, brokersError };
}
