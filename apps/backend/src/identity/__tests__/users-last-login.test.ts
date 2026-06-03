import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const usersRoutesPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../users.routes.ts"
);

describe("identity users list last_login_at", () => {
  it("selects and returns last_login_at on the users list payload", () => {
    const src = fs.readFileSync(usersRoutesPath, "utf8");

    expect(src).toMatch(/last_login_at::text AS last_login_at/);
    expect(src).toMatch(/last_login_at: row\.last_login_at/);
  });
});
