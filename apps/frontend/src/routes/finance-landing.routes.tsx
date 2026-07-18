import React, { type ReactNode } from "react";
import { Route } from "react-router-dom";
import { FinanceHubPage } from "../pages/finance/FinanceHubPage";

const FinanceOverviewPage = React.lazy(() =>
  import("../pages/finance/FinanceOverviewPage").then((module) => ({
    default: module.FinanceOverviewPage,
  })),
);

type ProtectRoute = (page: ReactNode) => ReactNode;

const passthrough: ProtectRoute = (page) => page;

/**
 * The canonical Finance landing routes share one source of truth between the
 * application manifest and behavioral route tests.
 */
export function createFinanceLandingRoutes(
  protect: ProtectRoute = passthrough,
): React.ReactElement[] {
  return [
    <Route
      key="finance-hub-canonical"
      path="/finance"
      element={protect(<FinanceHubPage />)}
    />,
    <Route
      key="finance-overview"
      path="/finance/overview"
      element={protect(<FinanceOverviewPage />)}
    />,
    <Route
      key="finance-hub-legacy"
      path="/finance/hub"
      element={protect(<FinanceHubPage />)}
    />,
  ];
}
