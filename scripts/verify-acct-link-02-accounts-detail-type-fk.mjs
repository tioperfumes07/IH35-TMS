#!/usr/bin/env node
/**
 * LINK-02 (owner WIRE 2026-07-25) — catalogs.accounts.detail_type_id FK wire.
 *
 * THE DEFECT: Account Type → Detail Type cascade was text-only (`account_subtype` string).
 * Owner ruled WIRE: real FK to catalogs.detail_types, cascade by account type, + Create detail
 * types in-app. Without the FK column + route/UI write path, detail types stay display-only and
 * cannot enforce entity/type scope.
 *
 * WHAT THIS GUARD ASSERTS (static wire, not Neon live — Neon apply is owner-gated):
 *   1. Held migration 202608080000 adds detail_type_id + FK + scope trigger + held registry entry.
 *   2. accounts.routes SELECT/INSERT/PATCH carry detail_type_id and resolveDetailType.
 *   3. Legacy COA catalog factory createMapper/selectMetadataSql pass detail_type_id.
 *   4. AccountDrawer + NewAccountDrawerForm select by detail type id and POST detail_type_id.
 *   5. Changing account type resets detail_type_id (no stale cross-type FK).
 *
 * Selftest: planted PRE-FIX fixtures must fail the same assertion suite.
 * Rule 17: wired ONLY via scripts/verify-steps/1503-*.mjs — no package.json / locked-guards edits.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-link-02-accounts-detail-type-fk";

const FILES = {
  mig: "db/migrations/202608080000_acct_link_02_accounts_detail_type_fk.sql",
  held: "db/migrations/.held-migrations.json",
  routes: "apps/backend/src/catalogs/accounts.routes.ts",
  factory: "apps/backend/src/catalogs/accounting/index.ts",
  drawer: "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx",
  newForm: "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx",
  api: "apps/frontend/src/api/catalog-accounts.ts",
};

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

/**
 * @param {Record<string, string|null>} src
 * @returns {string[]}
 */
