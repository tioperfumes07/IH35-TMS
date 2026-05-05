import { apiRequest } from "./client";

export type DriverSelfRecord = {
  id: string;
  identity_user_id: string | null;
  first_name: string;
  last_name: string;
};

export async function getMyDriverRecord() {
  const result = await apiRequest<{ drivers: DriverSelfRecord[] }>("/api/v1/mdata/drivers?limit=1&offset=0");
  return result.drivers[0] ?? null;
}
