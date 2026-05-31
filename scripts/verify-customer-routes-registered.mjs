import fs from "node:fs";
import path from "node:path";

const rootIndexPath = path.resolve("apps/backend/src/index.ts");
const customerIndexPath = path.resolve("apps/backend/src/customers/index.ts");
const customerRoutesDir = path.resolve("apps/backend/src/customers");

const rootIndex = fs.readFileSync(rootIndexPath, "utf8");
const customerIndex = fs.readFileSync(customerIndexPath, "utf8");

const checks = [
  {
    ok: rootIndex.includes('import { registerCustomerRoutes } from "./customers/index.js";'),
    msg: "root index imports registerCustomerRoutes",
  },
  {
    ok: rootIndex.includes("await registerCustomerRoutes(app);"),
    msg: "root index registers customer routes",
  },
];

const routeFiles = fs
  .readdirSync(customerRoutesDir)
  .filter((name) => name.endsWith(".routes.ts"))
  .sort();

for (const routeFile of routeFiles) {
  const routePath = path.join(customerRoutesDir, routeFile);
  const source = fs.readFileSync(routePath, "utf8");
  const fnMatch = source.match(/export\s+async\s+function\s+(register\w+Routes)\s*\(/);

  if (!fnMatch) {
    checks.push({ ok: false, msg: `${routeFile} exports register*Routes function` });
    continue;
  }

  const fnName = fnMatch[1];
  checks.push({
    ok: customerIndex.includes(fnName),
    msg: `customers index references ${fnName} from ${routeFile}`,
  });
  checks.push({
    ok: customerIndex.includes(`await ${fnName}(app);`),
    msg: `customers index registers ${fnName}`,
  });
}

const failures = checks.filter((c) => !c.ok);
if (failures.length > 0) {
  console.error("Customer routes registration guard failed:");
  for (const failure of failures) {
    console.error(`- Missing: ${failure.msg}`);
  }
  process.exit(1);
}

console.log("Customer route registrations verified (all customers/*.routes.ts wired).");
