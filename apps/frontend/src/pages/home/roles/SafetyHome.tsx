/**
 * GAP-68 — Safety Officer Home
 *
 * Role-specific home for Safety Officers. Renders SafetyKpiBar + SafetyAlertsPanel
 * above the standard dashboard content.
 */

import type { AuthMeResponse } from "../../../types/api";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../../components/layout/PageHeader";
import { SafetyAlertsPanel } from "../../../components/home/SafetyAlertsPanel";
import { SafetyKpiBar } from "../../../components/home/SafetyKpiBar";
import { fetchSafetyOfficerRoleHome } from "../../../api/home";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DefaultHome } from "./DefaultHome";

type Props = {
  auth: AuthMeResponse["user"];
};

export function SafetyHome({ auth }: Props) {
  const displayName = auth.email ?? "Safety Officer";
  const { selectedCompanyId } = useCompanyContext();
  const cid = selectedCompanyId ?? "";

  const roleHomeQuery = useQuery({
    queryKey: ["safety-officer", "role-home", cid],
    queryFn: () => fetchSafetyOfficerRoleHome(cid),
    enabled: Boolean(cid),
    refetchInterval: 15 * 60 * 1000,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Safety Home"
        subtitle={`Welcome back, ${displayName}. Your compliance dashboard is below.`}
      />

      <SafetyKpiBar kpis={roleHomeQuery.data?.kpis} loading={roleHomeQuery.isLoading} />
      <SafetyAlertsPanel
        alerts={roleHomeQuery.data?.alerts ?? []}
        loading={roleHomeQuery.isLoading}
        certDataStale={roleHomeQuery.data?.cert_data_stale}
      />

      <DefaultHome auth={auth} />
    </div>
  );
}
