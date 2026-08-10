#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx", "utf8");
for (const token of [
  'import { EntityLink } from "../../components/shared/EntityLink"',
  'kind="driver"',
  "id={driverId}",
  'entityLabel(v, driverId, "Driver")',
]) {
  if (!source.includes(token)) throw new Error(`driver-hub request linkage guard: missing ${token}`);
}

console.log("verify-driver-hub-request-driver-link: PASS");
