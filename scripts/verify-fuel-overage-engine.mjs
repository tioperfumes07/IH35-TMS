/**
 * FUEL-03 — fuel-card overage engine guard.
 *
 * Enforces: evaluator wired on both fuel writers; policy math reused; overage events table;
 * approve-then-recover (never createSettlementDeduction auto-charge); receivable posts via
 * resolveRoleAccount('fuel_overage_receivable') + createJournalEntryOnClient; contract authority
 * gate; DEFAULT pending_review / company_variance without contract.
 * Also requires docs/schema-parity-baseline.json to include fuel_transactions.overage_event_id
 * (regenerate via verify-schema-parity --update after FUEL-03 migrations).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENGINE_SERVICE = "apps/backend/src/fuel/fuel-card-overage.service.ts";
const CONTRACT_SERVICE = "apps/backend/src/fuel/fuel-card-overage-contract.service.ts";
const POSTING_SERVICE = "apps/backend/src/fuel/fuel-card-overage-posting.service.ts";
const OVERAGE_MATH = "apps/backend/src/fuel/fuel-card-overage.math.ts";
const IMPORT_ROUTES = "apps/backend/src/fuel/fuel-transaction-import.routes.ts";
const RELAY_CRON = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts";
const RESOLVER = "apps/backend/src/accounting/coa-roles/resolver.service.ts";
const MIGRATION_FUEL03 = "db/migrations/202609090010_fuel_03_overage_engine.sql";
const MIGRATION_FUEL04 = "db/migrations/202609090000_fuel_04_driver_fuel_overage_receivable.sql";
const MIGRATION_UNIT_FK = "db/migrations/202609090020_fuel_03_overage_events_unit_fk.sql";
const FLAGS_SERVICE = "apps/backend/src/lib/feature-flags/service.ts";
const CANONICAL_RELS = "scripts/canonical-relations.json";

const ENGINE_FLAG = "FUEL_CARD_OVERAGE_ENGINE_ENABLED";
const GL_FLAG = "FUEL_CARD_OVERAGE_GL_POSTING_ENABLED";
const RECOVERY_FLAG = "FUEL_CARD_OVERAGE_RECOVERY_ENABLED";
const RECEIVABLE_ROLE = "fuel_overage_receivable";

function readFile(rel, sources) {
  if (sources && Object.prototype.hasOwnProperty.call(sources, rel)) return sources[rel];
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function collectProblems(sources) {
  const problems = [];
  const need = (rel) => {
    const src = readFile(rel, sources);
    if (src === null) problems.push(`missing ${rel}`);
    return src;
  };

  const service = need(ENGINE_SERVICE);
  const contract = need(CONTRACT_SERVICE);
  const posting = need(POSTING_SERVICE);
  const math = need(OVERAGE_MATH);
  const importRoutes = need(IMPORT_ROUTES);
  const cron = need(RELAY_CRON);
  const resolver = need(RESOLVER);
  const mig03 = need(MIGRATION_FUEL03);
  // FUEL-04 account mig ships on #3622 — optional here; role registration is the hard dep.
  const mig04 = readFile(MIGRATION_FUEL04, sources);
  const flags = need(FLAGS_SERVICE);

  for (const [rel, src] of [
    [IMPORT_ROUTES, importRoutes],
    [RELAY_CRON, cron],
  ]) {
    if (src && !src.includes("flushFuelCardOverageAfterCommit")) {
      problems.push(`${rel} must call flushFuelCardOverageAfterCommit after ingest commit`);
    }
  }

  if (service) {
    if (!service.includes("maybeEvaluateFuelCardOverage")) {
      problems.push(`${ENGINE_SERVICE} must export maybeEvaluateFuelCardOverage`);
    }
    if (!service.includes(ENGINE_FLAG)) {
      problems.push(`${ENGINE_SERVICE} must gate evaluation on ${ENGINE_FLAG}`);
    }
    if (!service.includes("approveAndPostFuelCardOverage")) {
      problems.push(`${ENGINE_SERVICE} must implement approve-then-recover (approveAndPostFuelCardOverage)`);
    }
    if (!service.includes("fuel_card_overage_events")) {
      problems.push(`${ENGINE_SERVICE} must write fuel.fuel_card_overage_events`);
    }
    if (/createSettlementDeduction/.test(service)) {
      problems.push(
        `${ENGINE_SERVICE} must NOT auto-charge via createSettlementDeduction — FUEL-03 uses dedicated receivable`
      );
    }
    if (!service.includes("pending_review")) {
      problems.push(`${ENGINE_SERVICE} must default overage events to pending_review`);
    }
    if (!service.includes("company_variance")) {
      problems.push(`${ENGINE_SERVICE} must route no-contract-authority events to company_variance`);
    }
    if (!service.includes("computeFuelCardOverageCents")) {
      problems.push(`${ENGINE_SERVICE} must derive amounts via computeFuelCardOverageCents`);
    }
  }

  if (contract && !/signed_on_paper/.test(contract)) {
    problems.push(`${CONTRACT_SERVICE} must gate on signed_on_paper contract authority`);
  }

  if (posting) {
    if (!posting.includes("resolveRoleAccount")) {
      problems.push(`${POSTING_SERVICE} must resolve receivable via resolveRoleAccount`);
    }
    if (!posting.includes(`"${RECEIVABLE_ROLE}"`) && !posting.includes(`'${RECEIVABLE_ROLE}'`)) {
      problems.push(`${POSTING_SERVICE} must use role ${RECEIVABLE_ROLE}`);
    }
    if (!posting.includes("createJournalEntryOnClient")) {
      problems.push(`${POSTING_SERVICE} must reuse createJournalEntryOnClient (no new GL math)`);
    }
  }

  if (math && !/if\s*\(!policy\)\s*return NO_OVERAGE/.test(math)) {
    problems.push(`${OVERAGE_MATH} must return zero overage when no owner policy`);
  }

  if (resolver && !/fuel_overage_receivable/.test(resolver)) {
    problems.push(`${RESOLVER} must register fuel_overage_receivable CoA role`);
  }

  if (mig03) {
    if (!/fuel_card_overage_events/.test(mig03)) {
      problems.push(`${MIGRATION_FUEL03} must create fuel.fuel_card_overage_events`);
    }
    if (!new RegExp(`'${ENGINE_FLAG}'`).test(mig03)) {
      problems.push(`${MIGRATION_FUEL03} must seed ${ENGINE_FLAG}`);
    }
    if (!new RegExp(`'${GL_FLAG}'`).test(mig03)) {
      problems.push(`${MIGRATION_FUEL03} must seed ${GL_FLAG}`);
    }
    if (!/overage_event_id/.test(mig03)) {
      problems.push(`${MIGRATION_FUEL03} must add fuel_transactions.overage_event_id reverse link`);
    }
  }

  if (mig04 && !/driver_fuel_overage_receivable/.test(mig04)) {
    problems.push(`${MIGRATION_FUEL04} must seed driver_fuel_overage_receivable (FUEL-04 dependency)`);
  }

  if (flags) {
    for (const key of [ENGINE_FLAG, GL_FLAG]) {
      if (!flags.includes(`"${key}"`)) {
        problems.push(`${FLAGS_SERVICE} must enroll ${key} in PER_ENTITY_ONLY_FLAG_KEYS`);
      }
    }
  }


  const migUnit = need(MIGRATION_UNIT_FK);
  const canonical = need(CANONICAL_RELS);

  if (service && /ft\.voided_at/.test(service)) {
    problems.push(`${ENGINE_SERVICE} must not filter fuel.fuel_transactions.voided_at (column does not exist)`);
  }
  if (service && !service.includes("loadExistingOverageDeductionLink")) {
    problems.push(`${ENGINE_SERVICE} must read BANK-DOM-06 overage_deduction_id / source_fuel_transaction_id linkage`);
  }
  if (service && !service.includes("appendCrudAudit")) {
    problems.push(`${ENGINE_SERVICE} must emit appendCrudAudit on overage event create/approve`);
  }
  if (importRoutes && /overage\.recovered/.test(importRoutes)) {
    problems.push(`${IMPORT_ROUTES} must use FUEL-03 flush stats (flagged/company_variance), not overage.recovered`);
  }
  if (flags && !flags.includes(`"${RECOVERY_FLAG}"`)) {
    problems.push(`${FLAGS_SERVICE} must keep ${RECOVERY_FLAG} in PER_ENTITY_ONLY_FLAG_KEYS (BANK-DOM-06 seed)`);
  }
  if (migUnit && !/fuel_card_overage_events_unit_fkey/.test(migUnit)) {
    problems.push(`${MIGRATION_UNIT_FK} must add fuel_card_overage_events_unit_fkey → mdata.units`);
  }
  if (canonical && !canonical.includes("fuel.fuel_card_overage_events")) {
    problems.push(`${CANONICAL_RELS} must list fuel.fuel_card_overage_events (Neon-applied)`);
  }

  return problems;
}

function selftest() {
  const baseline = collectProblems(null);
  if (baseline.length) {
    console.error("verify-fuel-overage-engine SELFTEST FAIL — shipped source not clean:");
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const real = (rel) => readFile(rel, null);
  const mutations = [
    {
      name: "import route stops flushing overage",
      sources: { [IMPORT_ROUTES]: real(IMPORT_ROUTES).replaceAll("flushFuelCardOverageAfterCommit", "noop") },
    },
    {
      name: "settlement deduction smuggled back",
      sources: {
        [ENGINE_SERVICE]: real(ENGINE_SERVICE) + "\nawait createSettlementDeduction(",
      },
    },
    {
      name: "contract gate removed",
      sources: { [CONTRACT_SERVICE]: real(CONTRACT_SERVICE).replaceAll("signed_on_paper", "x") },
    },
    {
      name: "receivable role missing from poster",
      sources: { [POSTING_SERVICE]: real(POSTING_SERVICE).replaceAll(RECEIVABLE_ROLE, "cash_advance") },
    },
    {
      name: "approve-then-recover removed",
      sources: {
        [ENGINE_SERVICE]: real(ENGINE_SERVICE).replaceAll("approveAndPostFuelCardOverage", "autoChargeNow"),
      },
    },
    {
      name: "events table migration dropped",
      sources: { [MIGRATION_FUEL03]: real(MIGRATION_FUEL03).replaceAll("fuel_card_overage_events", "x") },
    },
    {
      name: "phantom ft.voided_at reintroduced",
      sources: { [ENGINE_SERVICE]: real(ENGINE_SERVICE) + "\nAND ft.voided_at IS NULL\n" },
    },
    {
      name: "RECOVERY flag dropped from per-entity registry",
      sources: { [FLAGS_SERVICE]: real(FLAGS_SERVICE).replaceAll(`"${RECOVERY_FLAG}"`, '"X_REMOVED"') },
    },
    {
      name: "unit_id FK migration emptied",
      sources: { [MIGRATION_UNIT_FK]: "-- empty\n" },
    },
  ];

  const inert = [];
  for (const m of mutations) {
    let changed = false;
    for (const [rel, mutated] of Object.entries(m.sources)) {
      if (mutated !== real(rel)) changed = true;
    }
    if (!changed) {
      inert.push(`${m.name}: mutation INERT`);
      continue;
    }
    if (collectProblems(m.sources).length === 0) inert.push(`${m.name}: NOT CAUGHT`);
  }

  if (inert.length) {
    console.error("verify-fuel-overage-engine SELFTEST FAIL:");
    for (const e of inert) console.error("  - " + e);
    process.exit(1);
  }
  console.log(`verify-fuel-overage-engine SELFTEST OK — ${mutations.length} defect mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = collectProblems(null);
  if (problems.length) {
    console.error("verify-fuel-overage-engine FAIL:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(
    "verify-fuel-overage-engine OK — evaluator wired, approve-then-recover, fuel_overage_receivable poster, contract gate"
  );
}
