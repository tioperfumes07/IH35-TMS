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

  const usersPage = read("apps/frontend/src/pages/Users.tsx");
  assertIncludes(usersPage, "+ Create User", "Users page create-user action missing");
  assertIncludes(usersPage, "Auth method", "Users page auth method column missing");
  assertIncludes(usersPage, "Initial password", "Users page initial password option missing");

  const loginPage = read("apps/frontend/src/pages/Login.tsx");
  assertIncludes(loginPage, "Sign in with email", "Login page email/password action missing");
  assertIncludes(loginPage, "Sign in with Google", "Login page Google sign-in action missing");

  console.log("✅ User management/password-auth guard passed");
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exit(1);
}
