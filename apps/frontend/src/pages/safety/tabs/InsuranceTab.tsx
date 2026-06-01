import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ClaimsTab } from "../../insurance/ClaimsTab";
import { CoverageGapDashboard } from "../../insurance/CoverageGapDashboard";
import { InsuranceLanding } from "../../insurance/InsuranceLanding";
import { LawsuitsTab } from "../../insurance/LawsuitsTab";
import { PoliciesList } from "../../insurance/PoliciesList";
import { PolicyDetail } from "../../insurance/PolicyDetail";
import { TypeCatalogAdmin } from "../../insurance/TypeCatalogAdmin";

export function InsuranceTab() {
  const navClassName = ({ isActive }: { isActive: boolean }) =>
    `rounded px-3 py-1.5 text-xs font-medium ${isActive ? "bg-blue-100 text-blue-800" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-2">
        <NavLink end to="/safety/insurance" className={navClassName}>
          Landing
        </NavLink>
        <NavLink to="/safety/insurance/policies" className={navClassName}>
          Policies
        </NavLink>
        <NavLink to="/safety/insurance/type-catalog" className={navClassName}>
          Type Catalog
        </NavLink>
        <NavLink to="/safety/insurance/coverage-gaps" className={navClassName}>
          Coverage Gaps
        </NavLink>
        <NavLink to="/safety/insurance/claims" className={navClassName}>
          Claims
        </NavLink>
        <NavLink to="/safety/insurance/lawsuits" className={navClassName}>
          Lawsuits
        </NavLink>
      </nav>

      <Routes>
        <Route index element={<InsuranceLanding />} />
        <Route path="policies" element={<PoliciesList />} />
        <Route path="policies/:policyId" element={<PolicyDetail />} />
        <Route path="type-catalog" element={<TypeCatalogAdmin />} />
        <Route path="coverage-gaps" element={<CoverageGapDashboard />} />
        <Route path="claims" element={<ClaimsTab />} />
        <Route path="lawsuits" element={<LawsuitsTab />} />
        <Route path="*" element={<Navigate to="/safety/insurance" replace />} />
      </Routes>
    </div>
  );
}
