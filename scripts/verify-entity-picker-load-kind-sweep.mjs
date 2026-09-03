#!/usr/bin/env node
/**
 * §9.0 item 17 — systemic load picker sweep: every load FK control must use EntityPicker kind=load
 * (server search + inline create), not LoadAutocomplete / Combobox / native select over listLoads /
 * listDispatchLoads pages. Cursor even claim: 2552.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-entity-picker-load-kind-sweep";

const SURFACES = [
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx",
  "apps/frontend/src/pages/factoring/FactoringHome.tsx",
  "apps/frontend/src/pages/dispatch/PodReviewPage.tsx",
];

const BANNED_FILE = "apps/frontend/src/components/banking/LoadAutocomplete.tsx";

/** listLoads/listDispatchLoads allowed only in these relative paths (registry, tables, hooks — not pickers). */
const LIST_LOADS_ALLOW = new Set([
  "apps/frontend/src/components/parity/entityPickerRegistry.ts",
  "apps/frontend/src/api/loads.ts",
  "apps/frontend/src/api/dispatch.ts",
  "apps/frontend/src/hooks/useInvoiceCreateFromLoad.ts",
  "apps/frontend/src/pages/CustomerDetail.tsx",
  "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
  "apps/frontend/src/pages/Drivers.tsx",
  "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
]);

