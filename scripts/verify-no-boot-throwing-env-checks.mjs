#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = process.cwd();
const DIST_ROOT = fs.existsSync(path.join(ROOT, "apps/backend/dist")) ? path.join(ROOT, "apps/backend/dist") : path.join(ROOT, "dist");

if (!fs.existsSync(DIST_ROOT)) {
  console.error(`verify:no-boot-throwing-env-checks failed: dist root not found at ${DIST_ROOT}`);
  process.exit(1);
}

const KNOWN_OFFENDERS_DEBT = [
  { file: "dist/auth/db.js", envs: ["IH35_BOOT_API_SMOKE", "NODE_ENV"], tracker: "P7-AUDIT-P0-2-HOTFIX-2" },
  { file: "dist/auth/routes.js", envs: ["CORS_ALLOWED_ORIGINS"], tracker: "P7-AUDIT-P0-2-HOTFIX-2" },
  { file: "dist/cron/geofence-breach-detector.cron.js", envs: ["GEOFENCE_BREACH_CRON_ENABLED"], tracker: "P7-AUDIT-P0-2-HOTFIX-2" },
  { file: "dist/driver/driver-jwt.js", envs: ["DRIVER_JWT_SECRET", "NODE_ENV"], tracker: "P7-AUDIT-P0-2-HOTFIX-2" },
  { file: "dist/email/render.js", envs: ["NODE_ENV"], tracker: "P7-AUDIT-P0-2-HOTFIX-2" },
  { file: "dist/identity/password-reset.routes.js", envs: ["FRONTEND_BASE_URL"], tracker: "P7-AUDIT-P0-2-HOTFIX-2" },
  {
    file: "dist/index.js",
    envs: ["CORS_ALLOWED_ORIGINS", "SKIP_MIGRATION_VERIFICATION", "PORT", "ENABLE_OUTBOX_PROCESSOR"],
    tracker: "P7-AUDIT-P0-2-HOTFIX-2",
  },
  {
    file: "dist/integrations/qbo/forensic-import.service.js",
    envs: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_EVIDENCE", "R2_BUCKET"],
    tracker: "P7-AUDIT-P0-2-HOTFIX-2",
  },
  {
    file: "dist/legal/contracts.service.js",
    envs: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "SIGNER_APP_BASE_URL", "FRONTEND_BASE_URL"],
    tracker: "P7-AUDIT-P0-2-HOTFIX-2",
  },
  {
    file: "dist/legal/matters.service.js",
    envs: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"],
    tracker: "P7-AUDIT-P0-2-HOTFIX-2",
  },
  {
    file: "dist/legal/templates.service.js",
    envs: ["SIGNER_APP_BASE_URL", "FRONTEND_BASE_URL"],
    tracker: "P7-AUDIT-P0-2-HOTFIX-2",
  },
  { file: "dist/middleware/rate-limit.js", envs: ["REDIS_URL", "SENTRY_DSN"], tracker: "P7-AUDIT-P0-2-HOTFIX-2" },
  {
    file: "dist/services/push-notification.service.js",
    envs: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    tracker: "P7-AUDIT-P0-2-HOTFIX-2",
  },
  { file: "dist/storage/r2-client.js", envs: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"], tracker: "P7-AUDIT-P0-2-HOTFIX-2" },
];

const KNOWN_THROWING_CONSTRUCTORS = new Set(["Twilio", "Google"]);

function collectFiles(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(p));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}

function relativeDistPath(absPath) {
  const rel = path.relative(ROOT, absPath).replace(/\\/g, "/");
  return rel.startsWith("apps/backend/dist/") ? rel.replace("apps/backend/", "") : rel;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function collectEnvNames(node, envs = new Set()) {
  function visit(current) {
    if (current !== node && isFunctionLike(current)) return;
    if (
      ts.isPropertyAccessExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === "process" &&
      current.expression.name.text === "env"
    ) {
      envs.add(current.name.text);
    }
    if (
      ts.isElementAccessExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === "process" &&
      current.expression.name.text === "env" &&
      ts.isStringLiteralLike(current.argumentExpression)
    ) {
      envs.add(current.argumentExpression.text);
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return envs;
}

function findFirstViolationNode(statement) {
  let found = null;
  function visit(node) {
    if (found || (node !== statement && isFunctionLike(node))) return;

    if (ts.isThrowStatement(node)) {
      found = node;
      return;
    }

    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && KNOWN_THROWING_CONSTRUCTORS.has(node.expression.text)) {
      found = node;
      return;
    }

    ts.forEachChild(node, visit);
  }
  visit(statement);
  return found;
}

const requiredEnvModulePath = fs.existsSync(path.join(ROOT, "apps/backend/dist/config/required-env.js"))
  ? pathToFileURL(path.join(ROOT, "apps/backend/dist/config/required-env.js")).href
  : pathToFileURL(path.join(ROOT, "dist/config/required-env.js")).href;
const requiredEnvModule = await import(requiredEnvModulePath);
const allowlist = new Set(
  (requiredEnvModule.REQUIRED_ENV ?? [])
    .filter((entry) => entry.behavior_in_prod === "hard_fail_at_boot")
    .map((entry) => entry.name)
);
allowlist.add("DATABASE_DIRECT_URL");

const debtIndex = new Map();
for (const debt of KNOWN_OFFENDERS_DEBT) {
  for (const envName of debt.envs) {
    debtIndex.set(`${debt.file}:${envName}`, debt);
  }
}

const violations = [];
for (const file of collectFiles(DIST_ROOT)) {
  const relDist = relativeDistPath(file);
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);

  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      continue;
    }
    const envs = [...collectEnvNames(statement)];
    if (envs.length === 0) continue;

    const violationNode = findFirstViolationNode(statement);
    if (!violationNode) continue;
    const isThrowViolation = ts.isThrowStatement(violationNode);
    if (isThrowViolation && envs.some((envName) => allowlist.has(envName))) {
      continue;
    }

    for (const envName of envs) {
      if (allowlist.has(envName)) continue;
      const debt = debtIndex.get(`${relDist}:${envName}`);
      if (debt) {
        console.log(`DEBT (exempt until ${debt.tracker}): ${relDist}:${envName}`);
        continue;
      }
      const { line } = sf.getLineAndCharacterOfPosition(violationNode.getStart(sf));
      violations.push({ file: relDist, line: line + 1, env: envName });
    }
  }
}

console.log(
  `verify:no-boot-throwing-env-checks: ${KNOWN_OFFENDERS_DEBT.length} debt entries remaining; remove via P7-AUDIT-P0-2-HOTFIX-2.`
);

if (violations.length > 0) {
  console.error("verify:no-boot-throwing-env-checks failed");
  for (const v of violations) {
    console.error(`${v.file}:${v.line} env=${v.env}`);
  }
  process.exit(1);
}

console.log("verify:no-boot-throwing-env-checks: ok");
