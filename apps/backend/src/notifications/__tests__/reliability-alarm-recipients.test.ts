import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// LST-F443363 — identity.users.role is identity.role_enum. Postgres has no `role_enum = text` operator, so
// `u.role = ANY($2::text[])` threw "operator does not exist" on every reliability-alarm run in prod (Render logs
// 10-25-2026 20:49Z) — recipients never loaded, so no on-screen or email alarm ever reached an owner/admin/manager.
const SRC = readFileSync(path.join(__dirname, "..", "reliability-alarm.ts"), "utf8");

describe("reliability-alarm recipients query", () => {
  it("compares the enum role as text against the text[] parameter", () => {
    expect(SRC).toMatch(/u\.role::text\s*=\s*ANY\(\$2::text\[\]\)/);
  });
  it("never compares the bare enum to a text array", () => {
    expect(SRC).not.toMatch(/u\.role\s*=\s*ANY\(\$2::text\[\]\)/);
  });
});
