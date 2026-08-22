#!/usr/bin/env node
// ACCT-LINK-05: validation error keys in PostingTemplateModal must NOT end in Id
// (entity-link-adoption treats *Id JSX reads as naked IDs). Use debitAccount/creditAccount.
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
    if (!/<PostingTemplateModal\b/.test(list)) {
      failures.push(`${LIST_PAGE}: must mount PostingTemplateModal (debit/credit CoA pickers)`);
    }
    if (!/searchParams\.get\("create"\) !== "1"/.test(list) && !/get\("create"\) === "1"/.test(list)) {
      failures.push(`${LIST_PAGE}: must honor ?create=1 → open New Posting Template modal`);
    }
    if (!/setModalOpen\(true\)/.test(list)) {
      failures.push(`${LIST_PAGE}: must setModalOpen(true) for create path`);
    }
    if (!/<PostingTemplateModal[\s\S]{0,500}?client=\{postingTemplatesCatalogClient\}/.test(list)) {
      failures.push(`${LIST_PAGE}: mounted PostingTemplateModal must receive postingTemplatesCatalogClient → catalogs.posting_templates`);
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
    if (!/mode\s*===\s*"create"[\s\S]{0,100}?client\.create\(operatingCompanyId,\s*body\)/.test(modal)) {
      failures.push(`${MODAL}: create mode must persist through the company-scoped catalog client`);
    }
    if (!/await\s+client\.create\([\s\S]{0,700}?onSaved\(\)/.test(modal)) {
      failures.push(`${MODAL}: successful canonical create must notify the list to reload`);
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

    const goodIndex = `
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
`;
    const goodList = `import { PostingTemplateModal } from "./PostingTemplateModal";
import { postingTemplatesCatalogClient } from "../../../api/catalogs-accounting";
export function PostingTemplatesListPage() {
  if (searchParams.get("create") !== "1") return null;
  setModalOpen(true);
  return (
    <>
      <h1 title="Posting Templates">Posting Templates</h1>
      <PostingTemplateModal client={postingTemplatesCatalogClient} />
    </>
  );
}`;
    const goodModal = `import { listCatalogAccounts } from "../../../api/catalog-accounts";
export const POSTING_TEMPLATE_SOURCE_CODES = [{ value: "fuel_event" }];
export async function PostingTemplateModal({ mode, client, operatingCompanyId, onSaved }) {
  listCatalogAccounts({ postable_only: true });
  const body = { metadata: { debit_account_id: "x", credit_account_id: "y" } };
  if (mode === "create") await client.create(operatingCompanyId, body);
  onSaved();
  return <ReferenceSelect createKind="account" metadata={{ debit_account_id: "x", credit_account_id: "y" }} />;
}`;
    const resetFixtures = () => {
      fs.writeFileSync(path.join(goodRoot, BACKEND_INDEX), goodIndex);
      fs.writeFileSync(path.join(goodRoot, LIST_PAGE), goodList);
      fs.writeFileSync(path.join(goodRoot, MODAL), goodModal);
    };
    resetFixtures();
    fs.writeFileSync(path.join(goodRoot, WIRED_GUARD), "// stub\n");

    if (collectFailures({ root: goodRoot, skipWiredGuard: true }).length) {
      failures.push("good fixture rejected");
    }

    const mutations = [
      [BACKEND_INDEX, /urlSegment: "posting-templates",/, 'urlSegment: "posting-templates",\n  readOnly: true,', /readOnly/, "writable registration"],
      [BACKEND_INDEX, /entityScoped: true/, "entityScoped: false", /entityScoped/, "entity scope"],
      [BACKEND_INDEX, /requiredMetadata: \["debit_account_id", "credit_account_id"\]/, 'requiredMetadata: ["debit_account_id"]', /requiredMetadata/, "required metadata"],
      [BACKEND_INDEX, /credit_account_id: String\(metadata\.credit_account_id\),/, "", /createMapper/, "credit mapping"],
      [BACKEND_INDEX, /validate: async/, "validate: () =>", /validate/, "same-company validation"],
      [LIST_PAGE, /<PostingTemplateModal/, "{/* removed mount */}<ImportedPostingTemplateModal", /must mount/, "mounted modal"],
      [LIST_PAGE, /searchParams\.get\("create"\) !== "1"/, 'searchParams.get("seed") !== "1"', /\?create=1/, "deep-link create"],
      [LIST_PAGE, /setModalOpen\(true\)/, "setModalOpen(false)", /setModalOpen/, "open transition"],
      [LIST_PAGE, /client=\{postingTemplatesCatalogClient\}/, "client={someOtherClient}", /must receive postingTemplatesCatalogClient/, "canonical client prop"],
      [LIST_PAGE, /title="Posting Templates"/, 'title="Templates"', /visible Posting Templates title/, "visible title"],
      [MODAL, /postable_only: true/, "postable_only: false", /postable_only/, "postable account scope"],
      [MODAL, /createKind="account"/, 'createKind="vendor"', /createKind=account/, "account nested create"],
      [MODAL, /credit_account_id: "y"/g, 'credit_account_key: "y"', /debit_account_id \+ credit_account_id/, "credit payload FK"],
      [MODAL, /mode === "create"/, 'mode === "preview"', /create mode must persist/, "create persistence"],
      [MODAL, /onSaved\(\)/, "onSavedDisabled()", /notify the list to reload/, "reload notification"],
      [MODAL, /fuel_event/, "fuel_record", /fuel_event template codes/, "consumer source code"],
    ];
    for (const [rel, needle, replacement, expected, label] of mutations) {
      resetFixtures();
      const file = path.join(goodRoot, rel);
      const before = fs.readFileSync(file, "utf8");
      const after = before.replace(needle, replacement);
      if (after === before) {
        failures.push(`${label} plant did not mutate fixture`);
        continue;
      }
      fs.writeFileSync(file, after);
      const planted = collectFailures({ root: goodRoot, skipWiredGuard: true });
      if (!planted.some((failure) => expected.test(failure))) {
        failures.push(`${label} regression not caught (${planted.join(" | ") || "no failures"})`);
      }
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
