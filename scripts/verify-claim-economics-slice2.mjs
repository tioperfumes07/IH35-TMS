#!/usr/bin/env node
/**
 * WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 — insurance.claim economics capture (fault /
 * driver_responsible / trailer_id / deductible_cents / recovery_rail / repair_books_treatment).
 *
 * HOLD (financial cluster): migration 202607730000_insurance_claim_economics_columns.sql must stay
 * held, registered, additive, idempotent — it posts nothing (no GL/JE/flag). Renumbered from
 * 202607720000 -> 202607730000 (collision: PR #3223 already claimed 202607720000 for
 * driver_advance_wizard_depth.sql — verified against origin/main + all open PRs at authoring time).
 *
 * OWNER LOCKS (2026-07-22, verbatim — do not invent alternate defaults):
 *   #1 recovery_rail is ALWAYS ASK (escrow|settlement|split|ask) — never auto-defaulted past 'ask'.
 *   #2 repair_books_treatment (Choice Z) is ALWAYS ASK (expense|capitalize|ask) — NO $ threshold.
 *   #3 Option C books (expense residual + Driver A/R) posting is OUT OF SCOPE this slice.
 *
 * Static guards:
 *   1. Migration: DO-NOT-RUN marker + registered in .held-migrations.json under its CURRENT
 *      filename; idempotent ADD COLUMN IF NOT EXISTS for all 6 columns; trailer_id FK ->
 *      mdata.equipment (never mdata.units — Rule 03); CHECK constraints on fault / recovery_rail /
 *      repair_books_treatment / deductible_cents; safe neutral defaults ('undetermined' / 'ask' /
 *      'ask' / 0); no accounting.* GL write.
 *   2. claim.shared.ts: economics fields on both create + update zod schemas; enums exactly match
 *      the owner-locked value sets (no silent widening); listClaimsQuerySchema accepts the
 *      trailer_id reverse-drill filter.
 *   3. claim.routes.ts: SELECT projects all 6 columns + the trailer display join; INSERT binds all
 *      6 with COALESCE-to-safe-default for the 3 owner-locked/never-defaults-past-ask fields;
 *      PATCH accepts and assigns all 6; trailer hub existence check wired into both POST and PATCH.
 *   4. ClaimCreateModal.tsx: fault select, driver_responsible tri-state select, trailer Combobox
 *      with nested "+ Create trailer" (CreateTrailerModal — canonical nested-create gold pattern,
 *      Rule 21), deductible MoneyInput, recovery_rail + repair_books_treatment selects that default
 *      to "ask" in INITIAL_FORM (never auto-advanced).
 *   5. api/insurance.ts: FE payload/type surfaces (Create/Update) carry all 6 fields.
 *
 * Self-test: node scripts/verify-claim-economics-slice2.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-claim-economics-slice2";
const MIGRATION_PATH = "db/migrations/202607730000_insurance_claim_economics_columns.sql";
const REGISTRY_PATH = "db/migrations/.held-migrations.json";

/**
 * @param {{
 *   migration: string | null,
 *   registry: string | null,
 *   claimShared: string,
 *   claimRoutes: string,
 *   claimCreate: string,
 *   insuranceApi: string,
 * }} sources
 * @returns {string[]}
 */
