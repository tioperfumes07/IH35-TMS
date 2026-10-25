/**
 * ROUND 443.280-A — Settlements-PreSettlements board REPLACES the page body.
 * Does NOT mount DriversPage (no Drivers header, 7 KpiCards, or DRIVERS_SUBNAV).
 * Open pre-settlements rows come from listTours(state=open) so Unit / Ready / Waiting on are live.
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listTours } from "../../api/tourReadout";
import { PreSettlementsPanel } from "../../components/driver-finance/PreSettlementsPanel";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  SettlementsPreSettlementsClosesPanel,
  SettlementsPreSettlementsKpiRow,
} from "../drivers/SettlementsPreSettlementsKpiRow";

/** Board body only — chrome is SettlementsModuleShell / SettlementsSubNavWrapper (443.326). */
export function SettlementsPreSettlementsBoard() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const openToursQuery = useQuery({
    queryKey: ["settlements-module", "tours", "open", companyId, "presettle-board"],
    queryFn: () => listTours(companyId, "open"),
    enabled: Boolean(companyId),
  });

  const rows = openToursQuery.isError ? [] : (openToursQuery.data?.rows ?? []);

  return (
    <div className="space-y-3" data-testid="settlements-presettle-board" data-settlements-presettle-rebuild="1">
      <SettlementsPreSettlementsKpiRow basePath="/driver-finance/pre-settlements" />

      <div
        style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 8 }}
        data-testid="settlements-presettle-v3-panels"
        data-settlements-presettle-v3-layout="1"
      >
        <PreSettlementsPanel
          rows={rows}
          loading={openToursQuery.isLoading}
          isError={openToursQuery.isError}
          title="Open pre-settlements"
          emptyText="No open pre-settlements for this company."
          onViewAll={() => navigate("/driver-finance/settlements")}
        />
        <SettlementsPreSettlementsClosesPanel basePath="/driver-finance/pre-settlements" />
      </div>
    </div>
  );
}
