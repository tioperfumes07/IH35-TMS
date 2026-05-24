import React from "react";
import type { ReactElement } from "react";
import { CollectionsPage } from "../pages/accounting/CollectionsPage";

export type ManifestRoute = {
  path: string;
  component: ReactElement;
};

export const COLLECTIONS_ROUTE: ManifestRoute = {
  path: "/accounting/collections",
  component: React.createElement(CollectionsPage),
};
