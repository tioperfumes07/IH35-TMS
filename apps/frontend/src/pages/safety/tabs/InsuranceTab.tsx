import { Navigate, useLocation } from "react-router-dom";

/** Legacy Safety mount — redirect to canonical /insurance module (Rule 07: preserve URL via redirect).
 * Paths like /safety/insurance/claims → /insurance/claims (preserves any sub-path including claims). */
export function InsuranceTab() {
  const { pathname, search, hash } = useLocation();
  const suffix = pathname.replace(/^\/safety\/insurance\/?/, "");
  const target = suffix ? `/insurance/${suffix}` : "/insurance";
  return <Navigate to={`${target}${search}${hash}`} replace />;
}
