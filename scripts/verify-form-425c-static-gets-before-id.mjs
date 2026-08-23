#!/usr/bin/env node
/**
 * Guard: GET /api/v1/form-425c/profiles and /banking-summary must be registered
 * before GET /:id or Fastify treats those paths as UUID ids → 400 (dead Profiles / banking import).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesPath = path.join(root, "apps/backend/src/compliance/form-425c.routes.ts");

function orderOk(src) {
  const profiles = src.indexOf('app.get("/api/v1/form-425c/profiles"');
  const banking = src.indexOf('app.get("/api/v1/form-425c/banking-summary"');
  const byId = src.indexOf('app.get("/api/v1/form-425c/:id"');
  return profiles >= 0 && banking >= 0 && byId >= 0 && profiles < byId && banking < byId;
}

function selftest() {
  const planted = `
    app.get("/api/v1/form-425c/:id", () => {});
    app.get("/api/v1/form-425c/profiles", () => {});
    app.get("/api/v1/form-425c/banking-summary", () => {});
  `;
  if (orderOk(planted)) {
    console.error("selftest FAIL: planted :id-first source should fail");
    process.exit(1);
  }
  const good = `
    app.get("/api/v1/form-425c/profiles", () => {});
    app.get("/api/v1/form-425c/banking-summary", () => {});
    app.get("/api/v1/form-425c/:id", () => {});
  `;
  if (!orderOk(good)) {
    console.error("selftest FAIL: static-first source should pass");
    process.exit(1);
  }
  console.log("verify-form-425c-static-gets-before-id --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const src = fs.readFileSync(routesPath, "utf8");
  if (!orderOk(src)) {
    console.error("FAIL: form-425c static GET /profiles and /banking-summary must register before GET /:id");
    process.exit(1);
  }
  console.log("verify-form-425c-static-gets-before-id PASS");
}
