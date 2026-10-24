import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { CoverageGapDashboard } from "./CoverageGapDashboard";
import { ClaimsTab } from "./ClaimsTab";
import { InsuranceLanding } from "./InsuranceLanding";
import { LawsuitsTab } from "./LawsuitsTab";
import { PoliciesList } from "./PoliciesList";
import { PolicyDetail } from "./PolicyDetail";
import { TypeCatalogAdmin } from "./TypeCatalogAdmin";
import { FleetCoveredPage } from "./FleetCoveredPage";
import { InsuranceModuleTabs } from "./InsuranceModuleTabs";

function InsuranceModuleLayout() {
  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden">
      <InsuranceModuleTabs />
      <Outlet />
    </div>
  );
}

/** Top-level /insurance/* module shell (ROUND 443.282 — not nested under Safety). */
export function InsuranceModuleShell() {
  return (
    <Routes>
      <Route index element={<InsuranceLanding />} />
      <Route element={<InsuranceModuleLayout />}>
        <Route path="policies" element={<PoliciesList />} />
        <Route path="policies/:policyId" element={<PolicyDetail />} />
        <Route path="fleet-covered" element={<FleetCoveredPage />} />
        <Route path="type-catalog" element={<TypeCatalogAdmin />} />
        <Route path="coverage-gaps" element={<CoverageGapDashboard />} />
        <Route path="claims" element={<ClaimsTab />} />
        <Route path="lawsuits" element={<LawsuitsTab />} />
      </Route>
      <Route path="*" element={<Navigate to="/insurance" replace />} />
    </Routes>
  );
}
