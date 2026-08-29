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
 *   4. render.yaml preDeployCommand still runs ci:boot-*-smoke (those belong in GitHub CI).
 *   5. .github/workflows/ci.yml is missing ci:boot-api-smoke or ci:boot-aggregate-smoke.
 *   6. FAST-MERGE / Cursor INBOX still orders a Render kick after every merge (prod 502 window).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-g4-deploy-smoke-env-in-render";
const RENDER = path.join(ROOT, "render.yaml");
const DOC = path.join(ROOT, "docs/testing/boot-aggregate-smoke-env.md");
const CI_YML = path.join(ROOT, ".github/workflows/ci.yml");
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
  const preDeployLine = (backendBlock.match(/preDeployCommand:[^\n]+/) || [""])[0];
  if (/ci:boot-api-smoke|ci:boot-aggregate-smoke/.test(preDeployLine)) {
    errors.push(
      "render.yaml: preDeployCommand must NOT run ci:boot-*-smoke (those stay in GitHub CI; they 90s-fail docs deploys)",
    );
  }
  if (/db:verify:critical-runtime/.test(preDeployLine)) {
    errors.push(
      "render.yaml: preDeployCommand must be db:migrate only — db:verify:critical-runtime in preDeploy delayed PORT bind and caused Render update_failed",
    );
  }
  if (!fs.existsSync(CI_YML)) {
    errors.push(".github/workflows/ci.yml missing");
  } else {
    const ci = fs.readFileSync(CI_YML, "utf8");
    if (!ci.includes("npm run ci:boot-api-smoke")) {
      errors.push(".github/workflows/ci.yml must run npm run ci:boot-api-smoke");
    }
    if (!ci.includes("npm run ci:boot-aggregate-smoke")) {
      errors.push(".github/workflows/ci.yml must run npm run ci:boot-aggregate-smoke");
    }
  }
  if (!/buildFilter:/.test(backendBlock) || !/ignoredPaths:/.test(backendBlock) || !/docs\/bus\/\*\*/.test(backendBlock)) {
    errors.push("render.yaml ih35-tms-backend must ignore docs/bus/** (OUTBOX pings) not all docs/**");
  }
  if (!/healthCheckPath:\s*\/api\/v1\/healthz\/readyz/.test(backendBlock)) {
    errors.push("render.yaml ih35-tms-backend must set healthCheckPath: /api/v1/healthz/readyz");
  }
  const indexTsPath = path.join(ROOT, "apps/backend/src/index.ts");
  if (!fs.existsSync(indexTsPath)) {
    errors.push("apps/backend/src/index.ts missing");
  } else {
    const indexTs = fs.readFileSync(indexTsPath, "utf8");
    const listenIdx = indexTs.indexOf("await app.listen(");
    const cronsIdx = indexTs.indexOf("initializeAccountingCrons(");
    const bootAssertIdx = indexTs.indexOf("await assertMigrationDriftBootGuard(");
    if (listenIdx < 0 || cronsIdx < 0 || cronsIdx < listenIdx) {
      errors.push(
        "apps/backend/src/index.ts: initializeAccountingCrons must run AFTER app.listen (Render rolling-update health bind; recurring update_failed)",
      );
    }
    if (bootAssertIdx < 0 || bootAssertIdx < listenIdx) {
      errors.push(
        "apps/backend/src/index.ts: assertMigrationDriftBootGuard must run AFTER app.listen (Neon query must not delay PORT bind)",
      );
    }
  }
  for (const key of REQUIRED_KEYS) {
    const keyPattern = new RegExp(`-\\s*key:\\s*${key}\\b`);
    if (!keyPattern.test(backendBlock)) {
      errors.push(`render.yaml ih35-tms-backend envVars missing key: ${key}`);
    }
  }
  for (const key of ["ENABLE_QBO_CDC_POLL", "ENABLE_QBO_INBOUND_SYNC"]) {
    if (!new RegExp(`-\\s*key:\\s*${key}\\b`).test(backendBlock)) {
      errors.push(`render.yaml ih35-tms-backend envVars missing key: ${key}`);
    }
  }
  const envVarsHits = backendBlock.match(/^\s*envVars:/gm) || [];
  if (envVarsHits.length !== 1) {
    errors.push(
      `render.yaml ih35-tms-backend must have exactly one envVars: block (duplicate keys drop QBO flags; got ${envVarsHits.length})`,
    );
  }
  const healthRoutes = fs.readFileSync(path.join(ROOT, "apps/backend/src/health/health.routes.ts"), "utf8");
  if (!healthRoutes.includes('dormantReason: "env_disabled"') || !healthRoutes.includes("ENABLE_QBO_INBOUND_SYNC")) {
    errors.push(
      "health.routes.ts must skip inbound/CDC staleness when ENABLE_QBO_* is false (DRIFT-5 env_disabled)",
    );
  }
  // GO-0025-ACCT-R-04: docs/bus/PASTE-CURSOR-NOW.md was a per-cycle "paste box" for a specific
  // historical instruction round (U14/425c leftover) — deliberately deleted by
  // BUS-FINISH-ALL-FAST-MERGE-CLEAN (#15440) as bus-doc cleanup, not an accidental loss. This guard
  // still required it to exist, so CI has been red on main for this reason alone since that cleanup
  // landed. The guard's actual purpose (no live bus doc still orders a per-merge prod kick) stays
  // fully covered by the 4 remaining files below, which are all still actively maintained.
  const busFiles = [
    "docs/bus/FAST-MERGE-4MIN-LAW.md",
    "docs/bus/INBOX-CURSOR.md",
    "docs/bus/CODER-INSTRUCTIONS-NOW.md",
    "docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md",
  ];
  const kickRe = /Kick ih35-tms API when healthz SHA lags|Deploy API when healthz lags/i;
  for (const rel of busFiles) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      errors.push(`${rel} missing`);
      continue;
    }
    const text = fs.readFileSync(p, "utf8");
    if (kickRe.test(text)) {
      errors.push(
        `${rel} still orders a per-merge prod deploy (forbidden: docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md)`,
      );
    }
  }
  const deployLaw = fs.readFileSync(
    path.join(ROOT, "docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md"),
    "utf8",
  );
  if (!/every 5–10 merged PRs/.test(deployLaw)) {
    errors.push(
      "docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md must lock deploy cadence every 5–10 merged PRs (owner 2026-08-22)",
    );
  }
  if (!/never wait past 10/.test(deployLaw)) {
    errors.push(
      "docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md must hard-cap batches (never wait past 10 undeployed PRs)",
    );
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
    preDeployCommand: npm run db:migrate
    buildFilter:
      ignoredPaths:
        - docs/bus/**
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

function assertLivePreDeployMatchesYaml(errors) {
  const token = process.env.RENDER_API_KEY?.trim();
  const sid = process.env.IH35_RENDER_API_SERVICE_ID?.trim();
  if (!token || !sid) return;
  const res = spawnSync(
    "curl",
    ["-sS", "-H", `Authorization: Bearer ${token}`, `https://api.render.com/v1/services/${sid}`],
    { encoding: "utf8", timeout: 20000 },
  );
  if ((res.status ?? 1) !== 0) {
    errors.push(`live Render GET service ${sid} failed (exit ${res.status})`);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(res.stdout || "{}");
  } catch {
    errors.push("live Render GET service: body is not JSON");
    return;
  }
  const live =
    parsed.serviceDetails?.envSpecificDetails?.preDeployCommand ||
    parsed.service?.serviceDetails?.envSpecificDetails?.preDeployCommand ||
    "";
  const yamlLine = fs.readFileSync(RENDER, "utf8").match(/preDeployCommand:\s*(.+)/)?.[1]?.trim() ?? "";
  if (!live || live.trim() !== yamlLine) {
    errors.push(
      `live preDeployCommand ${JSON.stringify(live)} !== render.yaml ${JSON.stringify(yamlLine)} (DRIFT-3)`,
    );
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = assertConfigured();
  assertLivePreDeployMatchesYaml(errors);
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
