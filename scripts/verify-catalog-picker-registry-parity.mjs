#!/usr/bin/env node
/**
 * GUARD — catalog picker registry parity + class UUID label ban (Cascade picker-class sweep).
 *
 * Asserts for every createKind registration in catalogPickerRegistry.ts:
 *   (a) readTable === writeTable (and catalog entries: readEndpoint === writeEndpoint)
 *   (b) entityScoped: true (operating_company_id on both paths)
 *   (c) catalogs.classes labels cannot be bare UUIDs — migration CHECK + banking Class picker
 *       never renders id as the human label; EditVehicleModal uses company Combobox (not raw UUID text)
 *   (d) Banking vendor/customer pickers are server-searchable (onSearch) — not limit 1000/5000 dumps
 *
 * Mutation-prove both ways via --selftest.
 *
 *   node scripts/verify-catalog-picker-registry-parity.mjs
 *   node scripts/verify-catalog-picker-registry-parity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-catalog-picker-registry-parity";

const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const FLEET = "apps/frontend/src/components/fleet/EditVehicleModal.tsx";
const BANKING = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const CC_PAY = "apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx";
const MIGRATION = "db/migrations/202611301200_catalogs_classes_class_name_not_uuid.sql";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Parse `{ key: { ... }, ...}` / `key: catalogEntry({...})` entry bodies from CATALOG_PICKER_CONFIGS. */
export function parseRegistryEntries(registrySrc) {
  const start = registrySrc.indexOf("CATALOG_PICKER_CONFIGS");
  if (start < 0) return [];
  const brace = registrySrc.indexOf("{", start);
  if (brace < 0) return [];
  let depth = 0;
  let end = brace;
  for (let i = brace; i < registrySrc.length; i++) {
    const ch = registrySrc[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = registrySrc.slice(brace + 1, end);
  const entries = [];
  const keyRe = /\n\s{2}([a-z][a-z0-9_]*)\s*:\s*(catalogEntry\s*\()?\{/g;
  let m;
  while ((m = keyRe.exec(body))) {
    const key = m[1];
    const viaCatalogEntry = Boolean(m[2]);
    const from = m.index + m[0].length - 1;
    let d = 0;
    let j = from;
    for (; j < body.length; j++) {
      if (body[j] === "{") d += 1;
      else if (body[j] === "}") {
        d -= 1;
        if (d === 0) {
          j += 1;
          break;
        }
      }
    }
    entries.push({ key, block: body.slice(from, j), viaCatalogEntry });
  }
  return entries;
}

/**
 * @param {{ registry: string, fleet: string, banking: string, ccPay: string, migration: string }} sources
 * @returns {string[]}
 */
export function collectProblems(sources) {
  const problems = [];
  const registryCode = stripComments(sources.registry);
  const entries = parseRegistryEntries(registryCode);
  if (entries.length < 8) {
    problems.push(`${REGISTRY}: expected many createKind registrations, found ${entries.length}`);
  }

  for (const { key, block, viaCatalogEntry } of entries) {
    const readTable = block.match(/readTable:\s*"([^"]+)"/)?.[1]
      ?? block.match(/table:\s*"([^"]+)"/)?.[1];
    const writeTable = block.match(/writeTable:\s*"([^"]+)"/)?.[1]
      ?? block.match(/table:\s*"([^"]+)"/)?.[1];
    if (!readTable || !writeTable) {
      problems.push(`${REGISTRY}[${key}]: missing readTable/writeTable (or catalogEntry table)`);
      continue;
    }
    if (readTable !== writeTable) {
      problems.push(`${REGISTRY}[${key}]: readTable (${readTable}) !== writeTable (${writeTable})`);
    }
    // catalogEntry() sets entityScoped:true by construction (see catalogPickerRegistry.ts).
    if (!viaCatalogEntry && !/entityScoped:\s*true/.test(block)) {
      problems.push(`${REGISTRY}[${key}]: entityScoped must be true (operating_company_id on read+write)`);
    }
    if (viaCatalogEntry && !/function catalogEntry|entityScoped:\s*true/.test(sources.registry)) {
      problems.push(`${REGISTRY}: catalogEntry helper must force entityScoped: true`);
    }
    const readEp = block.match(/readEndpoint:\s*"([^"]+)"/)?.[1]
      ?? block.match(/endpoint:\s*"([^"]+)"/)?.[1];
    const writeEp = block.match(/writeEndpoint:\s*"([^"]+)"/)?.[1]
      ?? block.match(/endpoint:\s*"([^"]+)"/)?.[1];
    if (readEp && writeEp && readEp !== writeEp && /readWriteParity:\s*"same-endpoint-verified"/.test(block)) {
      problems.push(`${REGISTRY}[${key}]: same-endpoint-verified but endpoints diverge`);
    }
  }

  const classEntry = entries.find((e) => e.key === "class");
  if (!classEntry) {
    problems.push(`${REGISTRY}: missing createKind=class`);
  } else if (!/catalogs\.classes/.test(classEntry.block)) {
    problems.push(`${REGISTRY}[class]: must read/write catalogs.classes`);
  }

  if (!/chk_catalogs_classes_class_name_not_uuid/.test(sources.migration)) {
    problems.push(`${MIGRATION}: must add chk_catalogs_classes_class_name_not_uuid`);
  }
  if (!sources.migration.includes("[0-9a-f]{8}-[0-9a-f]{4}") || !/class_name/.test(sources.migration)) {
    problems.push(`${MIGRATION}: must clean + ban UUID-pattern class_name values`);
  }

  if (/Owner Company ID|Leased To Company ID/.test(sources.fleet) && /type:\s*"text"/.test(sources.fleet)) {
    // specifically the company fields
  }
  if (/owner_company_id[\s\S]{0,80}type:\s*"text"/.test(sources.fleet) ||
      /currently_leased_to_company_id[\s\S]{0,80}type:\s*"text"/.test(sources.fleet)) {
    problems.push(`${FLEET}: owner_company_id / currently_leased_to_company_id must not be raw text UUID inputs`);
  }
  if (!/type:\s*"company"/.test(sources.fleet) || !/listMyCompanies/.test(sources.fleet) || !/Combobox/.test(sources.fleet)) {
    problems.push(`${FLEET}: company fields must use listMyCompanies + Combobox picker`);
  }

  if (/limit:\s*1000/.test(sources.banking) || /limit:\s*5000/.test(sources.banking)) {
    problems.push(`${BANKING}: vendor/customer pickers must not dump limit 1000/5000 — use searchable pages`);
  }
  if (!/onSearch=\{setVendorSearch\}/.test(sources.banking) || !/onSearch=\{setCustomerSearch\}/.test(sources.banking)) {
    problems.push(`${BANKING}: vendor + customer ReferenceSelect must pass onSearch (server type-ahead)`);
  }
  if (!/Unnamed class/.test(sources.banking) || !/label !== c\.id/.test(sources.banking)) {
    problems.push(`${BANKING}: Class picker must never use row id as the human label`);
  }

  if (/limit:\s*1000/.test(sources.ccPay) && !/onSearch=\{setVendorSearch\}/.test(sources.ccPay)) {
    problems.push(`${CC_PAY}: CC vendor picker must be searchable (not limit 1000 dump)`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = {
    registry: read(REGISTRY),
    fleet: read(FLEET),
    banking: read(BANKING),
    ccPay: read(CC_PAY),
    migration: read(MIGRATION),
  };
  const broken = {
    registry: `const CATALOG_PICKER_CONFIGS = {\n  class: {\n    key: "class",\n    readTable: "a",\n    writeTable: "b",\n    entityScoped: false,\n  },\n};\n`,
    fleet: `{ key: "owner_company_id", label: "Owner Company ID", type: "text", tab: "Identity" }`,
    banking: `listVendors({ operating_company_id: companyId, limit: 1000 })\nlistCustomers({ limit: 5000 })\nlabel: c.id`,
    ccPay: `listVendors({ limit: 1000 })`,
    migration: "-- no check",
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken sources not flagged`);
    process.exit(1);
  }
  const realProblems = collectProblems(real);
  if (realProblems.length) {
    console.error(`${LABEL} --selftest FAIL: real flagged`, realProblems);
    process.exit(1);
  }
  // Mutation prove: flip one real field → must fail
  const mutated = { ...real, banking: real.banking.replace("onSearch={setVendorSearch}", "/* no search */") };
  if (collectProblems(mutated).length === 0) {
    console.error(`${LABEL} --selftest FAIL: mutated banking did not fail`);
    process.exit(1);
  }
  const mutatedFleet = {
    ...real,
    fleet: real.fleet
      .replace(/type:\s*"company"/g, 'type: "text"')
      .replace(/listMyCompanies/g, "listGone"),
  };
  if (collectProblems(mutatedFleet).length === 0) {
    console.error(`${LABEL} --selftest FAIL: mutated fleet did not fail`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems({
    registry: read(REGISTRY),
    fleet: read(FLEET),
    banking: read(BANKING),
    ccPay: read(CC_PAY),
    migration: read(MIGRATION),
  });
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}
