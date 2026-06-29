import { describe, expect, it } from "vitest";
import pageSource from "./MyAccountantPage.tsx?raw";
import apiSource from "../../api/my-accountant.ts?raw";

const src = `${pageSource}\n${apiSource}`;

describe("MyAccountantPage write-guard (read-only accountant workspace)", () => {
  it("issues no mutating HTTP methods (no POST/PUT/PATCH/DELETE)", () => {
    expect(src).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
    expect(src).not.toMatch(/apiRequestFormData\s*\(/);
  });

  it("never calls period-close, reopen, or any close/posting write endpoint", () => {
    expect(src).not.toMatch(/\/periods\/[^"'`]*\/(close|reopen)/);
    expect(src).not.toMatch(/journal[-_]?entr/i);
    expect(src).not.toMatch(/posting-batch|\/post\b|\/void\b/);
  });

  it("does not wire any permission/invite grant write", () => {
    expect(src).not.toMatch(/grantAccess|inviteAccountant\s*\(/);
    expect(src).not.toMatch(/\/(invite|permissions?|access-grants?)[^"'`]*["'`]\s*,\s*\{[^}]*method/i);
  });

  it("only reads periods and builds read-only export download URLs", () => {
    expect(src).toMatch(/\/api\/v1\/accounting\/periods/);
    expect(src).toMatch(/\/export\/\$\{format\}|\/export\/(pdf|xlsx)/);
  });
});
