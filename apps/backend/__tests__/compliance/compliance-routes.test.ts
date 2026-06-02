import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("compliance routes", () => {
  it("registers dashboard endpoints", () => {
    const src = fs.readFileSync(path.join(here, "../../src/compliance/compliance.routes.ts"), "utf8");
    assert.match(src, /\/api\/v1\/compliance\/dashboard/);
    assert.match(src, /\/api\/v1\/compliance\/dashboard\/summary/);
    assert.match(src, /\/api\/v1\/compliance\/notification-log/);
  });
});
