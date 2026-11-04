import { describe, expect, it } from "vitest";
import { userListName } from "./user-list-name.js";

// Row 233 (live 11-03): 14 users rendered the bare word "User".
describe("userListName — never the bare word User", () => {
  it("full name → email → Invited user (<role>)", () => {
    expect(userListName("Hugo Gaytan", "h@x.com", "Driver")).toBe("Hugo Gaytan");
    expect(userListName("", "codex.test.driver0034@ih35.test", "Driver")).toBe("codex.test.driver0034@ih35.test");
    expect(userListName("", null, "Driver")).toBe("Invited user (Driver)");
    expect(userListName("  ", "", "")).toBe("Invited user (no role)");
  });
});
