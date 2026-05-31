import fs from "node:fs";
import path from "node:path";

const rootIndexPath = path.resolve("apps/backend/src/index.ts");
const customerIndexPath = path.resolve("apps/backend/src/customers/index.ts");
const detailRoutePath = path.resolve("apps/backend/src/customers/detail.routes.ts");

const rootIndex = fs.readFileSync(rootIndexPath, "utf8");
const customerIndex = fs.readFileSync(customerIndexPath, "utf8");
const detailRoute = fs.readFileSync(detailRoutePath, "utf8");

const checks = [
  {
    ok: rootIndex.includes('import { registerCustomerDetailAliasRoutes } from "./mdata/customer-detail-alias.routes.js";'),
    msg: "root index imports registerCustomerDetailAliasRoutes",
  },
  {
    ok: rootIndex.includes('await registerCustomerDetailAliasRoutes(app);'),
    msg: "root index registers customer detail alias routes",
  },
  {
    ok: rootIndex.includes('import { registerCustomerRoutes } from "./customers/index.js";'),
    msg: "root index imports registerCustomerRoutes",
  },
  {
    ok: rootIndex.includes('await registerCustomerRoutes(app);'),
    msg: "root index registers customer routes",
  },
  {
    ok: customerIndex.includes('import { registerCustomerDetailRoutes } from "./detail.routes.js";'),
    msg: "customers index imports registerCustomerDetailRoutes",
  },
  {
    ok: customerIndex.includes('await registerCustomerDetailRoutes(app);'),
    msg: "customers index registers detail routes",
  },
  {
    ok: detailRoute.includes('"/api/v1/customers/:id/detail"'),
    msg: "detail route defines /api/v1/customers/:id/detail",
  },
  {
    ok: detailRoute.includes('/api/v1/mdata/customers/${params.id}/detail'),
    msg: "detail route forwards to mdata detail endpoint",
  },
];

const failures = checks.filter((c) => !c.ok);
if (failures.length > 0) {
  console.error("Customer routes registration guard failed:");
  for (const failure of failures) {
    console.error(`- Missing: ${failure.msg}`);
  }
  process.exit(1);
}

console.log("Customer route registrations verified (detail + alias wiring).\n");
