#!/usr/bin/env node
/**
 * LST-WIRE-07-CUSTOMER-TYPES-CATALOG-NO-CONSUMER — catalogs.customer_types (migration
 * 202610150000, "LST-WIRE-07") had a fully-built backend catalog (table, FORCED RLS, seeded rows,
 * working generic-catalog route) but ZERO frontend consumers and no catalogPickerRegistry entry.
 * The live UI ran entirely on the OLD, unrelated mdata.customers.customer_type 2-value enum.
 *
 * Fix (this guard locks it): an additive nullable FK (mdata.customers.customer_type_id, migration
 * 202612820000, composite-scoped same-entity) + a registered "customer_type" catalogPickerRegistry
 * entry + CustomerProfileForm.tsx wiring a real ReferenceSelect createKind="customer_type" —
 * additional to, never replacing, the legacy customer_type enum field.
 *
 * FAIL: the migration is missing, OR the registry has no "customer_type" key, OR
 * CustomerProfileForm.tsx doesn't wire ReferenceSelect createKind="customer_type".
 * PASS: all three hold.
 *
 * Self-test: node scripts/verify-customer-type-picker-law.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-type-picker-law";

const FILES = {
  migration: "db/migrations/202612820000_customer_type_fk.sql",
  registry: "apps/frontend/src/components/parity/catalogPickerRegistry.ts",
  form: "apps/frontend/src/components/customers/CustomerProfileForm.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, out) {
  if (!cond) out.push(msg);
}

function failures(sources) {
  const out = [];

  assert(
    fs.existsSync(path.join(ROOT, FILES.migration)) || sources[FILES.migration] !== undefined,
    `${FILES.migration}: missing`,
    out
  );
  const migration = sources[FILES.migration] ?? "";
  assert(
    /customer_type_id\s+uuid/.test(migration) && /REFERENCES catalogs\.customer_types/.test(migration),
    `${FILES.migration}: missing customer_type_id uuid column with an FK to catalogs.customer_types`,
    out
  );

  const registry = sources[FILES.registry];
  const registryBlockStart = registry.indexOf('customer_type: catalogEntry({');
  assert(registryBlockStart !== -1, `${FILES.registry}: no "customer_type" catalogEntry() registration`, out);
  if (registryBlockStart !== -1) {
    const block = registry.slice(registryBlockStart, registryBlockStart + 500);
    assert(/table:\s*"catalogs\.customer_types"/.test(block), `${FILES.registry}: customer_type entry does not read catalogs.customer_types`, out);
  }

  const form = sources[FILES.form];
  const formStart = form.indexOf('span className="mb-1 block text-xs font-semibold text-gray-600">Customer category');
  assert(formStart !== -1, `${FILES.form}: "Customer category" field anchor not found — file shape changed`, out);
  if (formStart !== -1) {
    const block = form.slice(formStart, formStart + 400);
    assert(/ReferenceSelect/.test(block), `${FILES.form}: Customer category field must use ReferenceSelect`, out);
    assert(/createKind="customer_type"/.test(block), `${FILES.form}: Customer category field missing createKind="customer_type"`, out);
  }

  return out;
}

const live = Object.fromEntries(
  Object.values(FILES)
    .filter((rel) => fs.existsSync(path.join(ROOT, rel)))
    .map((rel) => [rel, read(rel)])
);

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "migration FK removed",
      file: FILES.migration,
      mutate: (t) => t.replace(/REFERENCES catalogs\.customer_types \(operating_company_id, id\);/, ";"),
    },
    {
      name: "registry entry removed",
      file: FILES.registry,
      mutate: (t) => t.replace('customer_type: catalogEntry({', 'customer_type_DISABLED: catalogEntry({'),
    },
    {
      name: "form loses createKind",
      file: FILES.form,
      mutate: (t) => t.replace('createKind="customer_type"', 'createKind="customer_type_disabled"'),
    },
  ];
  const escaped = [];
  for (const { name, file, mutate } of mutations) {
    const mutated = mutate(live[file]);
    if (mutated === live[file]) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    const mutant = { ...live, [file]: mutated };
    if (failures(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customer_type_id FK + registry entry + CustomerProfileForm ReferenceSelect all wired`);
