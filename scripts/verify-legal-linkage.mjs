#!/usr/bin/env node
/**
 * ROUND 326 — Lead-named guard: scripts/verify-legal-linkage.mjs
 * FAILS IF:
 *  - sync/apply linkage engine is unwired (contracts create/sign/detail/sync-linkage route)
 *  - matter create no longer requires subject FK or UNLINKED_REASON
 *  - legal money posts outside the bill (AP/expense) or invoice (AR) engines
 * Optional live (DATABASE_URL): reports orphan counts (use --fail-live to fail on orphans).
 */
export const ALLOW_OFFLINE_SKIP =
  "static wiring assertions only; live orphan count is optional via DATABASE_URL / --fail-live";

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-legal-linkage";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

const P = {
  link: "apps/backend/src/legal/contract-linkage.service.ts",
  contracts: "apps/backend/src/legal/contracts.service.ts",
  routes: "apps/backend/src/legal/contracts.routes.ts",
  matters: "apps/backend/src/legal/matters.service.ts",
  matterRoutes: "apps/backend/src/legal/matters.routes.ts",
  money: "apps/backend/src/legal/legal-money.service.ts",
  moneyGuard: "scripts/verify-legal-no-gl-writes.mjs",
};

export function check(s) {
  const p = [];
  if (!/export async function syncContractInstanceLinkage/.test(s.link)) p.push(`${P.link}: syncContractInstanceLinkage missing`);
  if (!/export async function listContractLinkageOrphans/.test(s.link)) p.push(`${P.link}: listContractLinkageOrphans missing`);
  if (!/export async function listMatterLinkageOrphans/.test(s.link)) p.push(`${P.link}: listMatterLinkageOrphans missing`);
  if (!/MATTER_UNLINKED_REASON_PREFIX/.test(s.link)) p.push(`${P.link}: MATTER_UNLINKED_REASON_PREFIX missing`);
  if (!/linksFromInstanceRow/.test(s.link)) p.push(`${P.link}: linksFromInstanceRow missing`);

  if (!/syncContractInstanceLinkage\(client as never/.test(s.contracts) && !/syncContractInstanceLinkage\(client,/.test(s.contracts)) {
    p.push(`${P.contracts}: sign/detail path no longer calls syncContractInstanceLinkage`);
  }
  if (!/syncCompanyContractLinkage/.test(s.contracts)) p.push(`${P.contracts}: syncCompanyContractLinkage missing`);
  if (!/FROM legal\.contract_instance_links/.test(s.contracts)) p.push(`${P.contracts}: detail must return active links`);

  if (!/\/api\/v1\/legal\/contracts\/sync-linkage/.test(s.routes)) p.push(`${P.routes}: POST sync-linkage route missing`);
  if (!/syncCompanyContractLinkage/.test(s.routes)) p.push(`${P.routes}: sync route not wired`);
  if (!/\/api\/v1\/legal\/linkage\/backfill-from-sources/.test(s.routes)) {
    p.push(`${P.routes}: POST linkage/backfill-from-sources route missing (item 2)`);
  }
  if (!existsSync(resolve(ROOT, "apps/backend/src/legal/legal-linkage-backfill.service.ts"))) {
    p.push("apps/backend/src/legal/legal-linkage-backfill.service.ts: item 2 backfill service missing");
  } else {
    const bf = read("apps/backend/src/legal/legal-linkage-backfill.service.ts");
    if (!/backfillLegalLinkageFromSources/.test(bf)) p.push("backfill service missing export");
    if (!/Never invents/.test(bf) && !/never invent/i.test(bf)) p.push("backfill must state never-invent law");
  }

  if (!/legal_matter_requires_subject_or_unlinked_reason/.test(s.matters)) {
    p.push(`${P.matters}: create no longer requires subject or UNLINKED_REASON`);
  }
  if (!/matterHasSubjectFk\(provisional\)/.test(s.matters)) p.push(`${P.matters}: matterHasSubjectFk gate missing`);

  // ROUND 326 item 3 — money must go through bill + invoice engines (no handwritten JE in legal).
  if (!existsSync(resolve(ROOT, P.money))) {
    p.push(`${P.money}: legal-money.service missing (economic wiring)`);
  } else {
    if (!/from ["']\.\.\/accounting\/bills\.service\.js["']/.test(s.money) && !/from ["']\.\.\/accounting\/bills\.service["']/.test(s.money)) {
      p.push(`${P.money}: must import createBill/voidBill from bills.service`);
    }
    if (!/createBill\(/.test(s.money)) p.push(`${P.money}: reserve/fee must call createBill`);
    if (!/voidBill\(/.test(s.money)) p.push(`${P.money}: reserve release must call voidBill`);
    if (!/createExpandedInvoice\(/.test(s.money)) p.push(`${P.money}: recovery/judgment must call createExpandedInvoice`);
    if (!/legalMatterId:/.test(s.money)) p.push(`${P.money}: bills must stamp legalMatterId`);
    if (/createJournalEntryOnClient\(/.test(s.money) || /source_transaction_type:\s*["']legal_matter_reserve["']/.test(s.money)) {
      p.push(`${P.money}: handwritten / direct JE reserve path is forbidden — use bill engine`);
    }
    if (!/export async function postMatterLegalFee/.test(s.money)) p.push(`${P.money}: postMatterLegalFee missing`);
    if (!/export async function postMatterRecovery/.test(s.money)) p.push(`${P.money}: postMatterRecovery missing`);
  }
  if (!/\/api\/v1\/legal\/matters\/:id\/legal-fee/.test(s.matterRoutes)) {
    p.push(`${P.matterRoutes}: POST legal-fee route missing`);
  }
  if (!/\/api\/v1\/legal\/matters\/:id\/recovery/.test(s.matterRoutes)) {
    p.push(`${P.matterRoutes}: POST recovery route missing`);
  }
  if (!/postMatterLegalFee\(/.test(s.matterRoutes) || !/postMatterRecovery\(/.test(s.matterRoutes)) {
    p.push(`${P.matterRoutes}: fee/recovery handlers not wired`);
  }
  if (/createJournalEntryOnClient\(/.test(s.matters)) {
    p.push(`${P.matters}: must not call createJournalEntryOnClient — money is in legal-money.service via bill/invoice`);
  }
  if (!/from ["']\.\/legal-money\.service\.js["']/.test(s.matters) && !/legal-money\.service/.test(s.matters)) {
    p.push(`${P.matters}: must re-export money helpers from legal-money.service`);
  }
  if (!existsSync(resolve(ROOT, P.moneyGuard))) p.push(`${P.moneyGuard}: legal no-GL guard missing`);

  return p;
}

const real = Object.fromEntries(
  Object.entries(P)
    .filter(([, v]) => v.endsWith(".ts") || v.endsWith(".mjs"))
    .filter(([, v]) => existsSync(resolve(ROOT, v)))
    .map(([k, v]) => [k, read(v)])
);
// Always load money + matterRoutes when present for check().
for (const k of ["money", "matterRoutes"]) {
  if (!real[k] && existsSync(resolve(ROOT, P[k]))) real[k] = read(P[k]);
}

if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, s, fail) => {
    const pr = check(s);
    if ((pr.length > 0) !== fail) {
      console.error(`SELFTEST FAIL: ${n}: ${JSON.stringify(pr)}`);
      ok = false;
    }
  };
  ex("real", real, false);
  ex("sync dropped", { ...real, link: real.link.replace("export async function syncContractInstanceLinkage", "async function _gone") }, true);
  ex("matter gate dropped", { ...real, matters: real.matters.replace("legal_matter_requires_subject_or_unlinked_reason", "noop") }, true);
  ex("route dropped", { ...real, routes: real.routes.replace("/api/v1/legal/contracts/sync-linkage", "/api/v1/legal/contracts/noop") }, true);
  console.log(ok ? `${LABEL} --selftest PASS (4/4)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}

const problems = check(real);
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — sync engine + backfill + matter subject gate + legal money via bill/invoice engines`
);

async function liveOrphans() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;
  const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.log(`${LABEL}: live skip (no pg)`);
    return;
  }
  const client = new pg.default.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const links = await client.query(`SELECT count(*)::int AS n FROM legal.contract_instance_links`);
    const contractOrphans = await client.query(
      `SELECT count(*)::int AS n FROM legal.contract_instances ci
        WHERE ci.operating_company_id = $1::uuid AND ci.voided_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM legal.contract_instance_links l WHERE l.contract_instance_id = ci.id AND l.is_active)
          AND COALESCE(ci.filled_variables->>'_linkage_unlinked_reason','') = ''`,
      [USMCA]
    );
    const matterOrphans = await client.query(
      `SELECT count(*)::int AS n FROM legal.matters m
        WHERE m.operating_company_id = $1::uuid
          AND m.customer_id IS NULL AND m.vendor_id IS NULL AND m.load_id IS NULL
          AND m.related_driver_id IS NULL AND m.related_user_id IS NULL
          AND m.unit_id IS NULL AND m.equipment_id IS NULL
          AND m.insurance_claim_id IS NULL AND m.insurance_lawsuit_id IS NULL AND m.incident_id IS NULL
          AND position('UNLINKED_REASON:' in coalesce(m.internal_notes,'')) = 0`,
      [USMCA]
    );
    const moneyBills = await client.query(
      `SELECT count(*)::int AS n FROM accounting.bills
        WHERE operating_company_id = $1::uuid AND legal_matter_id IS NOT NULL
          AND voided_at IS NULL AND revoked_at IS NULL`,
      [USMCA]
    );
    await client.query("ROLLBACK");
    const cOrphans = Number(contractOrphans.rows[0]?.n ?? 0);
    const mOrphans = Number(matterOrphans.rows[0]?.n ?? 0);
    console.log(
      `${LABEL} LIVE: links=${links.rows[0]?.n} contract_orphans=${cOrphans} matter_orphans=${mOrphans} matter_bills=${moneyBills.rows[0]?.n}`
    );
    if (process.argv.includes("--fail-live") && (cOrphans > 0 || mOrphans > 0)) {
      console.error(`${LABEL} LIVE FAIL: orphans remain (run sync-linkage + item-2 backfill)`);
      process.exit(1);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

liveOrphans().catch((e) => {
  console.error(`${LABEL} live error:`, e?.message ?? e);
  process.exit(1);
});
