#!/usr/bin/env node
/**
 * ACCT-LINK-05 / ACCT-F08 — posting_templates create path + consumer stamp wiring (guard 1760).
 *
 * ROOT CAUSE closed: PR #3709 unlocked the frontend +Create chrome but left the Lists accounting
 * catalog route readOnly:true — POST /api/v1/catalogs/accounting/posting-templates returned 405
 * catalog_read_only, so catalogs.posting_templates stayed at 0 rows and posting_batches could
 * never stamp posting_template_id (resolvePostingTemplateId correctly returns null when empty).
 *
 * This guard fails if:
 *   1. posting_templates legacy catalog registration is readOnly again
 *   2. createMapper omits debit_account_id / credit_account_id (NOT NULL CoA picks)
 *   3. PostingTemplatesListPage drops the dedicated PostingTemplateModal with account pickers
 *   4. Consumer writers regress (delegates to verify-posting-batches-template-link.mjs)
 *
 * Density PASS (manifest flip) still requires owner in-app seed + stamped batch — not CI-static.
 *
 *   node scripts/verify-acct-link05-posting-template-create.mjs
 *   node scripts/verify-acct-link05-posting-template-create.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-link05-posting-template-create";

const BACKEND_INDEX = "apps/backend/src/catalogs/accounting/index.ts";
const LIST_PAGE = "apps/frontend/src/pages/lists/accounting/PostingTemplatesListPage.tsx";
const MODAL = "apps/frontend/src/pages/lists/accounting/PostingTemplateModal.tsx";
const WIRED_GUARD = "scripts/verify-posting-batches-template-link.mjs";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectFailures(opts = {}) {
  const root = opts.root ?? ROOT;
  const failures = [];

  const indexPath = path.join(root, BACKEND_INDEX);
  if (!fs.existsSync(indexPath)) {
    failures.push(`missing ${BACKEND_INDEX}`);
  } else {
    const index = fs.readFileSync(indexPath, "utf8");
    const blockMatch = index.match(
      /registerLegacyAccountingCatalogRoutes\(app,\s*\{[\s\S]*?tableName:\s*"posting_templates"[\s\S]*?\}\);/
    );
    if (!blockMatch) {
      failures.push(`${BACKEND_INDEX}: posting_templates registration block missing`);
    } else {
      const block = blockMatch[0];
      if (/readOnly:\s*true/.test(block)) {
        failures.push(`${BACKEND_INDEX}: posting_templates must not be readOnly — blocks owner in-app seed (+Create 405)`);
      }
      if (!/requiredMetadata:\s*\[[^\]]*"debit_account_id"[^\]]*"credit_account_id"/.test(block)) {
        failures.push(`${BACKEND_INDEX}: posting_templates requiredMetadata must include debit_account_id + credit_account_id`);
      }
      if (!/createMapper:\s*\(metadata\)\s*=>\s*\(\{[\s\S]*debit_account_id[\s\S]*credit_account_id/.test(block)) {
        failures.push(`${BACKEND_INDEX}: posting_templates createMapper must map debit_account_id + credit_account_id`);
      }
      if (!/entityScoped:\s*true/.test(block)) {
        failures.push(`${BACKEND_INDEX}: posting_templates must stay entityScoped (LST-F03 per-entity)`);
      }
      if (!/validate:\s*async/.test(block)) {
        failures.push(`${BACKEND_INDEX}: posting_templates validate must enforce same-entity CoA picks`);
      }
    }
  }

  const listPath = path.join(root, LIST_PAGE);
  if (!fs.existsSync(listPath)) {
    failures.push(`missing ${LIST_PAGE}`);
  } else {
    const list = fs.readFileSync(listPath, "utf8");
    if (/readOnly/.test(list)) {
      failures.push(`${LIST_PAGE}: must not pass readOnly — owner seed path`);
    }
    if (!/PostingTemplateModal/.test(list)) {
      failures.push(`${LIST_PAGE}: must mount PostingTemplateModal (debit/credit CoA pickers)`);
    }
    if (!/postingTemplatesCatalogClient/.test(list)) {
      failures.push(`${LIST_PAGE}: must use postingTemplatesCatalogClient → catalogs.posting_templates`);
    }
    if (!/title="Posting Templates"/.test(list) && !/displayName="Posting Templates"/.test(list)) {
      failures.push(`${LIST_PAGE}: must keep visible Posting Templates title (verify-acct-templates-subnav)`);
    }
  }

  const modalPath = path.join(root, MODAL);
  if (!fs.existsSync(modalPath)) {
    failures.push(`missing ${MODAL}`);
  } else {
    const modal = fs.readFileSync(modalPath, "utf8");
    if (!/listCatalogAccounts/.test(modal) || !/postable_only:\s*true/.test(modal)) {
      failures.push(`${MODAL}: must load CoA via listCatalogAccounts({ postable_only: true }) (not getCoaAccounts — no is_postable on that type)`);
    }
    if (!/ReferenceSelect/.test(modal) || !/createKind="account"/.test(modal)) {
      failures.push(`${MODAL}: must use ReferenceSelect createKind=account for debit/credit CoA picks`);
    }
    if (!/debit_account_id/.test(modal) || !/credit_account_id/.test(modal)) {
      failures.push(`${MODAL}: submit payload must carry debit_account_id + credit_account_id metadata`);
    }
    if (!/POSTING_TEMPLATE_SOURCE_CODES/.test(modal) || !/fuel_event/.test(modal)) {
      failures.push(`${MODAL}: must document PostingSourceType + fuel_event template codes`);
    }
  }

  if (!opts.skipWiredGuard) {
    const wired = spawnSync("node", [path.join(root, WIRED_GUARD)], { cwd: root, encoding: "utf8" });
    if (wired.status !== 0) {
      failures.push(`${WIRED_GUARD} failed — consumer stamp path regressed:\n${wired.stderr || wired.stdout}`);
    }
  }

  return failures;
}

function selftest() {
  const failures = [];
  const goodRoot = fs.mkdtempSync("/tmp/acct-link05-create-");
  try {
    fs.mkdirSync(path.join(goodRoot, "apps/backend/src/catalogs/accounting"), { recursive: true });
    fs.mkdirSync(path.join(goodRoot, "apps/frontend/src/pages/lists/accounting"), { recursive: true });
    fs.mkdirSync(path.join(goodRoot, "scripts"), { recursive: true });

    fs.writeFileSync(
      path.join(goodRoot, BACKEND_INDEX),
      `
registerLegacyAccountingCatalogRoutes(app, {
  tableName: "posting_templates",
  urlSegment: "posting-templates",
  entityScoped: true,
  requiredMetadata: ["debit_account_id", "credit_account_id"],
  createMapper: (metadata) => ({
    debit_account_id: String(metadata.debit_account_id),
    credit_account_id: String(metadata.credit_account_id),
  }),
  validate: async () => null,
});
`
    );
    fs.writeFileSync(
      path.join(goodRoot, LIST_PAGE),
      `import { PostingTemplateModal } from "./PostingTemplateModal";
import { postingTemplatesCatalogClient } from "../../../api/catalogs-accounting";
export function PostingTemplatesListPage() {
  return (
    <>
      <h1 title="Posting Templates">Posting Templates</h1>
      <PostingTemplateModal client={postingTemplatesCatalogClient} />
    </>
  );
}`
    );
    fs.writeFileSync(
      path.join(goodRoot, MODAL),
      `import { listCatalogAccounts } from "../../../api/catalog-accounts";
export const POSTING_TEMPLATE_SOURCE_CODES = [{ value: "fuel_event" }];
export function PostingTemplateModal() {
  listCatalogAccounts({ postable_only: true });
  return <ReferenceSelect createKind="account" metadata={{ debit_account_id: "x", credit_account_id: "y" }} />;
}`
    );
    fs.writeFileSync(path.join(goodRoot, WIRED_GUARD), "// stub\n");

    if (collectFailures({ root: goodRoot, skipWiredGuard: true }).length) {
      failures.push("good fixture rejected");
    }

    fs.writeFileSync(
      path.join(goodRoot, BACKEND_INDEX),
      `registerLegacyAccountingCatalogRoutes(app, { tableName: "posting_templates", readOnly: true, entityScoped: true });`
    );
    if (!collectFailures({ root: goodRoot, skipWiredGuard: true }).some((f) => /readOnly/.test(f))) {
      failures.push("readOnly regression not caught");
    }
  } finally {
    fs.rmSync(goodRoot, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = collectFailures();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `${LABEL}: OK — posting_templates create path unlocked (backend not readOnly + PostingTemplateModal ` +
    `CoA pickers) + consumer batch stamp wiring intact; density still awaits owner seed + stamped batch`
);
process.exit(0);
