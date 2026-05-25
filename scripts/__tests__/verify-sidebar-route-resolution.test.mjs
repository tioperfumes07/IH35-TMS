import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const script = path.resolve(root, "scripts/verify-sidebar-route-resolution.mjs");

test("fails when sidebar href lacks matching route", () => {
  const repo = path.resolve(root, ".tmp-sidebar-negative");
  spawnSync("rm", ["-rf", repo]);
  fs.mkdirSync(path.join(repo, "apps/frontend/src/components/layout"), { recursive: true });
  fs.mkdirSync(path.join(repo, "apps/frontend/src/routes"), { recursive: true });
  fs.writeFileSync(path.join(repo, "apps/frontend/src/components/layout/sidebar-config.ts"), 'export const SIDEBAR_ITEM_META = { docs: { to: "/docs" } };\n');
  fs.writeFileSync(path.join(repo, "apps/frontend/src/routes/manifest.tsx"), "export const ROUTES = [];\n");
  const run = spawnSync("node", [script], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 1);
});

test("passes when route exists and does not redirect home", () => {
  const repo = path.resolve(root, ".tmp-sidebar-positive");
  spawnSync("rm", ["-rf", repo]);
  fs.mkdirSync(path.join(repo, "apps/frontend/src/components/layout"), { recursive: true });
  fs.mkdirSync(path.join(repo, "apps/frontend/src/routes"), { recursive: true });
  fs.writeFileSync(path.join(repo, "apps/frontend/src/components/layout/sidebar-config.ts"), 'export const SIDEBAR_ITEM_META = { docs: { to: "/docs" } };\n');
  fs.writeFileSync(path.join(repo, "apps/frontend/src/routes/manifest.tsx"), '<Route path="/docs" element={<DocsPage />} />\n');
  const run = spawnSync("node", [script], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 0);
});
