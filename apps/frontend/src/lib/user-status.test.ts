import { describe, expect, it } from "vitest";
import { isInvitePending, userStatus } from "./user-status";

describe("userStatus", () => {
  it("is Inactive when deactivated, regardless of auth_method", () => {
    expect(userStatus({ auth_method: "Password", deactivated_at: "2026-08-01T00:00:00Z" })).toBe("Inactive");
    expect(userStatus({ auth_method: "Invite pending", deactivated_at: "2026-08-01T00:00:00Z" })).toBe("Inactive");
  });

  it("is Invited when auth_method is Invite pending and not deactivated — this is the live bug's exact repro shape", () => {
    // USERS-DETAIL-STATUS-MISMATCH: a user with no credentials yet must never read as "Active" —
    // that was the pre-fix UserDetail.tsx behavior (deactivated_at ? "Inactive" : "Active" alone).
    expect(userStatus({ auth_method: "Invite pending", deactivated_at: null })).toBe("Invited");
  });

  it("is Active once real credentials exist and the account is not deactivated", () => {
    expect(userStatus({ auth_method: "Password", deactivated_at: null })).toBe("Active");
    expect(userStatus({ auth_method: "Google", deactivated_at: null })).toBe("Active");
    expect(userStatus({ auth_method: undefined, deactivated_at: null })).toBe("Active");
  });
});

describe("isInvitePending", () => {
  it("is true only for the exact 'Invite pending' auth_method string", () => {
    expect(isInvitePending({ auth_method: "Invite pending" })).toBe(true);
    expect(isInvitePending({ auth_method: "Password" })).toBe(false);
    expect(isInvitePending({ auth_method: undefined })).toBe(false);
  });
});
