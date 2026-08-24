#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

try {
  const usersRoutes = read("apps/backend/src/identity/users.routes.ts");
  assertIncludes(usersRoutes, 'app.get("/api/v1/identity/users"', "Users list route missing");
  assertIncludes(usersRoutes, 'app.post("/api/v1/identity/users"', "Users create route missing");
  assertIncludes(usersRoutes, 'app.post("/api/v1/identity/users/:id/deactivate"', "Users deactivate route missing");
  assertIncludes(usersRoutes, "initial_password", "Users route missing initial password support");
  assertIncludes(usersRoutes, "send_password_setup_invite", "Users route missing invite password setup option");

  const officeLoginRoutes = read("apps/backend/src/auth/office-login.routes.ts");
  assertIncludes(officeLoginRoutes, 'app.post("/api/v1/auth/office/email-login"', "Office password login route missing");
  assertIncludes(officeLoginRoutes, "enforceOfficePasswordLoginLimits", "Office login route missing rate-limit enforcement");
  assertIncludes(officeLoginRoutes, "auth.office_email_login.succeeded", "Office login audit event missing");

  // H4-4 (Security): office-login must NOT leak account/role existence via distinct
  // responses or timing. Every failure returns a uniform 401 invalid_credentials, and
  // the not-found / no-password branches must still pay the argon2 cost (dummy hash).
  assertIncludes(
    officeLoginRoutes,
    "DUMMY_PASSWORD_HASH_PROMISE",
    "Office login missing constant-time dummy hash (H4-4 timing oracle regression)"
  );
  assertIncludes(
    officeLoginRoutes,
    "sendUniformLoginFailure",
    "Office login missing uniform failure response helper (H4-4 enumeration oracle regression)"
  );
  if (officeLoginRoutes.includes("use_driver_portal")) {
    throw new Error(
      "Office login leaks role existence: driver-role must return the uniform 401, not a distinct 403 use_driver_portal (H4-4 enumeration oracle regression)"
    );
  }
  // The wrong-password 401 and the collapsed failure path must share one message shape.
  const officeInvalidCreds = (officeLoginRoutes.match(/error:\s*"invalid_credentials"/g) ?? []).length;
  if (officeInvalidCreds < 1) {
    throw new Error("Office login missing uniform invalid_credentials response (H4-4)");
  }
  // Exactly one argon2 verify call, reached on every path (constant-time).
  const officeVerifyCalls = (officeLoginRoutes.match(/argon2id\.verify\(/g) ?? []).length;
  if (officeVerifyCalls !== 1) {
    throw new Error(
      `Office login must perform exactly one argon2id.verify() on every path for constant time; found ${officeVerifyCalls} (H4-4)`
    );
  }

  const usersPage = read("apps/frontend/src/pages/Users.tsx");
  assertIncludes(usersPage, "+ Create User", "Users page create-user action missing");
  assertIncludes(usersPage, "Auth method", "Users page auth method column missing");
  assertIncludes(usersPage, "Initial password", "Users page initial password option missing");

  const loginPage = read("apps/frontend/src/pages/Login.tsx");
  assertIncludes(loginPage, "Sign in with email", "Login page email/password action missing");
  assertIncludes(loginPage, "Sign in with Google", "Login page Google sign-in action missing");
  assertIncludes(
    loginPage,
    "isError && !isUnauthenticated",
    "Login must show email/Google form on 401 — not the hung session wall"
  );

  console.log("✅ User management/password-auth guard passed");
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exit(1);
}
