#!/usr/bin/env node
/**
 * verify-g4-deploy-smoke-env-in-render — G4-DEPLOY / ACCT-R-04 guard (verify-step 1492).
 *
 * preDeploy ci:boot-aggregate-smoke supports IH35_SMOKE_UNIT_ID +
 * IH35_SMOKE_OPERATING_COMPANY_ID (scripts/ci-boot-aggregate-smoke.mjs:157-159), but deploy
 * config must declare both keys so Render operators set stable prod UUIDs instead of relying on
 * "newest live TRANSP unit" discovery.
 *
 * FAILS IF:
 *   1. render.yaml is missing or ih35-tms-backend service block is absent.
 *   2. Either smoke env key is not declared under ih35-tms-backend envVars.
 *   3. docs/testing/boot-aggregate-smoke-env.md is missing or does not name both keys.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-g4-deploy-smoke-env-in-render";
const RENDER = path.join(ROOT, "render.yaml");
const DOC = path.join(ROOT, "docs/testing/boot-aggregate-smoke-env.md");
const REQUIRED_KEYS = ["IH35_SMOKE_UNIT_ID", "IH35_SMOKE_OPERATING_COMPANY_ID"];

function extractBackendEnvBlock(renderText) {
  const backendIdx = renderText.indexOf("name: ih35-tms-backend");
  if (backendIdx < 0) return null;
  const nextServiceIdx = renderText.indexOf("\n  - type:", backendIdx + 1);
  return nextServiceIdx >= 0 ? renderText.slice(backendIdx, nextServiceIdx) : renderText.slice(backendIdx);
}

function assertConfigured() {
  const errors = [];
  if (!fs.existsSync(RENDER)) {
    errors.push("render.yaml missing");
    return errors;
  }
  const render = fs.readFileSync(RENDER, "utf8");
  const backendBlock = extractBackendEnvBlock(render);
  if (!backendBlock) {
    errors.push("render.yaml: ih35-tms-backend service block not found");
    return errors;
  }
  if (!/preDeployCommand:.*ci:boot-aggregate-smoke/.test(render)) {
    errors.push("render.yaml: preDeployCommand must run ci:boot-aggregate-smoke");
  }
  if (!/buildFilter:/.test(backendBlock) || !/ignoredPaths:/.test(backendBlock) || !/docs\/\*\*/.test(backendBlock)) {
    errors.push("render.yaml ih35-tms-backend must ignore docs/** so OUTBOX-only merges do not 502 the API");
  }
  for (const key of REQUIRED_KEYS) {
    const keyPattern = new RegExp(`-\\s*key:\\s*${key}\\b`);
    if (!keyPattern.test(backendBlock)) {
      errors.push(`render.yaml ih35-tms-backend envVars missing key: ${key}`);
    }
  }
  if (!fs.existsSync(DOC)) {
    errors.push("docs/testing/boot-aggregate-smoke-env.md missing");
  } else {
    const doc = fs.readFileSync(DOC, "utf8");
    for (const key of REQUIRED_KEYS) {
      if (!doc.includes(key)) {
        errors.push(`docs/testing/boot-aggregate-smoke-env.md must document ${key}`);
      }
    }
    if (!doc.includes("ci:boot-aggregate-smoke")) {
      errors.push("docs/testing/boot-aggregate-smoke-env.md must reference ci:boot-aggregate-smoke");
    }
  }
  return errors;
}

function selftest() {
  const goodRender = `
services:
  - type: web
    name: ih35-tms-backend
    preDeployCommand: npm run ci:boot-aggregate-smoke
    buildFilter:
      ignoredPaths:
        - docs/**
    envVars:
      - key: NODE_VERSION
        value: 22
      - key: IH35_SMOKE_UNIT_ID
        sync: false
      - key: IH35_SMOKE_OPERATING_COMPANY_ID
        sync: false
  - type: static
    name: ih35-tms-frontend
`;
  const badRender = `
services:
  - type: web
    name: ih35-tms-backend
    envVars:
      - key: NODE_VERSION
        value: 22
`;
  const goodDoc = `
# boot smoke
IH35_SMOKE_UNIT_ID
IH35_SMOKE_OPERATING_COMPANY_ID
ci:boot-aggregate-smoke
`;
  const tmpRender = path.join(ROOT, ".verify-g4-deploy-smoke-env-in-render.render.yaml");
  const tmpDoc = path.join(ROOT, ".verify-g4-deploy-smoke-env-in-render.doc.md");
  try {
    fs.writeFileSync(tmpRender, goodRender, "utf8");
    fs.writeFileSync(tmpDoc, goodDoc, "utf8");
    const goodBackend = extractBackendEnvBlock(goodRender);
    for (const key of REQUIRED_KEYS) {
      if (!new RegExp(`-\\s*key:\\s*${key}\\b`).test(goodBackend ?? "")) {
        console.error(`${LABEL} --selftest FAIL good fixture missing ${key}`);
        process.exit(1);
      }
    }
    const badBackend = extractBackendEnvBlock(badRender);
    const badMissing = REQUIRED_KEYS.filter((key) => !new RegExp(`-\\s*key:\\s*${key}\\b`).test(badBackend ?? ""));
    if (badMissing.length < 2) {
      console.error(`${LABEL} --selftest FAIL bad fixture should miss both keys`);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest PASS`);
  } finally {
    if (fs.existsSync(tmpRender)) fs.unlinkSync(tmpRender);
    if (fs.existsSync(tmpDoc)) fs.unlinkSync(tmpDoc);
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = assertConfigured();
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: render.yaml ih35-tms-backend declares ${REQUIRED_KEYS.join(" + ")}; doc present.`,
  );
}

main();
