/**
 * Committed Required maps for /program/matrix. Bundled in the frontend image so the
 * system rollup can paint when GET /api/v1/program/module-matrix 502s or hangs
 * (Render docs/** ignore + proxy HTML). Built/Live/Clicked still come from the API.
 */
import maintRequired from "@scoreboard/modules/maintenance.required.json";
import safetyRequired from "@scoreboard/modules/safety.required.json";
import insuranceRequired from "@scoreboard/modules/insurance.required.json";
import legalRequired from "@scoreboard/modules/legal.required.json";
import accountingRequired from "@scoreboard/modules/accounting.required.json";
import bankingRequired from "@scoreboard/modules/banking.required.json";
import dispatchRequired from "@scoreboard/modules/dispatch.required.json";
import settlementsRequired from "@scoreboard/modules/settlements.required.json";
import fuelRequired from "@scoreboard/modules/fuel.required.json";
import driversRequired from "@scoreboard/modules/drivers.required.json";
import fleetRequired from "@scoreboard/modules/fleet.required.json";
import customersRequired from "@scoreboard/modules/customers.required.json";
import vendorsRequired from "@scoreboard/modules/vendors.required.json";
import listsRequired from "@scoreboard/modules/lists.required.json";
import factoringRequired from "@scoreboard/modules/factoring.required.json";
import reportsRequired from "@scoreboard/modules/reports.required.json";
import inventoryRequired from "@scoreboard/modules/inventory.required.json";
import complianceRequired from "@scoreboard/modules/compliance.required.json";
import cashFlowRequired from "@scoreboard/modules/cash-flow.required.json";
import homeRequired from "@scoreboard/modules/home.required.json";
import programRequired from "@scoreboard/modules/program.required.json";
import tasksRequired from "@scoreboard/modules/tasks.required.json";
import form425Required from "@scoreboard/modules/form_425.required.json";
import financeRequired from "@scoreboard/modules/finance.required.json";
import docsRequired from "@scoreboard/modules/docs.required.json";
import systemRequired from "@scoreboard/modules/system.required.json";
import usersRequired from "@scoreboard/modules/users.required.json";
import helpRequired from "@scoreboard/modules/help.required.json";
import driverHubRequired from "@scoreboard/modules/driver-hub.required.json";
import type { MatrixModuleId } from "./moduleMatrixCatalog";

export type RequiredColumn = {
  id: string;
  group: string;
  label: string;
};

export type RequiredLeaf = {
  id: string;
  tab: string;
  sub?: string;
  route_hint: string;
  required: string[];
};

export type RequiredMap = {
  module: string;
  entity_default: string;
  columns: RequiredColumn[];
  leaves: RequiredLeaf[];
};

export const REQUIRED_BY_MODULE: Record<MatrixModuleId, RequiredMap> = {
  maintenance: maintRequired as RequiredMap,
  safety: safetyRequired as RequiredMap,
  insurance: insuranceRequired as RequiredMap,
  legal: legalRequired as RequiredMap,
  accounting: accountingRequired as RequiredMap,
  banking: bankingRequired as RequiredMap,
  dispatch: dispatchRequired as RequiredMap,
  settlements: settlementsRequired as RequiredMap,
  fuel: fuelRequired as RequiredMap,
  drivers: driversRequired as RequiredMap,
  fleet: fleetRequired as RequiredMap,
  customers: customersRequired as RequiredMap,
  vendors: vendorsRequired as RequiredMap,
  lists: listsRequired as RequiredMap,
  factoring: factoringRequired as RequiredMap,
  reports: reportsRequired as RequiredMap,
  inventory: inventoryRequired as RequiredMap,
  compliance: complianceRequired as RequiredMap,
  "cash-flow": cashFlowRequired as RequiredMap,
  home: homeRequired as RequiredMap,
  program: programRequired as RequiredMap,
  tasks: tasksRequired as RequiredMap,
  form_425: form425Required as RequiredMap,
  finance: financeRequired as RequiredMap,
  docs: docsRequired as RequiredMap,
  system: systemRequired as RequiredMap,
  users: usersRequired as RequiredMap,
  help: helpRequired as RequiredMap,
  "driver-hub": driverHubRequired as RequiredMap,
};
