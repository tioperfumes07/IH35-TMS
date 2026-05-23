#!/usr/bin/env node
import fs from "node:fs";

const routeFile = "apps/backend/src/telematics/dashcam-on-demand.routes.ts";
const rbacFile = "apps/backend/src/telematics/dashcam-rbac.ts";
const routeSrc = fs.readFileSync(routeFile, "utf8");
const src = fs.readFileSync(rbacFile, "utf8");
const required = [
  "role === \"owner\"",
  "role === \"administrator\"",
  "role === \"safety_lead\"",
  "if (!canAccessDashcam(user.role)) return reply.code(403).send({ error: \"forbidden\" });",
];

const missing = required.filter((snippet) => !(src.includes(snippet) || routeSrc.includes(snippet)));
if (missing.length > 0) {
  console.error("verify-dashcam-rbac-restrict failed");
  for (const snippet of missing) console.error(`  missing: ${snippet}`);
  process.exit(1);
}

console.log("verify-dashcam-rbac-restrict: ok");
