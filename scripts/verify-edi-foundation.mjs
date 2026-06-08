#!/usr/bin/env node
/**
 * GAP-70 CI guard — EDI Integration Foundation (204/214/210/990).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      failures.push(`${relativePath}: missing ${check.label}`);
    }
  }
}

const migration = read("db/migrations/202606071500_edi_foundation.sql");
contains("db/migrations/202606071500_edi_foundation.sql", migration, [
  { pattern: /integrations\.edi_partners/, label: "edi_partners table" },
  { pattern: /integrations\.edi_messages/, label: "edi_messages table" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
  { pattern: /GRANT SELECT, INSERT, UPDATE ON integrations\.edi_partners TO ih35_app/, label: "partners grant" },
]);

const setup = read("apps/backend/src/integrations/edi/setup.service.ts");
contains("apps/backend/src/integrations/edi/setup.service.ts", setup, [
  { pattern: /export async function addEdiPartner/, label: "addEdiPartner" },
  { pattern: /export async function listPartners/, label: "listPartners" },
  { pattern: /export async function testConnection/, label: "testConnection" },
]);

read("apps/backend/src/integrations/edi/transactions/inbound-204.handler.ts");
read("apps/backend/src/integrations/edi/transactions/outbound-214.builder.ts");
read("apps/backend/src/integrations/edi/transactions/outbound-210.builder.ts");
read("apps/backend/src/integrations/edi/transactions/outbound-990.builder.ts");

const inbound = read("apps/backend/src/integrations/edi/transactions/inbound-204.handler.ts");
contains("apps/backend/src/integrations/edi/transactions/inbound-204.handler.ts", inbound, [
  { pattern: /export function parseX12204Payload/, label: "204 parser" },
  { pattern: /export async function handleInbound204/, label: "204 handler" },
  { pattern: /createDraftLoadFrom204/, label: "draft load creator" },
]);

const routes = read("apps/backend/src/integrations/edi/edi.routes.ts");
contains("apps/backend/src/integrations/edi/edi.routes.ts", routes, [
  { pattern: /\/api\/integrations\/edi\/partners/, label: "partners routes" },
  { pattern: /\/api\/integrations\/edi\/messages/, label: "messages route" },
  { pattern: /\/api\/integrations\/edi\/inbound/, label: "inbound webhook" },
  { pattern: /registerEdiRoutes/, label: "register export" },
]);

read("apps/backend/src/integrations/edi/__tests__/setup.test.ts");
read("apps/backend/src/integrations/edi/__tests__/inbound-204.test.ts");

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerEdiRoutes/, label: "routes wired in index" },
]);

const wizard = read("apps/frontend/src/pages/integrations/edi/EdiSetupWizard.tsx");
contains("apps/frontend/src/pages/integrations/edi/EdiSetupWizard.tsx", wizard, [
  { pattern: /EdiSetupWizard/, label: "setup wizard export" },
  { pattern: /edi-setup-wizard/, label: "wizard test id" },
  { pattern: /\/api\/integrations\/edi\/partners/, label: "partners API call" },
]);

const log = read("apps/frontend/src/pages/integrations/edi/EdiTransactionLog.tsx");
contains("apps/frontend/src/pages/integrations/edi/EdiTransactionLog.tsx", log, [
  { pattern: /EdiTransactionLog/, label: "transaction log export" },
  { pattern: /edi-transaction-log/, label: "log test id" },
  { pattern: /\/api\/integrations\/edi\/messages/, label: "messages API call" },
]);

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /\/integrations\/edi\/setup/, label: "setup route" },
  { pattern: /\/integrations\/edi\/log/, label: "log route" },
  { pattern: /EdiSetupWizard/, label: "wizard imported" },
  { pattern: /EdiTransactionLog/, label: "log imported" },
]);

const docs = read("docs/specs/gap-70-edi-foundation.md");
contains("docs/specs/gap-70-edi-foundation.md", docs, [
  { pattern: /GAP-70/, label: "GAP-70 identifier" },
  { pattern: /ANSI X12|X12/, label: "X12 standards citation" },
  { pattern: /204/, label: "204 transaction" },
  { pattern: /214/, label: "214 transaction" },
]);

const blockReady = read(".block-ready/GAP-70.json");
contains(".block-ready/GAP-70.json", blockReady, [
  { pattern: /"block_id": "GAP-70"/, label: "block id" },
  { pattern: /verify:edi-foundation/, label: "extra gate" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /"verify:edi-foundation"/, label: "npm script" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:edi-foundation/, label: "CI step" },
]);

if (failures.length > 0) {
  console.error("verify:edi-foundation — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:edi-foundation — OK");