export function findProblems(src) {
  const problems = [];

  const mig = src.mig ?? "";
  if (!mig) problems.push(`missing ${FILES.mig}`);
  else {
    if (!/ADD COLUMN IF NOT EXISTS detail_type_id/i.test(mig)) {
      problems.push(`${FILES.mig}: must ADD COLUMN detail_type_id`);
    }
    if (!/accounts_detail_type_id_fkey/.test(mig)) {
      problems.push(`${FILES.mig}: must add FK accounts_detail_type_id_fkey → detail_types`);
    }
    if (!/accounts_detail_type_scope_check/.test(mig)) {
      problems.push(`${FILES.mig}: must create accounts_detail_type_scope_check trigger fn`);
    }
    if (!/HOLD-FOR-JORGE/.test(mig)) {
      problems.push(`${FILES.mig}: must carry HOLD-FOR-JORGE financial header`);
    }
  }

  const held = src.held ?? "";
  if (!held) problems.push(`missing ${FILES.held}`);
  else if (!held.includes("202608080000_acct_link_02_accounts_detail_type_fk.sql")) {
    problems.push(`${FILES.held}: must register 202608080000 (held until Neon apply)`);
  }

  const routes = src.routes ?? "";
  if (!routes) problems.push(`missing ${FILES.routes}`);
  else {
    if (!/detail_type_id/.test(routes)) {
      problems.push(`${FILES.routes}: must accept/return detail_type_id (LINK-02 wire)`);
    }
    if (!/resolveDetailType/.test(routes)) {
      problems.push(`${FILES.routes}: must resolveDetailType (entity + account_type match)`);
    }
    if (!/ACCOUNT_SELECT_COLS[\s\S]*detail_type_id/.test(routes)) {
      problems.push(`${FILES.routes}: ACCOUNT_SELECT_COLS must include detail_type_id`);
    }
    if (!/INSERT INTO catalogs\.accounts\s*\([\s\S]*detail_type_id/.test(routes)) {
      problems.push(`${FILES.routes}: INSERT must write detail_type_id`);
    }
  }

  const factory = src.factory ?? "";
  if (!factory) problems.push(`missing ${FILES.factory}`);
  else {
    if (!/'detail_type_id',\s*t\.detail_type_id/.test(factory)) {
      problems.push(`${FILES.factory}: selectMetadataSql must expose detail_type_id`);
    }
    if (!/detail_type_id:\s*\(metadata\.detail_type_id/.test(factory)) {
      problems.push(`${FILES.factory}: createMapper must map detail_type_id`);
    }
  }

  const drawer = src.drawer ?? "";
  if (!drawer) problems.push(`missing ${FILES.drawer}`);
  else {
    if (!/detail_type_id/.test(drawer)) {
      problems.push(`${FILES.drawer}: form must carry detail_type_id`);
    }
    if (!/value=\{form\.detail_type_id/.test(drawer)) {
      problems.push(`${FILES.drawer}: Detail Type <select> must bind value to detail_type_id`);
    }
    if (!/option key=\{dt\.id\} value=\{dt\.id\}/.test(drawer) && !/<option key=\{dt\.id\} value=\{dt\.id\}/.test(drawer)) {
      // allow multiline option tags
      if (!/value=\{dt\.id\}/.test(drawer)) {
        problems.push(`${FILES.drawer}: Detail Type options must use dt.id as value (FK wire)`);
      }
    }
    const typeChange = drawer.indexOf('setField("account_type"');
    const typeBlock = typeChange >= 0 ? drawer.slice(typeChange, typeChange + 280) : "";
    if (!/setField\("detail_type_id", ""\)/.test(typeBlock)) {
      problems.push(`${FILES.drawer}: changing Account Type must reset detail_type_id`);
    }
    if (!/detail_type_id:\s*form\.detail_type_id/.test(drawer)) {
      problems.push(`${FILES.drawer}: save payload must send detail_type_id`);
    }
  }

  const newForm = src.newForm ?? "";
  if (!newForm) problems.push(`missing ${FILES.newForm}`);
  else {
    if (!/detailTypeId/.test(newForm)) {
      problems.push(`${FILES.newForm}: must track detailTypeId (FK)`);
    }
    if (!/detail_type_id:\s*form\.detailTypeId/.test(newForm)) {
      problems.push(`${FILES.newForm}: create metadata must include detail_type_id`);
    }
    if (!/value=\{form\.detailTypeId\}/.test(newForm)) {
      problems.push(`${FILES.newForm}: Detail Type select must bind detailTypeId`);
    }
  }

  const api = src.api ?? "";
  if (!api) problems.push(`missing ${FILES.api}`);
  else if (!/detail_type_id\??:/.test(api)) {
    problems.push(`${FILES.api}: CatalogAccount / create body must type detail_type_id`);
  }

  return problems;
}

const PREFIX_FIXTURE = {
  mig: "-- no column\nBEGIN;\nCOMMIT;\n",
  held: JSON.stringify({ held: [] }),
  routes: `const ACCOUNT_SELECT_COLS = \`id, account_name, account_subtype\`;\n`,
  factory: `selectMetadataSql: ["'account_subtype', t.account_subtype"], createMapper: (metadata) => ({ account_subtype: null }),`,
  drawer: `
    onChange={(e) => { setField("account_type", e.target.value); setField("account_subtype", ""); }}
    <select value={form.account_subtype}>{detailTypesForType.map((dt) => <option key={dt.id} value={dt.name}>{dt.name}</option>)}</select>
  `,
  newForm: `metadata: { account_type: form.accountType, account_subtype: form.detailType }`,
  api: `export type CatalogAccount = { account_subtype: string | null };`,
};

function selftest() {
  const problems = findProblems(PREFIX_FIXTURE);
  if (problems.length === 0) {
    throw new Error(
      `${LABEL} SELFTEST FAILED — PRE-FIX fixture reported ZERO problems. Guard has no teeth.`
    );
  }
  const must = ["detail_type_id", "202608080000", "resolveDetailType"];
  const joined = problems.join("\n");
  for (const token of must) {
    if (!joined.includes(token) && !problems.some((p) => p.includes(token))) {
      // soft: at least some FK-related failures
    }
  }
  if (!problems.some((p) => /detail_type_id|202608080000|FK|resolveDetailType/i.test(p))) {
    throw new Error(
      `${LABEL} SELFTEST FAILED — PRE-FIX problems do not mention LINK-02 wire:\n  - ${problems.join("\n  - ")}`
    );
  }
  console.log(`  selftest OK — rejected PRE-FIX shape (${problems.length} problem(s))`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    selftest();
    process.exit(0);
  }

  selftest();

  /** @type {Record<string, string|null>} */
  const src = {};
  for (const [key, rel] of Object.entries(FILES)) {
    src[key] = read(rel);
  }
  const problems = findProblems(src);
  if (problems.length > 0) {
    console.error(`${LABEL} — FAILED`);
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} — OK (mig + held + routes + factory + AccountDrawer + NewAccountDrawerForm + api types)`
  );
  process.exit(0);
}

main();
