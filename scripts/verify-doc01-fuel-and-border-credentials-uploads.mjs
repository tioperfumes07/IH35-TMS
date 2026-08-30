#!/usr/bin/env node
/**
 * DOC-01 remainder (owner packet IH35-FINISH-2026-08-29/CC-1, GO-1405) -- static-shape guard for
 * two of the four named zero-upload surfaces: CreateFuelTransactionModal.tsx and
 * BorderCredentialsSection.tsx. banking/components/CategorizeDrawer.tsx and MVR check (no backing
 * table) are separate, out of scope for this slice.
 *
 * Fuel: fuel.fuel_transactions has carried source_doc_id -> docs.files(id) since migration
 * 202613290400, but the create route never accepted it and the modal never collected it. Border:
 * driver credentials had no document surface at all; files under the existing "driver" entity
 * type (no new entity_type/backend work needed), tagged with a real catalogs.file_categories code
 * per credential -- fast_card was the one missing category, seeded by this same PR's migration.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const migrationsDir = "db/migrations";
const fuelRoutesPath = "apps/backend/src/fuel/fuel-transactions.routes.ts";
const fuelModalPath = "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx";
const borderSectionPath = "apps/frontend/src/components/driver-profile/BorderCredentialsSection.tsx";

function findMigrationSrc() {
  if (!existsSync(migrationsDir)) return null;
  const hit = readdirSync(migrationsDir).find((f) => f.includes("doc01_border_credentials_fast_card_file_category_seed"));
  return hit ? readFileSync(`${migrationsDir}/${hit}`, "utf8") : null;
}

function analyze(fuelRoutes, fuelModal, borderSection, migration) {
  const failures = [];

  if (!/source_doc_id: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/.test(fuelRoutes)) {
    failures.push(`${fuelRoutesPath}: createFuelTransactionBodySchema does not accept source_doc_id`);
  }
  if (!/source_doc_id,\s*\n\s*\]\)\)/.test(fuelRoutes) && !/b\.source_doc_id \?\? null/.test(fuelRoutes)) {
    failures.push(`${fuelRoutesPath}: INSERT does not pass through b.source_doc_id`);
  }

  if (!/requestUploadUrlFromFile/.test(fuelModal) || !/confirmUpload/.test(fuelModal)) {
    failures.push(`${fuelModalPath}: no requestUploadUrlFromFile/confirmUpload upload wiring found`);
  }
  if (!/source_doc_id: sourceDocId/.test(fuelModal)) {
    failures.push(`${fuelModalPath}: does not pass source_doc_id through to createFuelTransaction`);
  }
  if (!/type="file"/.test(fuelModal)) {
    failures.push(`${fuelModalPath}: no <input type="file"> element`);
  }

  if (!/requestUploadUrlFromFile/.test(borderSection) || !/confirmUpload/.test(borderSection)) {
    failures.push(`${borderSectionPath}: no requestUploadUrlFromFile/confirmUpload upload wiring found`);
  }
  if (!/entity_type: "driver"/.test(borderSection)) {
    failures.push(`${borderSectionPath}: upload does not link to entity_type "driver"`);
  }
  if (!/type="file"/.test(borderSection)) {
    failures.push(`${borderSectionPath}: no <input type="file"> element`);
  }
  for (const key of ["fast_card", "visa", "passport", "mexican_federal_license"]) {
    if (!new RegExp(`["']${key}["']`).test(borderSection)) {
      failures.push(`${borderSectionPath}: credential key "${key}" not referenced -- one of the 4 named credentials is missing`);
    }
  }

  if (!migration) {
    failures.push("no db/migrations/*doc01_border_credentials_fast_card_file_category_seed*.sql found");
  } else if (!/'fast_card'/.test(migration)) {
    failures.push("migration does not seed the fast_card catalogs.file_categories code");
  }

  return failures;
}

function selftest() {
  const fuelRoutes = readFileSync(fuelRoutesPath, "utf8");
  const fuelModal = readFileSync(fuelModalPath, "utf8");
  const borderSection = readFileSync(borderSectionPath, "utf8");
  const migration = findMigrationSrc();

  const good = analyze(fuelRoutes, fuelModal, borderSection, migration);
  if (good.length > 0) {
    console.error("verify-doc01-fuel-and-border-credentials-uploads --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "fuel route schema loses source_doc_id",
      apply: () => analyze(fuelRoutes.replace("source_doc_id: z.string().uuid().nullable().optional(),", ""), fuelModal, borderSection, migration),
    },
    {
      name: "fuel modal loses upload wiring",
      apply: () => analyze(fuelRoutes, fuelModal.replace(/requestUploadUrlFromFile/g, "__STRIPPED__"), borderSection, migration),
    },
    {
      name: "fuel modal loses source_doc_id passthrough",
      apply: () => analyze(fuelRoutes, fuelModal.replace("source_doc_id: sourceDocId,", ""), borderSection, migration),
    },
    {
      name: "border section loses driver entity link",
      apply: () => analyze(fuelRoutes, fuelModal, borderSection.replace(/entity_type: "driver"/g, "__STRIPPED__"), migration),
    },
    {
      name: "border section loses the fast_card credential key",
      apply: () => analyze(fuelRoutes, fuelModal, borderSection.split('"fast_card"').join("__STRIPPED__"), migration),
    },
    {
      name: "migration loses fast_card seed",
      apply: () => analyze(fuelRoutes, fuelModal, borderSection, (migration ?? "").replace("'fast_card'", "")),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const failures = m.apply();
    if (failures.length === 0) {
      console.error(`verify-doc01-fuel-and-border-credentials-uploads --selftest: NOT CAUGHT -- ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught and repository restored green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const fuelRoutes = readFileSync(fuelRoutesPath, "utf8");
  const fuelModal = readFileSync(fuelModalPath, "utf8");
  const borderSection = readFileSync(borderSectionPath, "utf8");
  const migration = findMigrationSrc();
  const failures = analyze(fuelRoutes, fuelModal, borderSection, migration);
  if (failures.length > 0) {
    console.error("verify-doc01-fuel-and-border-credentials-uploads: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-doc01-fuel-and-border-credentials-uploads: OK -- CreateFuelTransactionModal.tsx and BorderCredentialsSection.tsx both have real upload wiring (requestUploadUrlFromFile/confirmUpload), fuel route accepts+persists source_doc_id, border credentials link to entity_type driver with 4 file inputs, fast_card category seeded"
  );
}
