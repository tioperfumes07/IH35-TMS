import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.resolve(root, "scripts/verify-trailer-wo-equipment-id.mjs");

test("verify-trailer-wo-equipment-id script exists and references B26 surfaces", () => {
  assert.ok(fs.existsSync(scriptPath));
  const src = fs.readFileSync(scriptPath, "utf8");
  assert.match(src, /0358_work_orders_equipment_id/);
  assert.match(src, /TrailerRecentActivitySection/);
});
