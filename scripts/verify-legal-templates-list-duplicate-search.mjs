#!/usr/bin/env node
/**
 * LEG-F3470 — LegalTemplatesListPage keeps server-side TableSearch in searchSlot
 * and must pass ParityTable suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx";
const SERVICE = "apps/backend/src/legal/templates.service.ts";
const ROUTES = "apps/backend/src/legal/templates.routes.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkPage(src) {
  assert(src.includes("ParityTable"), "LegalTemplatesListPage: must use ParityTable");
  assert(
    /placeholder=["']Search code or display name["']/.test(src),
    "LegalTemplatesListPage: must keep server-side Search code or display name",
  );
  assert(/suppressToolbarSearch/.test(src), "LegalTemplatesListPage: must pass suppressToolbarSearch");
  // Codex batch67 sibling — multi-status comma-union to the server (no client list filter).
  assert(
    src.includes("status.filter(isLegalTemplateStatus).join(\",\")"),
    "LegalTemplatesListPage: status multi-select must send allowlisted comma-union",
  );
  assert(
    !/status\.length <= 1[\s\S]{0,160}templates\.filter/.test(src),
    "LegalTemplatesListPage: must not client-filter templates for multi-status",
  );
}

export function checkService(src) {
  assert(src.includes("parseTemplateStatusFilter"), "templates.service must export parseTemplateStatusFilter");
  assert(
    src.includes("status = ANY($${values.length}::legal.contract_template_status[])"),
    "listTemplates must apply status ANY() for comma-unions",
  );
}

export function checkRoutes(src) {
  assert(
    /templateListStatusSchema/.test(src) && /parseTemplateStatusFilter/.test(src),
    "templates list status must allowlist comma-unions via templateListStatusSchema + parseTemplateStatusFilter (Codex batch71)",
  );
  assert(
    !/listQuerySchema[\s\S]{0,400}status:\s*z\.enum\(/.test(src),
    "templates listQuerySchema must not use scalar z.enum status (rejects draft,active)",
  );
}

function selftest() {
  const full = path.join(ROOT, PAGE);
  const good = fs.readFileSync(full, "utf8");
  const svcGood = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const routesGood = fs.readFileSync(path.join(ROOT, ROUTES), "utf8");
  checkPage(good);
  checkService(svcGood);
  checkRoutes(routesGood);
  const bad = good.replace(/\n\s*suppressToolbarSearch\n/, "\n");
  let failed = false;
  try {
    checkPage(bad);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  failed = false;
  try {
    checkPage(good.replace('status.filter(isLegalTemplateStatus).join(",")', "status.length === 1 ? status[0] : undefined"));
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL without status comma-union");
  failed = false;
  try {
    checkService(svcGood.replaceAll("status = ANY($${values.length}::legal.contract_template_status[])", "status = $REMOVED"));
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL without status ANY()");
  failed = false;
  try {
    checkRoutes(
      routesGood
        .replace(/const templateListStatusSchema[\s\S]*?\.optional\(\);/, "")
        .replace(/status:\s*templateListStatusSchema\.optional\(\)/, 'status: z.enum(["draft"]).optional()'),
    );
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL when route status is scalar enum");
  console.log("verify-legal-templates-list-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-legal-templates-list-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkPage(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
    checkService(fs.readFileSync(path.join(ROOT, SERVICE), "utf8"));
    checkRoutes(fs.readFileSync(path.join(ROOT, ROUTES), "utf8"));
    console.log("verify-legal-templates-list-duplicate-search PASS — LegalTemplates suppresses toolbar search + multi-status server union");
  } catch (e) {
    console.error(`verify-legal-templates-list-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
