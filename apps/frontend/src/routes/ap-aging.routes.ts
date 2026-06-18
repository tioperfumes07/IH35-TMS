import React from "react";
import type { ReactElement } from "react";
import { AccountsPayableAgingPage } from "../pages/accounting/AccountsPayableAgingPage";

export type ManifestRoute = {
  path: string;
  component: ReactElement;
};

export const AP_AGING_ROUTE: ManifestRoute = {
  path: "/accounting/accounts-payable",
  component: React.createElement(AccountsPayableAgingPage),
};