export function computeFailures(sources) {
  const errors = [];
  const { migration, registry, claimShared, claimRoutes, claimCreate, insuranceApi } = sources;

  // 1) Migration — held, additive, idempotent, correct FK target, correct CHECKs, no GL.
  if (!migration) {
    errors.push(`${MIGRATION_PATH}: missing`);
  } else {
    if (!/DO NOT RUN ON PROD/i.test(migration.slice(0, 2000))) {
      errors.push(`${MIGRATION_PATH}: header must carry the DO NOT RUN ON PROD marker (held migration law)`);
    }
    if (!/ADD COLUMN IF NOT EXISTS fault text NOT NULL DEFAULT 'undetermined'/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: must ADD COLUMN IF NOT EXISTS fault ... DEFAULT 'undetermined'`);
    }
    if (!/CHECK \(fault IN \('undetermined', 'company', 'third_party', 'shared'\)\)/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: fault CHECK must be exactly undetermined|company|third_party|shared`);
    }
    if (!/ADD COLUMN IF NOT EXISTS driver_responsible boolean NULL/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: driver_responsible must be a nullable boolean (tri-state, never defaulted)`);
    }
    if (!/ADD COLUMN IF NOT EXISTS trailer_id uuid NULL REFERENCES mdata\.equipment\(id\) ON DELETE SET NULL/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: trailer_id must FK -> mdata.equipment (Rule 03 — never mdata.units) ON DELETE SET NULL`);
    }
    if (!/ADD COLUMN IF NOT EXISTS deductible_cents bigint NOT NULL DEFAULT 0/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: deductible_cents must be bigint NOT NULL DEFAULT 0`);
    }
    if (!/CHECK \(deductible_cents >= 0\)/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: deductible_cents must CHECK >= 0`);
    }
    if (!/ADD COLUMN IF NOT EXISTS recovery_rail text NOT NULL DEFAULT 'ask'/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: recovery_rail must DEFAULT 'ask' (owner lock #1 — ALWAYS ASK)`);
    }
    if (!/CHECK \(recovery_rail IN \('escrow', 'settlement', 'split', 'ask'\)\)/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: recovery_rail CHECK must be exactly escrow|settlement|split|ask`);
    }
    if (!/ADD COLUMN IF NOT EXISTS repair_books_treatment text NOT NULL DEFAULT 'ask'/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: repair_books_treatment must DEFAULT 'ask' (owner lock #2 / Choice Z — ALWAYS ASK)`);
    }
    if (!/CHECK \(repair_books_treatment IN \('expense', 'capitalize', 'ask'\)\)/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: repair_books_treatment CHECK must be exactly expense|capitalize|ask`);
    }
    if (/CASE\s+WHEN\s+deductible_cents/i.test(migration) || /CASE\s+WHEN\s+.*>\s*\d+\s+THEN\s+'(expense|capitalize)'/i.test(migration)) {
      errors.push(`${MIGRATION_PATH}: must not branch repair_books_treatment/recovery_rail on a dollar amount (owner lock #2 — NO threshold, ever; always ask)`);
    }
    if (/INSERT INTO accounting\.|UPDATE accounting\.|journal_entries/i.test(migration)) {
      errors.push(`${MIGRATION_PATH}: must not write accounting.*/journal_entries — pure schema capture, no GL posting this slice`);
    }
  }

  if (!registry) {
    errors.push(`${REGISTRY_PATH}: missing`);
  } else {
    let parsed;
    try {
      parsed = JSON.parse(registry);
    } catch {
      errors.push(`${REGISTRY_PATH}: invalid JSON`);
      return errors;
    }
    const entry = (parsed.held || []).find((h) => h.file === path.basename(MIGRATION_PATH));
    if (!entry) {
      errors.push(`${REGISTRY_PATH}: ${path.basename(MIGRATION_PATH)} must be registered as held (or db:migrate fires it on prod)`);
    } else if (!/HOLD-FOR-JORGE/.test(String(entry.reason ?? ""))) {
      errors.push(`${REGISTRY_PATH}: held entry reason must carry HOLD-FOR-JORGE`);
    }
    // Collision guard: the OLD (pre-renumber) filename must never reappear in the registry —
    // that would mean two migrations claiming 202607720000 (this slice + PR #3223 cash advance).
    const stale = (parsed.held || []).find((h) => h.file === "202607720000_insurance_claim_economics_columns.sql");
    if (stale) {
      errors.push(
        `${REGISTRY_PATH}: stale 202607720000_insurance_claim_economics_columns.sql entry present — this collides with PR #3223's 202607720000_driver_advance_wizard_depth.sql; must stay renumbered to 202607730000`,
      );
    }
  }

  // 2) Backend shared schema
  if (!/fault:\s*z\.enum\(INSURANCE_CLAIM_FAULT_VALUES\)\.optional\(\)/.test(claimShared)) {
    errors.push("claim.shared.ts: claimEconomicsFields.fault must be z.enum(INSURANCE_CLAIM_FAULT_VALUES).optional()");
  }
  if (!/driver_responsible:\s*z\.boolean\(\)\.nullable\(\)\.optional\(\)/.test(claimShared)) {
    errors.push("claim.shared.ts: claimEconomicsFields.driver_responsible must be a nullable optional boolean (tri-state)");
  }
  if (!/trailer_id:\s*z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/.test(claimShared)) {
    errors.push("claim.shared.ts: claimEconomicsFields.trailer_id must be nullable optional uuid");
  }
  if (!/deductible_cents:\s*z\.number\(\)\.int\(\)\.nonnegative\(\)\.optional\(\)/.test(claimShared)) {
    errors.push("claim.shared.ts: claimEconomicsFields.deductible_cents must be a nonnegative integer");
  }
  if (!/INSURANCE_CLAIM_RECOVERY_RAIL_VALUES\s*=\s*\["escrow", "settlement", "split", "ask"\]/.test(claimShared)) {
    errors.push("claim.shared.ts: INSURANCE_CLAIM_RECOVERY_RAIL_VALUES must be exactly [escrow, settlement, split, ask] (owner lock #1)");
  }
  if (!/INSURANCE_CLAIM_REPAIR_BOOKS_TREATMENT_VALUES\s*=\s*\["expense", "capitalize", "ask"\]/.test(claimShared)) {
    errors.push("claim.shared.ts: INSURANCE_CLAIM_REPAIR_BOOKS_TREATMENT_VALUES must be exactly [expense, capitalize, ask] (owner lock #2)");
  }
  if (!/\.\.\.claimEconomicsFields,?\s*\}\);/.test(claimShared.replace(/\s+/g, " "))) {
    errors.push("claim.shared.ts: createClaimBodySchema must spread ...claimEconomicsFields");
  }
  if (!/trailer_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(claimShared)) {
    errors.push("claim.shared.ts: listClaimsQuerySchema must accept an optional trailer_id reverse-drill filter");
  }

  // 3) Backend routes — SELECT / INSERT / PATCH wiring + owner-locked COALESCE defaults.
  if (!/\$\{a\}fault,/.test(claimRoutes) || !/\$\{a\}recovery_rail,/.test(claimRoutes) || !/\$\{a\}repair_books_treatment/.test(claimRoutes)) {
    errors.push("claim.routes.ts: claimSelectColumns() must project fault/recovery_rail/repair_books_treatment");
  }
  // The join must exist AND be entity-scoped. The original regex pinned the exact one-line form,
  // which failed the moment the join was correctly scoped across multiple lines — and, worse, would
  // have PASSED the unscoped one-liner forever. mdata.equipment carries owner_company_id +
  // currently_leased_to_company_id (NOT operating_company_id — CLAUDE.md §4, verified on prod), so a
  // trailer TRK owns and leases to TRANSP must still resolve for TRANSP.
  if (!/LEFT JOIN mdata\.equipment trailers[\s\S]{0,80}?trailers\.id = c\.trailer_id/.test(claimRoutes)) {
    errors.push("claim.routes.ts: CLAIM_FROM must LEFT JOIN mdata.equipment trailers for the trailer display id");
  }
  if (!/trailers\.id = c\.trailer_id[\s\S]{0,240}?(owner_company_id|currently_leased_to_company_id)/.test(claimRoutes)) {
    errors.push("claim.routes.ts: the mdata.equipment trailer join must be ENTITY-SCOPED (owner_company_id / currently_leased_to_company_id) — an id-only join leaks trailers across operating companies");
  }
  if (!/LEFT JOIN mdata\.assets assets[\s\S]{0,160}?assets\.tenant_id\s*=\s*c\.operating_company_id/.test(claimRoutes)) {
    errors.push("claim.routes.ts: the mdata.assets join must be ENTITY-SCOPED (assets.tenant_id = c.operating_company_id) — mdata.assets has no operating_company_id");
  }
  if (!/COALESCE\(\$16, 'undetermined'\)/.test(claimRoutes)) {
    errors.push("claim.routes.ts: INSERT must COALESCE fault to 'undetermined' server-side when the caller omits it");
  }
  if (!/COALESCE\(\$20, 'ask'\)/.test(claimRoutes) || !/COALESCE\(\$21, 'ask'\)/.test(claimRoutes)) {
    errors.push("claim.routes.ts: INSERT must COALESCE recovery_rail AND repair_books_treatment to 'ask' server-side (owner locks #1/#2 — never silently skipped)");
  }
  if (!/\["trailer", body\.trailer_id\]/.test(claimRoutes)) {
    errors.push("claim.routes.ts: POST must run assertOptionalHubExists for trailer_id (entity-scoped mdata.equipment check)");
  }
  const patchSection = claimRoutes.slice(claimRoutes.indexOf('app.patch("/api/v1/insurance/claims/:id"'));
  if (!/\["trailer", body\.trailer_id\]/.test(patchSection)) {
    errors.push("claim.routes.ts PATCH: must also run the trailer hub check (reassigning trailer_id must be validated, not just create)");
  }
  if (!/if \(body\.recovery_rail !== undefined\) setField\("recovery_rail", body\.recovery_rail\)/.test(patchSection)) {
    errors.push('claim.routes.ts PATCH: must assign recovery_rail when the caller sends it (human-explicit update, never auto-advanced)');
  }
  if (!/if \(body\.repair_books_treatment !== undefined\) setField\("repair_books_treatment", body\.repair_books_treatment\)/.test(patchSection)) {
    errors.push("claim.routes.ts PATCH: must assign repair_books_treatment when the caller sends it");
  }
  if (!/updated\.kind === "trailer_not_found"/.test(claimRoutes)) {
    errors.push('claim.routes.ts PATCH: must map trailer_not_found -> 404 { error: "trailer_not_found" }');
  }

  // 4) ClaimCreateModal — no bare-select regression on create-worthy trailer field; owner-locked
  // ask-default; deductible via MoneyInput (not a raw number input — QBO-parity money entry).
  if (!/import \{ CreateTrailerModal \} from "\.\.\/fleet\/CreateTrailerModal"/.test(claimCreate)) {
    errors.push("ClaimCreateModal.tsx: must import CreateTrailerModal (canonical nested-create gold pattern, Rule 21)");
  }
  if (!/allowAddNew=\{\{\s*label:\s*"\+ Create trailer"/.test(claimCreate)) {
    errors.push('ClaimCreateModal.tsx: trailer Combobox must offer allowAddNew "+ Create trailer" (never a bare <select> when the gold nested-create pattern exists)');
  }
  if (/<select[\s\S]{0,200}?value=\{form\.trailer_id\}/.test(claimCreate)) {
    errors.push("ClaimCreateModal.tsx: trailer field regressed to a bare <select> — must use the Combobox + CreateTrailerModal nested-create pattern");
  }
  if (!/recovery_rail:\s*"ask"/.test(claimCreate)) {
    errors.push("ClaimCreateModal.tsx INITIAL_FORM: recovery_rail must default to 'ask' (owner lock #1 — never auto-advanced)");
  }
  if (!/repair_books_treatment:\s*"ask"/.test(claimCreate)) {
    errors.push("ClaimCreateModal.tsx INITIAL_FORM: repair_books_treatment must default to 'ask' (owner lock #2 — never auto-advanced)");
  }
  if (!/fault:\s*"undetermined"/.test(claimCreate)) {
    errors.push("ClaimCreateModal.tsx INITIAL_FORM: fault must default to 'undetermined' (never a specific fault finding)");
  }
  if (!/data-testid="claim-create-recovery-rail-field"/.test(claimCreate)) {
    errors.push("ClaimCreateModal.tsx: must render a recovery_rail field (data-testid=claim-create-recovery-rail-field)");
  }
  if (!/data-testid="claim-create-repair-books-field"/.test(claimCreate)) {
    errors.push("ClaimCreateModal.tsx: must render a repair_books_treatment field (data-testid=claim-create-repair-books-field)");
  }
  if (!/MoneyInput[\s\S]{0,400}?ariaLabel="Deductible \(USD\)"/.test(claimCreate)) {
    errors.push("ClaimCreateModal.tsx: deductible must use MoneyInput (QBO-parity money entry), not a raw <input type=number>");
  }

  // 5) FE API surface — payload types carry the economics fields.
  if (!/deductible_cents\?:\s*number;/.test(insuranceApi) || !/recovery_rail\?:\s*InsuranceClaimRecoveryRail;/.test(insuranceApi)) {
    errors.push("api/insurance.ts: CreateInsuranceClaimPayload/UpdateInsuranceClaimPayload must carry deductible_cents + recovery_rail");
  }
  if (!/repair_books_treatment\?:\s*InsuranceClaimRepairBooksTreatment;/.test(insuranceApi)) {
    errors.push("api/insurance.ts: payload types must carry repair_books_treatment");
  }

  return errors;
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

function goodFixture() {
  return {
    migration: `-- [HOLD-FOR-JORGE — TIER 1] slice 2
-- *** DO NOT RUN ON PROD. ***
DO $$
BEGIN
  IF to_regclass('insurance.claim') IS NOT NULL THEN
    ALTER TABLE insurance.claim
      ADD COLUMN IF NOT EXISTS fault text NOT NULL DEFAULT 'undetermined'
        CHECK (fault IN ('undetermined', 'company', 'third_party', 'shared')),
      ADD COLUMN IF NOT EXISTS driver_responsible boolean NULL,
      ADD COLUMN IF NOT EXISTS trailer_id uuid NULL REFERENCES mdata.equipment(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS deductible_cents bigint NOT NULL DEFAULT 0
        CHECK (deductible_cents >= 0),
      ADD COLUMN IF NOT EXISTS recovery_rail text NOT NULL DEFAULT 'ask'
        CHECK (recovery_rail IN ('escrow', 'settlement', 'split', 'ask')),
      ADD COLUMN IF NOT EXISTS repair_books_treatment text NOT NULL DEFAULT 'ask'
        CHECK (repair_books_treatment IN ('expense', 'capitalize', 'ask'));
  END IF;
END
$$;
`,
    registry: JSON.stringify({
      held: [{ file: "202607730000_insurance_claim_economics_columns.sql", reason: "[HOLD-FOR-JORGE — TIER 1] slice 2" }],
    }),
    claimShared: `
export const INSURANCE_CLAIM_RECOVERY_RAIL_VALUES = ["escrow", "settlement", "split", "ask"] as const;
export const INSURANCE_CLAIM_REPAIR_BOOKS_TREATMENT_VALUES = ["expense", "capitalize", "ask"] as const;
export const listClaimsQuerySchema = operatingCompanySchema.extend({
  trailer_id: z.string().uuid().optional(),
});
const claimEconomicsFields = {
  fault: z.enum(INSURANCE_CLAIM_FAULT_VALUES).optional(),
  driver_responsible: z.boolean().nullable().optional(),
  trailer_id: z.string().uuid().nullable().optional(),
  deductible_cents: z.number().int().nonnegative().optional(),
  recovery_rail: z.enum(INSURANCE_CLAIM_RECOVERY_RAIL_VALUES).optional(),
  repair_books_treatment: z.enum(INSURANCE_CLAIM_REPAIR_BOOKS_TREATMENT_VALUES).optional(),
} as const;
export const createClaimBodySchema = z.object({ ...claimEconomicsFields, });
`,
    claimRoutes: `
function claimSelectColumns(alias = "c") {
  return \`
    \${a}fault,
    \${a}driver_responsible,
    \${a}trailer_id::text,
    trailers.equipment_number AS trailer_display_id,
    \${a}deductible_cents::bigint,
    \${a}recovery_rail,
    \${a}repair_books_treatment
  \`;
}
const CLAIM_FROM = \`
  LEFT JOIN mdata.assets assets
    ON assets.id = c.asset_id
   AND assets.tenant_id = c.operating_company_id
  LEFT JOIN mdata.equipment trailers
    ON trailers.id = c.trailer_id
   AND (
        trailers.owner_company_id = c.operating_company_id
     OR trailers.currently_leased_to_company_id = c.operating_company_id
   )
\`;
      for (const [kind, id] of [
        ["trailer", body.trailer_id],
      ] as const) {}
          VALUES (
            COALESCE($16, 'undetermined'), $17, $18::uuid, COALESCE($19, 0),
            COALESCE($20, 'ask'), COALESCE($21, 'ask')
          )
    if (created.kind === "trailer_not_found") return reply.code(404).send({ error: "trailer_not_found" });

  app.patch("/api/v1/insurance/claims/:id", async (req, reply) => {
      for (const [kind, id] of [
        ["trailer", body.trailer_id],
      ] as const) {}
      if (body.recovery_rail !== undefined) setField("recovery_rail", body.recovery_rail);
      if (body.repair_books_treatment !== undefined) setField("repair_books_treatment", body.repair_books_treatment);
    if (updated.kind === "trailer_not_found") return reply.code(404).send({ error: "trailer_not_found" });
  });
`,
    claimCreate: `
import { CreateTrailerModal } from "../fleet/CreateTrailerModal";
const INITIAL_FORM = {
  fault: "undetermined",
  trailer_id: "",
  recovery_rail: "ask",
  repair_books_treatment: "ask",
};
<label data-testid="claim-create-trailer-field">
  <Combobox
    allowAddNew={{
      label: "+ Create trailer",
      onAdd: () => setTrailerCreateOpen(true),
    }}
  />
</label>
<label data-testid="claim-create-recovery-rail-field"><select /></label>
<label data-testid="claim-create-repair-books-field"><select /></label>
<MoneyInput ariaLabel="Deductible (USD)" />
`,
    insuranceApi: `
export type CreateInsuranceClaimPayload = {
  deductible_cents?: number;
  recovery_rail?: InsuranceClaimRecoveryRail;
  repair_books_treatment?: InsuranceClaimRepairBooksTreatment;
};
`,
  };
}

function selftest() {
  const good = goodFixture();
  const goodFails = computeFailures(good);
  if (goodFails.length !== 0) {
    console.error(`${LABEL} selftest FAIL: good fixture rejected:`, goodFails);
    process.exit(1);
  }

  const cases = [
    ["migration", (f) => { f.migration = f.migration.replace("DO NOT RUN ON PROD", "safe"); }, "DO NOT RUN ON PROD"],
    ["migration", (f) => { f.migration = f.migration.replace("ADD COLUMN IF NOT EXISTS fault", "ADD COLUMN fault"); }, "ADD COLUMN IF NOT EXISTS fault"],
    ["migration", (f) => { f.migration = f.migration.replace("REFERENCES mdata.equipment(id)", "REFERENCES mdata.units(id)"); }, "mdata.equipment"],
    ["migration", (f) => { f.migration = f.migration.replace("DEFAULT 'ask'\n        CHECK (recovery_rail", "DEFAULT 'escrow'\n        CHECK (recovery_rail"); }, "owner lock #1"],
    ["migration", (f) => { f.migration += "\nINSERT INTO accounting.journal_entries VALUES (1);"; }, "no GL posting"],
    ["registry", (f) => { f.registry = JSON.stringify({ held: [] }); }, "must be registered as held"],
    ["registry", (f) => { f.registry = JSON.stringify({ held: [{ file: "202607720000_insurance_claim_economics_columns.sql", reason: "HOLD-FOR-JORGE" }] }); }, "stale 202607720000"],
    ["claimShared", (f) => { f.claimShared = f.claimShared.replace("deductible_cents: z.number().int().nonnegative().optional(),", ""); }, "deductible_cents must be a nonnegative integer"],
    ["claimShared", (f) => { f.claimShared = f.claimShared.replace('["escrow", "settlement", "split", "ask"]', '["escrow", "settlement", "split", "ask", "auto"]'); }, "owner lock #1"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replace("LEFT JOIN mdata.equipment trailers", "LEFT JOIN mdata.units trailers"); }, "LEFT JOIN mdata.equipment trailers"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replace("COALESCE($20, 'ask'), COALESCE($21, 'ask')", "$20, $21"); }, "owner locks #1/#2"],
    ["claimRoutes", (f) => {
      const patchIdx = f.claimRoutes.indexOf('app.patch("/api/v1/insurance/claims/:id"');
      const before = f.claimRoutes.slice(0, patchIdx);
      const after = f.claimRoutes.slice(patchIdx).replace(
        'for (const [kind, id] of [\n        ["trailer", body.trailer_id],\n      ] as const) {}\n',
        "",
      );
      f.claimRoutes = before + after;
    }, "PATCH: must also run"],
    ["claimCreate", (f) => { f.claimCreate = f.claimCreate.replace('label: "+ Create trailer"', 'label: "not a trailer"'); }, "Create trailer"],
    ["claimCreate", (f) => { f.claimCreate += `\n<select value={form.trailer_id} />`; }, "regressed to a bare <select>"],
    ["claimCreate", (f) => { f.claimCreate = f.claimCreate.replace('recovery_rail: "ask",', 'recovery_rail: "escrow",'); }, "owner lock #1 — never auto-advanced"],
    ["insuranceApi", (f) => { f.insuranceApi = f.insuranceApi.replace("repair_books_treatment?: InsuranceClaimRepairBooksTreatment;", ""); }, "repair_books_treatment"],
  ];

  const problems = [];
  for (const [key, mutate, expectFragment] of cases) {
    const fixture = goodFixture();
    mutate(fixture);
    const failures = computeFailures(fixture);
    if (!failures.some((msg) => msg.includes(expectFragment))) {
      problems.push(`planted regression in ${key} ("${expectFragment}") was NOT caught`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`✓ ${LABEL} --selftest OK — good fixture passes; ${cases.length} planted regressions all caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const sources = {
    migration: read(MIGRATION_PATH),
    registry: read(REGISTRY_PATH),
    claimShared: read("apps/backend/src/insurance/claim.shared.ts") ?? "",
    claimRoutes: read("apps/backend/src/insurance/claim.routes.ts") ?? "",
    claimCreate: read("apps/frontend/src/components/insurance/ClaimCreateModal.tsx") ?? "",
    insuranceApi: read("apps/frontend/src/api/insurance.ts") ?? "",
  };

  const failures = computeFailures(sources);
  if (failures.length > 0) {
    console.error(`✗ ${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`✓ ${LABEL}: claim economics slice 2 (fault/responsibility/trailer/deductible/recovery/books) wired + held.`);
}

main();
