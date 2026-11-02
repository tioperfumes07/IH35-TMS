import { Navigate, useLocation } from "react-router-dom";

/**
 * ENG-60 / LEAD 443.332 (owner 10-24): lawsuits live only in Legal as legal.matters type=lawsuit.
 * insurance.lawsuit is empty and retired. Keep this module so old imports/tests resolve to the
 * canonical board; /insurance/lawsuits already redirects via InsuranceModuleShell.
 */
export function LawsuitsTab() {
  const { search } = useLocation();
  return <Navigate to={`/legal/lawsuits${search}`} replace />;
}
