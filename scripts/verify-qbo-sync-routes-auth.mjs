#!/usr/bin/env node
/**
 * verify:qbo-sync-routes-auth — route-auth contract for the canonical
 * /api/v1/qbo/sync/* backend family.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "apps", "backend", "src", "qbo");
const routeFiles = fs
  .readdirSync(DIR)
  .filter((file) => file.endsWith(".routes.ts"))
  .map((file) => path.join(DIR, file));

function inspect(sources) {
  const problems = [];
  let handlerCount = 0;

  for (const [file, text] of sources) {
    const rel = path.relative(ROOT, file);
    // Allow Fastify's optional route-options object between the path and handler. The bounded
    // window avoids accidentally pairing a path with a later, unrelated handler.
    const routeRe = /app\.(get|post|put|patch|delete)\(\s*(["'`])(\/api\/v1\/qbo\/sync\/[^"'`]+)\2[\s\S]{0,600}?\basync\s*\([^)]*\)\s*=>\s*\{/g;
    let match;
    let fileHandlers = 0;
    while ((match = routeRe.exec(text)) !== null) {
      handlerCount += 1;
      fileHandlers += 1;
      const routePath = match[3];
      let depth = 1;
      let index = routeRe.lastIndex;
      for (; index < text.length && depth > 0; index += 1) {
        if (text[index] === "{") depth += 1;
        else if (text[index] === "}") depth -= 1;
      }
      const body = text.slice(routeRe.lastIndex, index);
      if (!/\b(?:requireAuth|currentAuthUser)\s*\(/.test(body)) {
        problems.push(`${rel}: route ${routePath} has no requireAuth/currentAuthUser guard in its handler`);
      }
    }

    if (
      fileHandlers > 0 &&
      !/import[^;]*\b(?:requireAuth|currentAuthUser)\b[^;]*from\s*["'][^"']+(?:auth\/session-middleware|accounting\/shared)\.js["']/.test(text)
    ) {
      problems.push(`${rel}: qbo sync handlers must import requireAuth or currentAuthUser from a canonical auth-bearing module`);
    }
  }

  if (handlerCount === 0) problems.push("no /api/v1/qbo/sync/* route registrations matched — guard target moved or parser is stale");
  return { handlerCount, problems };
}

if (routeFiles.length === 0) {
  console.error("verify:qbo-sync-routes-auth — FAILED\n- no *.routes.ts files found under apps/backend/src/qbo — guard target moved");
  process.exit(1);
}

const sources = new Map(routeFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));

if (process.argv.includes("--selftest")) {
  const target = routeFiles.find((file) => sources.get(file)?.includes("/api/v1/qbo/sync/"));
  if (!target) throw new Error("selftest could not find a canonical qbo sync route");
  const planted = new Map(sources);
  planted.set(target, sources.get(target).replace(/\bcurrentAuthUser\s*\(/, "removedAuthGuard("));
  const result = inspect(planted);
  if (!result.problems.some((problem) => problem.includes("has no requireAuth/currentAuthUser guard"))) {
    throw new Error("planted unauthenticated qbo sync handler escaped");
  }
  console.log("verify:qbo-sync-routes-auth SELFTEST PASS — planted unauthenticated handler rejected");
  process.exit(0);
}

const result = inspect(sources);
if (result.problems.length > 0) {
  console.error("verify:qbo-sync-routes-auth — FAILED");
  for (const problem of result.problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`verify:qbo-sync-routes-auth — OK (${result.handlerCount} qbo sync route handlers, all auth-guarded)`);
