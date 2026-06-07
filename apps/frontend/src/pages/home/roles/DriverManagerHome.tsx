/**
 * GAP-69 — Driver Manager Home
 *
 * Role-specific home for Driver Managers. Renders DriverManagerKpiBar +
 * DriverManagerAttentionPanel above the standard dashboard content.
 */

import type { AuthMeResponse } from "../../../types/api";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../../components/layout/PageHeader";
import { DriverManagerAttentionPanel } from "../../../components/home/DriverManagerAttentionPanel";
import { DriverManagerKpiBar } from "../../../components/home/DriverManagerKpiBar";
import { apiRequest } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DefaultHome } from "./DefaultHome";

type DriverManagerRoleHomeResult = {
  kpis: {
    unread_driver_comms: number;
    late_arrivals_7d: number;
    pending_settlements: number;
  };
  attention_items: Array<{
    item_id: string;
    source: string;
    severity: "info" | "warning" | "error" | "critical";
    title: string;
    body: string;
    count: number;
    action_url: string;
    action_label: string;
  }>;
  cooling_drivers: Array<{ driver_id: string; driver_name: string; days_idle: number }>;
  computed_at: string;
};

type Props = {
  auth: AuthMeResponse["user"];
};

function buildPath(companyId: string) {
  return `/api/driver-manager/role-home?operating_company_id=${encodeURIComponent(companyId)}`;
}

export function DriverManagerHome({ auth }: Props) {
  const displayName = auth.email ?? "Driver Manager";
  const { selectedCompanyId } = useCompanyContext();
  const cid = selectedCompanyId ?? "";

  const roleHomeQuery = useQuery({
    queryKey: ["driver-manager", "role-home", cid],
    queryFn: () => apiRequest<DriverManagerRoleHomeResult>(buildPath(cid)),
    enabled: Boolean(cid),
    refetchInterval: 15 * 60 * 1000,
    retry: false,
  });

  return (
    <div data-testid="driver-manager-home-view" className="space-y-4">
      <PageHeader
        title="Driver Manager Home"
        subtitle={`Welcome back, ${displayName}. Your driver retention dashboard is below.`}
      />

      <DriverManagerKpiBar kpis={roleHomeQuery.data?.kpis} loading={roleHomeQuery.isLoading} />
      <DriverManagerAttentionPanel
        items={roleHomeQuery.data?.attention_items ?? []}
        loading={roleHomeQuery.isLoading}
        coolingDriverCount={roleHomeQuery.data?.cooling_drivers?.length ?? 0}
      />

      <DefaultHome auth={auth} />
    </div>
  );
}
