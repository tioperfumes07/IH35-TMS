#!/usr/bin/env node
/**
 * ACCT-REGISTER-REF-IS-SOURCE-UUID — account-register.service.ts's `reference` field was built
 * straight from `p.source_transaction_id` (a raw UUID FK), never resolved to a human document id.
 * AccountRegisterPage.tsx's "Ref No." column then rendered it through entityLabel(), which treats a
 * UUID-shaped "name" as absent and tombstones "Journal entry — not visible" — even though the
 * underlying data was fine, the label was just the wrong column.
 *
 * FIX shape locked here (mutation guard, not a one-time check):
 *   (1) backend: `reference` comes from `p.reference_display_id` (a COALESCE over the joined
 *       display_id/bill_number/expense_number columns — same convention as ACCT-F5708's
 *       getJournalEntrySourceLinks), never bare `p.source_transaction_id`.
 *   (2) backend: the raw id is preserved separately as `source_transaction_id` on AccountRegisterRow
 *       (both the RawPosting pass-through and the row builder), so drill-through routing still works.
 *   (3) frontend: sourceRoute() — the function that turns a register row into a clickable href — is
 *       called with the RAW `r.source_transaction_id`, never the now-human-readable `r.reference`.
 *
 * Self-test: node scripts/verify-account-register-reference-not-uuid.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-account-register-reference-not-uuid";
const SERVICE = "apps/backend/src/accounting/account-register.service.ts";
const PAGE = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";

function failures(sources) {
  const out = [];
  const service = sources[SERVICE];
  const page = sources[PAGE];

  // (1) reference must come from reference_display_id, never bare source_transaction_id.
  if (!/reference:\s*p\.reference_display_id\s*\?\?\s*null/.test(service)) {
    out.push(`${SERVICE}: AccountRegisterRow.reference is not built from p.reference_display_id`);
  }
  if (/reference:\s*p\.source_transaction_id\s*\?\?\s*null/.test(service)) {
    out.push(`${SERVICE}: AccountRegisterRow.reference reverted to the raw source_transaction_id UUID`);
  }

  // (2) raw id preserved separately for routing.
  if (!/source_transaction_id:\s*p\.source_transaction_id\s*\?\?\s*null/.test(service)) {
    out.push(`${SERVICE}: AccountRegisterRow no longer carries source_transaction_id separately — drill-through routing has no raw id to use`);
  }

  // The query must actually compute reference_display_id from a document-id column, not just alias
  // source_transaction_id under a new name.
  if (!/AS\s+reference_display_id/i.test(service)) {
    out.push(`${SERVICE}: query no longer selects a reference_display_id column`);
  } else if (/source_transaction_id\s+AS\s+reference_display_id/i.test(service)) {
    out.push(`${SERVICE}: reference_display_id is just source_transaction_id renamed, not a resolved document id`);
  }

  // (3) frontend routing must use the raw id, never the (now human) reference.
  if (!/onRowClick=\{\(r\)\s*=>\s*navigate\(sourceRoute\(r\.source_transaction_type,\s*r\.source_transaction_id\)\)\}/.test(page)) {
    out.push(`${PAGE}: onRowClick no longer calls sourceRoute(..., r.source_transaction_id) — check it wasn't reverted to r.reference`);
  }

  return out;
}

function read(rel) {
  return fs.existsSync(rel) ? fs.readFileSync(rel, "utf8") : null;
}

function selftest() {
  const goodService = `
    reference_display_id: string | null;
    source_transaction_id: string | null;
    reference: string | null;
    ...
    COALESCE(b.display_id, b.bill_number, inv.display_id, pay.display_id, ds.display_id, ex.expense_number) AS reference_display_id,
    ...
    source_transaction_id: p.source_transaction_id ?? null,
    reference: p.reference_display_id ?? null,
  `;
  const goodPage = `onRowClick={(r) => navigate(sourceRoute(r.source_transaction_type, r.source_transaction_id))}`;

  const cases = [
    { name: "correct shape -> 0", service: goodService, page: goodPage, want: 0 },
    {
      name: "reverted to raw source_transaction_id -> error",
      service: goodService.replace("reference: p.reference_display_id ?? null,", "reference: p.source_transaction_id ?? null,"),
      page: goodPage,
      wantMin: 1,
    },
    {
      name: "raw id no longer preserved -> error",
      service: goodService.replace("source_transaction_id: p.source_transaction_id ?? null,\n", ""),
      page: goodPage,
      wantMin: 1,
    },
    {
      name: "reference_display_id is just a rename of source_transaction_id -> error",
      service: goodService.replace(
        "COALESCE(b.display_id, b.bill_number, inv.display_id, pay.display_id, ds.display_id, ex.expense_number) AS reference_display_id,",
        "p.source_transaction_id AS reference_display_id,"
      ),
      page: goodPage,
      want: 1,
    },
    {
      name: "frontend routing reverted to r.reference -> error",
      service: goodService,
      page: `onRowClick={(r) => navigate(sourceRoute(r.source_transaction_type, r.reference))}`,
      wantMin: 1,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = failures({ [SERVICE]: c.service, [PAGE]: c.page }).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const service = read(SERVICE);
const page = read(PAGE);
if (service == null) {
  console.error(`[${LABEL}] FAILED — missing ${SERVICE}`);
  process.exit(1);
}
if (page == null) {
  console.error(`[${LABEL}] FAILED — missing ${PAGE}`);
  process.exit(1);
}
const errors = failures({ [SERVICE]: service, [PAGE]: page });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — account-register reference is a resolved human document id, raw source_transaction_id preserved for drill-through routing.`);
