#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionCreateSrc = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/auth/session-create.ts"),
  "utf8"
);
const officeLoginSrc = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/auth/office-login.routes.ts"),
  "utf8"
);

const updatePattern = /UPDATE\s+identity\.users\s+SET\s+last_login_at\s*=\s*now\(\)/i;

if (!updatePattern.test(sessionCreateSrc)) {
  console.error(
    "verify:session-create-updates-last-login FAIL: session-create handler must UPDATE identity.users.last_login_at"
  );
  process.exit(1);
}

if (!officeLoginSrc.includes("createSessionWithLastLogin")) {
  console.error(
    "verify:session-create-updates-last-login FAIL: office email login must use createSessionWithLastLogin"
  );
  process.exit(1);
}

console.log("verify:session-create-updates-last-login PASS");
