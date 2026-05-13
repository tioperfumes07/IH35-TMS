import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const srcPath = fileURLToPath(new URL("../apps/backend/src/integrations/qbo/forensic-audit.service.ts", import.meta.url));

test("forensic audit logger awaits DB writes (no fire-and-forget void)", () => {
  const src = fs.readFileSync(srcPath, "utf8");
  assert.ok(!src.includes("void withLuciaBypass"), "auditBatchEvent must not discard the DB promise via void withLuciaBypass");
  assert.ok(/await\s+withLuciaBypass\s*\(/.test(src), "auditBatchEvent must await withLuciaBypass(...)");
});
