import { apiRequest } from "./client";

export type DriverPaymentMethodMethod = "ach" | "check";

export type DriverPaymentMethod = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  method: DriverPaymentMethodMethod;
  account_token: string | null;
  routing_last4: string | null;
  account_last4: string | null;
  account_holder_name: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function withCompanyQuery(path: string, operatingCompanyId: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams({ operating_company_id: operatingCompanyId, ...params });
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${search.toString()}`;
}

export type CreateDriverPaymentMethodBody = {
  method: DriverPaymentMethodMethod;
  account_token?: string | null;
  routing_last4?: string | null;
  account_last4?: string | null;
  account_holder_name?: string | null;
  make_default?: boolean;
};

export const driverPaymentMethodsApi = {
  list(operatingCompanyId: string, driverId: string, includeInactive = false) {
    return apiRequest<{ payment_methods: DriverPaymentMethod[] }>(
      withCompanyQuery(
        `/api/v1/driver-finance/drivers/${encodeURIComponent(driverId)}/payment-methods`,
        operatingCompanyId,
        includeInactive ? { include_inactive: "true" } : {}
      )
    );
  },

  create(operatingCompanyId: string, driverId: string, body: CreateDriverPaymentMethodBody) {
    return apiRequest<DriverPaymentMethod>(
      `/api/v1/driver-finance/drivers/${encodeURIComponent(driverId)}/payment-methods`,
      { method: "POST", body: { operating_company_id: operatingCompanyId, ...body } }
    );
  },

  setDefault(operatingCompanyId: string, id: string) {
    return apiRequest<DriverPaymentMethod>(
      `/api/v1/driver-finance/driver-payment-methods/${encodeURIComponent(id)}/default`,
      { method: "PATCH", body: { operating_company_id: operatingCompanyId } }
    );
  },

  void(operatingCompanyId: string, id: string, reason: string) {
    return apiRequest<DriverPaymentMethod>(
      `/api/v1/driver-finance/driver-payment-methods/${encodeURIComponent(id)}/void`,
      { method: "PATCH", body: { operating_company_id: operatingCompanyId, reason } }
    );
  },
};
