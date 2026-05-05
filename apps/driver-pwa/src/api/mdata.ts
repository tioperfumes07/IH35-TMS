import { apiRequest } from "./client";

export type DriverSelfRecord = {
  id: string;
  identity_user_id: string | null;
  first_name: string;
  last_name: string;
};

export async function getCurrentDriver() {
  return apiRequest<DriverSelfRecord>("/api/v1/mdata/drivers/me");
}

export async function getMyDriverRecord() {
  return getCurrentDriver();
}
