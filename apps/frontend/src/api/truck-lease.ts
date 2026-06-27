import { apiRequest } from "./client";

export type TruckLeaseTemplateInfo = {
  id: string;
  version: number;
  seeded: boolean;
};

export const truckLeaseApi = {
  ensureTemplate(operatingCompanyId: string) {
    return apiRequest<{ template: TruckLeaseTemplateInfo }>(
      "/api/v1/legal/contracts/truck-lease/ensure-template",
      { method: "POST", body: { operating_company_id: operatingCompanyId } }
    );
  },
};