/** Read-only reverse/list surfaces may query loads, but must prove canonical drill-through and scope. */
const TABLE_ONLY_LOAD_READS = new Map([
  [
    "apps/frontend/src/components/driver-profile/LoadsSection.tsx",
    [
      /listDispatchLoads\(\{[\s\S]*?operating_company_id:\s*operatingCompanyId[\s\S]*?driver:\s*driverId/,
      /<EntityLink\s+kind="load"\s+id=\{row\.id\}/,
      /<EntityLink[\s\S]{0,120}?kind="customer"[\s\S]{0,120}?id=\{row\.customer_id\}/,
      /<ListErrorBanner/,
      /emptyText="No loads found for this driver\."/,
    ],
  ],
]);

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  if (fs.existsSync(path.join(root, BANNED_FILE))) {
    problems.push(`${BANNED_FILE}: LoadAutocomplete shim must be deleted — use EntityPicker kind=load`);
  }

  const registry = readRel(root, "apps/frontend/src/components/parity/entityPickerRegistry.ts");
  if (!registry) {
    problems.push("missing entityPickerRegistry.ts");
  } else {
    const regCode = stripComments(registry);
    if (!/\bload:\s*\{/.test(regCode)) {
      problems.push("entityPickerRegistry: must declare load kind");
    }
    if (!/listLoads\(/.test(regCode)) {
      problems.push("entityPickerRegistry: load kind must call listLoads");
    }
    // LV-FUEL-CREATE-LOAD-PICKER-LAW — Trip/Load must offer + Add new → Book Load (R=W).
    const loadBlock = registry.match(/\n\s*load:\s*\{[\s\S]*?\n\s*\},?\n\s*(?:vendor|customer|driver|unit|trailer):/);
    const loadSrc = loadBlock?.[0] ?? "";
    if (!/inlineCreate:\s*\{\s*available:\s*true\s*\}/.test(loadSrc)) {
      problems.push(
        "entityPickerRegistry: load.inlineCreate.available must be true (picker law → Book Load wizard)",
      );
    }
  }

  const entityPicker = readRel(root, "apps/frontend/src/components/EntityPicker.tsx");
  if (!entityPicker) {
    problems.push("missing EntityPicker.tsx");
  } else {
    if (!/kind === ["']load["']/.test(entityPicker) || !/BookLoadModalV4/.test(entityPicker)) {
      problems.push("EntityPicker: load inline create must mount BookLoadModalV4 (canonical Book Load writer)");
    }
  }

  for (const rel of SURFACES) {
    const src = readRel(root, rel);
    if (!src) {
      problems.push(`missing ${rel}`);
      continue;
    }
    const code = stripComments(src);
    if (!/EntityPicker[\s\S]*?kind=["']load["']/.test(code)) {
      problems.push(`${rel}: load field must use EntityPicker kind=load`);
    }
    if (/LoadAutocomplete/.test(src)) {
      problems.push(`${rel}: must not import LoadAutocomplete`);
    }
    if (/listLoads\(/.test(code)) {
      problems.push(`${rel}: must not local-fetch listLoads — EntityPicker owns roster search`);
    }
    if (/listDispatchLoads\(/.test(code)) {
      problems.push(`${rel}: must not local-fetch listDispatchLoads — EntityPicker kind=load`);
    }
    if (/Combobox[\s\S]{0,400}load|loadOptions[\s\S]{0,200}Combobox/.test(code)) {
      problems.push(`${rel}: must not use Combobox for load selection`);
    }
    if (/loadOptions\.map/.test(code)) {
      problems.push(`${rel}: must not render native load option list — EntityPicker kind=load`);
    }
  }

  // Ratchet: no new LoadAutocomplete imports anywhere in frontend src.
  const feRoot = path.join(root, "apps/frontend/src");
  if (fs.existsSync(feRoot)) {
    for (const rel of walkTsx(feRoot)) {
      const fullRel = path.relative(root, rel);
      const src = fs.readFileSync(rel, "utf8");
      if (/LoadAutocomplete/.test(src)) {
        problems.push(`${fullRel}: LoadAutocomplete banned — EntityPicker kind=load`);
      }
    }
  }

  // Ratchet: listLoads in tsx outside allowlist (picker drift).
  for (const rel of LIST_LOADS_ALLOW) {
    // pre-seeded allowlist only — scanned below for unexpected tsx callers
  }
  if (fs.existsSync(feRoot)) {
    for (const abs of walkTsx(feRoot)) {
      const rel = path.relative(root, abs);
      if (LIST_LOADS_ALLOW.has(rel) || /\.(test|spec)\./.test(rel)) continue;
      const code = stripComments(fs.readFileSync(abs, "utf8"));
      if (/listLoads\(|listDispatchLoads\(/.test(code)) {
        const tableContract = TABLE_ONLY_LOAD_READS.get(rel);
        if (tableContract) {
          for (const pattern of tableContract) {
            if (!pattern.test(code)) problems.push(`${rel}: table-only load read lost scope, honest state, or canonical drill-through (${pattern})`);
          }
          continue;
        }
        problems.push(`${rel}: listLoads/listDispatchLoads outside allowlist — migrate to EntityPicker kind=load or add honest table-only allow`);
      }
    }
  }

  return problems;
}

function walkTsx(dir, out = []) {
  for (const e of fs.readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const full = path.join(dir, e);
    if (fs.statSync(full).isDirectory()) walkTsx(full, out);
    else if (/\.tsx?$/.test(e) && !/\.(test|spec)\./.test(e)) out.push(full);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL: baseline not clean`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-ep-load-sweep-"));
  try {
    const regDir = path.join(stubRoot, "apps/frontend/src/components/parity");
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(
      path.join(regDir, "entityPickerRegistry.ts"),
      `export const ENTITY_PICKERS = { unit: { list: async () => [] } };`
    );
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/pages/banking/components"), { recursive: true });
    fs.writeFileSync(
      path.join(stubRoot, "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx"),
      `import { LoadAutocomplete } from "../../../components/banking/LoadAutocomplete";
listLoads({ limit: 200 })
<LoadAutocomplete companyId={id} value="" onChange={() => {}} />`
    );
    fs.writeFileSync(
      path.join(stubRoot, "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx"),
      `listLoads({})
<Combobox options={loadOptions} />`
    );
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/pages/factoring"), { recursive: true });
    fs.writeFileSync(
      path.join(stubRoot, "apps/frontend/src/pages/factoring/FactoringHome.tsx"),
      `listLoads({ limit: 200 })
<Combobox options={[]} />`
    );
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/pages/dispatch"), { recursive: true });
    fs.writeFileSync(
      path.join(stubRoot, "apps/frontend/src/pages/dispatch/PodReviewPage.tsx"),
      `listDispatchLoads({ limit: 50 })
{loadOptions.map((load) => <option key={load.id} />)}`
    );
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/components/banking"), { recursive: true });
    fs.writeFileSync(path.join(stubRoot, "apps/frontend/src/components/banking/LoadAutocomplete.tsx"), "export {}");
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/components/driver-profile"), { recursive: true });
    fs.writeFileSync(
      path.join(stubRoot, "apps/frontend/src/components/driver-profile/LoadsSection.tsx"),
      `listDispatchLoads({ operating_company_id: operatingCompanyId, driver: driverId })\n<EntityLink kind="load" id={row.id} />`
    );
    const planted = collectProblems(stubRoot);
    if (planted.length < 5 || !planted.some((problem) => problem.includes("table-only load read lost"))) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL hard enough`, planted);
      process.exit(1);
    }
  } finally {
    fs.rmSync(stubRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — load pickers use EntityPicker kind=load (§9.0 item 17 sweep)`);
}
