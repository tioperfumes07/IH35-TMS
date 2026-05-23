#!/usr/bin/env node
import fs from "node:fs";

const servicePath = "apps/backend/src/telematics/fuel-stop-planner.service.ts";
if (!fs.existsSync(servicePath)) throw new Error(`Missing file: ${servicePath}`);
const service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("getCurrentClocks")) {
  throw new Error("CAP-6 requires HOS integration; expected getCurrentClocks usage in fuel-stop-planner.service.ts");
}

console.log("verify-fuel-stop-planner-uses-cap-hos: ok");
