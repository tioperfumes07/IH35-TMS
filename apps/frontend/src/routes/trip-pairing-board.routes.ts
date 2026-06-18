import React from "react";
import type { ReactElement } from "react";
import { TripPairingBoardPage } from "../pages/dispatch/TripPairingBoardPage";

export type ManifestRoute = {
  path: string;
  component: ReactElement;
};

export const TRIP_PAIRING_BOARD_ROUTE: ManifestRoute = {
  path: "/dispatch/trip-pairing",
  component: React.createElement(TripPairingBoardPage),
};
