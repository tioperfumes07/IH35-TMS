#!/usr/bin/env node
/**
 * LST-PICKER-01/03 — the shared picker capability must be CONFIG-DRIVEN, and every wired catalog's
 * inline create must write the SAME canonical table its picker reads.
 *
 * THE DEFECT THIS GUARD PINS
 * --------------------------
 * apps/frontend/src/components/parity/ReferenceSelect.tsx documented the 7-clause picker law and was
 * adopted by ~42 call sites, but its create kinds were a HARDCODED UNION OF SIX
 * (`QuickCreateKind = "vendor"|"customer"|"item"|"category"|"part"|"class"`) dispatched to two forked
 * backends by a hardcoded `INLINE_KINDS` Set inside the component. Any catalog outside those six
 * could not have inline create at all unless somebody authored a brand-new form component — so
 * roughly 68 of 75 catalogs had no "+ Create" row in their consuming picker.
 *
 * Run this against pre-fix origin/main and it FAILS on the hardcoded Set and the missing registry.
 *
 * ASSERTS
 * -------
 *  CONFIG-DRIVEN  a per-catalog registry exists; ReferenceSelect resolves the create backend THROUGH
 *                 it (getCatalogPickerConfig + config.backend) and holds NO hardcoded kind Set/list.
 *  NO-NEW-COMPONENT  config-driven catalogs all render ONE generic drawer, and that drawer contains
 *                 no per-catalog branch — adding a catalog cannot require a new component.
 *  CLAUSE-5       every registry entry declares readTable === writeTable; every config-driven entry
 *                 additionally declares readEndpoint === writeEndpoint, and the helper that builds
 *                 those entries derives both sides from ONE field so they cannot drift.
 *  REAL-BACKEND   every config-driven endpoint's module is actually MOUNTED in apps/backend/src, and
 *                 the known-broken catalog families stay unwired (fleet 42601, maintenance mounted,
 *                 accounting/payment-terms 42701).
 *  NO-REGRESSION  the original eight legacy kinds keep their original create backend.
 *  PICKER-LAW     "+ Create" is the first row INSIDE the dropdown (Combobox allowAddNew), never an
 *                 external button; entity scoping is declared on every entry and sent on every write.
 *  §7             locked palette + "+ Create"/"+ Book" vocabulary in the new surfaces.
 *
 *   node scripts/verify-lst-picker-config-driven.mjs
 *   node scripts/verify-lst-picker-config-driven.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker-config-driven";

const FILES = {
  registry: "apps/frontend/src/components/parity/catalogPickerRegistry.ts",
  select: "apps/frontend/src/components/parity/ReferenceSelect.tsx",
  drawer: "apps/frontend/src/components/parity/CatalogQuickCreateDrawer.tsx",
  backendIndex: "apps/backend/src/index.ts",
  detentionPicker: "apps/frontend/src/pages/dispatch/components/book-load-v4/ExpectedAdjustmentsCallout.tsx",
  bookLoad: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  loadRoutes: "apps/backend/src/dispatch/loads.routes.ts",
  bookService: "apps/backend/src/dispatch/book-load.service.ts",
  migration: "db/migrations/202612501200_p44_load_detention_reason_canonical_fk.sql",
  pickupPicker: "apps/frontend/src/pages/dispatch/components/BookLoadStopsSection.tsx",
  pickupMigration: "db/migrations/202612501400_p44_load_stop_pickup_time_type_canonical_fk.sql",
  loadTypeMigration: "db/migrations/202612501600_p44_load_catalog_load_type_canonical_fk.sql",
  editMapping: "apps/frontend/src/pages/dispatch/components/book-load-v4/editLoadMapping.ts",
  cancellationService: "apps/backend/src/dispatch/cancellation.service.ts",
  cancellationMigration: "db/migrations/202612501800_p44_load_cancellation_reason_same_opco_fk.sql",
  dispatchFlagDrawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
  dispatchFlagMigration: "db/migrations/202612502000_p44_dispatch_flag_color_canonical_fk.sql",
  accessorialEditor: "apps/frontend/src/components/dispatch/AccessorialEditor.tsx",
  additionalChargeMigration: "db/migrations/202612502200_p44_load_additional_charge_lines_canonical_fk.sql",
};

const MISSING = "MISSING";

/** The eight kinds that predate LST-PICKER-01 → the backend each MUST keep. */
const LEGACY_BACKENDS = {
  vendor: "inline-drawer",
  customer: "inline-drawer",
  account: "inline-drawer",
  service: "inline-drawer",
  item: "quick-create-modal",
  category: "quick-create-modal",
  part: "quick-create-modal",
  class: "quick-create-modal",
};

/** Catalog families that must NOT be wired until their backend is fixed (each is a live defect). */
const FORBIDDEN_ENDPOINTS = [
  // fleet catalogs fixed (P47) — inline `--` removed from factory.ts SQL templates
  ["/api/v1/catalogs/accounting/payment-terms", "codeColumn and nameColumn are both terms_name (accounting/index.ts:100-101) → INSERT names the column twice → 42701"],
  ["/api/v1/accounting/categories", "reads mdata.qbo_accounts but creates into catalogs.* → clause-5 violation, owned by another PR"],
];

/** Each config-driven endpoint prefix → the backend registrar that must be mounted for it to exist. */
const ENDPOINT_MOUNTS = [
  ["/api/v1/catalogs/dispatch/", "registerDispatchCatalogRoutes"],
  ["/api/v1/catalogs/driver/", "registerDriverCatalogRoutes"],
  ["/api/v1/catalogs/fuel/", "registerFuelCatalogRoutes"],
  ["/api/v1/catalogs/maintenance/", "registerMaintenanceCatalogRoutes"],
];

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return MISSING;
    throw error;
  }
}

/** Only executable code counts — the doc comments deliberately quote the OLD hardcoded union. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Split the registry object literal into one text block per entry key. */
function entryBlocks(registryCode) {
  const start = registryCode.indexOf("CATALOG_PICKER_CONFIGS = {");
  if (start === -1) return {};
  const body = registryCode.slice(start);
  const blocks = {};
  const re = /(^|\n)\s{2}([a-z_][a-zA-Z0-9_]*):\s*(\{|catalogEntry\()/g;
  const starts = [];
  let m;
  while ((m = re.exec(body))) starts.push({ key: m[2], at: m.index });
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1].at : body.length;
    blocks[starts[i].key] = body.slice(starts[i].at, end);
  }
  return blocks;
}

function field(block, name) {
  const m = block.match(new RegExp(`${name}:\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

export function contractErrors(src) {
  const errors = [];

  for (const [key, source] of Object.entries(src)) {
    if (source === MISSING) errors.push(`missing file: ${FILES[key] ?? key}`);
  }
  if (errors.length) return errors;

  const registry = stripComments(src.registry);
  const select = stripComments(src.select);
  const drawer = stripComments(src.drawer);

  // P44 Wave A: the detention catalog is only R=W if the selected canonical UUID crosses every
  // layer and survives reload. A code-only picker with no load FK is a dead-end, not linkage.
  if (!/value:\s*row\.id/.test(src.detentionPicker) || /createdValueField="code"/.test(src.detentionPicker)) {
    errors.push("P44-FK: detention picker must select catalogs.detention_reasons.id");
  }
  if (!/detention_reason_id:\s*values\.detention_reason_id/.test(src.bookLoad)) {
    errors.push("P44-FK: Book Load payload must carry detention_reason_id");
  }
  if (!/detention_reason_id:\s*z\.string\(\)\.uuid/.test(src.loadRoutes)) {
    errors.push("P44-FK: backend create/update schema must accept a UUID detention_reason_id");
  }
  if (!/detention_expected_y_n, detention_reason_id, detention_expected_hours/.test(src.bookService)) {
    errors.push("P44-FK: mdata.loads INSERT must persist detention_reason_id");
  }
  if (!/FOREIGN KEY \(detention_reason_id, operating_company_id\)/.test(src.migration)) {
    errors.push("P44-FK: migration must enforce same-opco detention reason linkage");
  }
  if (!/createKind="pickup_time_type"/.test(src.pickupPicker) || !/value:\s*row\.id/.test(src.bookLoad)) {
    errors.push("P44-FK: Book Load pickup type picker must create and select catalogs.pickup_time_types.id");
  }
  if (!/pickup_time_type_id:\s*stop\.pickup_time_type_id/.test(src.bookLoad)) {
    errors.push("P44-FK: Book Load stop payload must carry pickup_time_type_id");
  }
  if (!/pickup_time_type_id:\s*z\.string\(\)\.uuid/.test(src.loadRoutes)) {
    errors.push("P44-FK: backend stop schemas must accept pickup_time_type_id UUID");
  }
  if (!/time_window_type, pickup_time_type_id, appointment_start_at/.test(src.bookService)) {
    errors.push("P44-FK: load stop INSERT must persist pickup_time_type_id");
  }
  if (!/FOREIGN KEY \(pickup_time_type_id\)/.test(src.pickupMigration) || !/enforce_load_stop_pickup_time_type_company/.test(src.pickupMigration)) {
    errors.push("P44-FK: pickup-time migration must enforce canonical FK plus same-opco constraint");
  }
  if (!/createKind="load_type"/.test(src.bookLoad) || !/catalog_load_type_id:\s*values\.catalog_load_type_id/.test(src.bookLoad)) {
    errors.push("P44-FK: Book Load must select and submit the distinct canonical catalog_load_type_id");
  }
  if (!/catalog_load_type_id:\s*z\.string\(\)\.uuid/.test(src.loadRoutes)) {
    errors.push("P44-FK: backend schemas must accept catalog_load_type_id UUID");
  }
  if (!/catalog_load_type_id = \$9::uuid/.test(src.bookService)) {
    errors.push("P44-FK: Book Load create service must persist catalog_load_type_id");
  }
  if (!/FOREIGN KEY \(catalog_load_type_id, operating_company_id\)/.test(src.loadTypeMigration)) {
    errors.push("P44-FK: load-types migration must enforce same-opco canonical FK");
  }
  if (!/catalog_load_type_id:\s*str\(load\.catalog_load_type_id\)/.test(src.editMapping) || !/\["catalog_load_type_id", "catalog_load_type_id"/.test(src.editMapping)) {
    errors.push("P44-FK: canonical load type selection must survive detail reload and edit");
  }
  if (!/reason_code_id:\s*reason\.id/.test(src.cancellationService) || !/operating_company_id = \$2/.test(src.cancellationService)) {
    errors.push("P44-FK: cancellation writer must resolve and persist the same-opco canonical reason UUID");
  }
  if (!/FOREIGN KEY \(reason_code_id, operating_company_id\)/.test(src.cancellationMigration) || !/ALTER COLUMN reason_code_id SET NOT NULL/.test(src.cancellationMigration)) {
    errors.push("P44-FK: load cancellations must enforce a NOT NULL same-opco reason FK");
  }
  if (!/createKind="dispatch_flag_color"/.test(src.dispatchFlagDrawer) || !/dispatch_flag_color_id/.test(src.dispatchFlagDrawer)) {
    errors.push("P44-FK: Dispatch load drawer must select and persist the canonical dispatch flag UUID");
  }
  if (!/loads_dispatch_flag_color_same_company_fk/.test(src.dispatchFlagMigration) || !/ALTER COLUMN dispatch_flag_color_id SET NOT NULL/.test(src.dispatchFlagMigration)) {
    errors.push("P44-FK: loads must enforce a NOT NULL same-opco dispatch flag color FK");
  }
  if (!/value=\{row\.additional_charge_id \|\| null\}/.test(src.accessorialEditor) || !/createKind="additional_charge"/.test(src.accessorialEditor)) {
    errors.push("P44-FK: Book Load accessorial picker must select the canonical additional charge UUID");
  }
  if (!/load_charge_lines_additional_charge_same_company_fk/.test(src.additionalChargeMigration) || !/line_kind = 'accessorial' AND additional_charge_id IS NOT NULL/.test(src.additionalChargeMigration)) {
    errors.push("P44-FK: accessorial load lines must enforce a non-null same-opco additional charge FK");
  }
  if (!/additional_charge_id:\s*str\(line\.additional_charge_id\)/.test(src.editMapping)) {
    errors.push("P44-FK: canonical accessorial selection must survive detail reload into Edit Book Load");
  }

  // ── CONFIG-DRIVEN: the pinned defect ────────────────────────────────────────────────────────
  if (/INLINE_KINDS/.test(select)) {
    errors.push(
      "CONFIG-DRIVEN: ReferenceSelect still holds the hardcoded INLINE_KINDS Set — the create backend must come from the config registry"
    );
  }
  if (/new Set<[^>]*>\(\s*\[/.test(select)) {
    errors.push("CONFIG-DRIVEN: ReferenceSelect must not decide the create backend from a hardcoded Set of kinds");
  }
  if (!select.includes("getCatalogPickerConfig")) {
    errors.push("CONFIG-DRIVEN: ReferenceSelect must resolve its create surface via getCatalogPickerConfig(...)");
  }
  if (!/config\.backend/.test(select)) {
    errors.push("CONFIG-DRIVEN: ReferenceSelect must dispatch on config.backend, not on the kind literal");
  }
  if (!/catalogPickerRegistry/.test(select)) {
    errors.push("CONFIG-DRIVEN: ReferenceSelect must import from ./catalogPickerRegistry");
  }
  // The default "+ ..." label must come from config too, or a new catalog still needs a code edit.
  if (/`\+ Add new \$\{createKind\}`/.test(select)) {
    errors.push("CONFIG-DRIVEN: the dropdown's first-row label is still built from the raw createKind literal");
  }

  const blocks = entryBlocks(registry);
  const keys = Object.keys(blocks);
  if (keys.length === 0) {
    errors.push("CONFIG-DRIVEN: CATALOG_PICKER_CONFIGS registry not found or has no entries");
    return errors;
  }

  // ── CLAUSE 5: inline create writes the table the picker reads ────────────────────────────────
  // Entries built by catalogEntry() get both sides from ONE field, so assert that helper first.
  // Slice from the helper to the registry literal — a lazy `\n}` match would stop inside the
  // helper's own parameter type block and silently assert nothing.
  const helperStart = registry.indexOf("function catalogEntry(");
  const helperEnd = registry.indexOf("CATALOG_PICKER_CONFIGS");
  if (helperStart === -1 || helperEnd === -1 || helperEnd < helperStart) {
    errors.push("CLAUSE-5: the catalogEntry() helper that derives read/write from one table is gone");
  } else {
    const h = registry.slice(helperStart, helperEnd);
    if (!/readTable:\s*entry\.table/.test(h) || !/writeTable:\s*entry\.table/.test(h)) {
      errors.push("CLAUSE-5: catalogEntry() must set readTable AND writeTable from the SAME entry.table");
    }
    if (!/readEndpoint:\s*entry\.endpoint/.test(h) || !/writeEndpoint:\s*entry\.endpoint/.test(h)) {
      errors.push("CLAUSE-5: catalogEntry() must set readEndpoint AND writeEndpoint from the SAME entry.endpoint");
    }
  }

  const configDriven = [];
  for (const [key, block] of Object.entries(blocks)) {
    const isCatalogEntry = /catalogEntry\(/.test(block);
    if (isCatalogEntry) {
      configDriven.push(key);
      const endpoint = field(block, "endpoint");
      const table = field(block, "table");
      if (!endpoint) errors.push(`CLAUSE-5: config-driven entry "${key}" declares no endpoint`);
      if (!table) errors.push(`CLAUSE-5: config-driven entry "${key}" declares no canonical table`);
      if (!/evidence:\s*"[^"]*:\d+/.test(block)) {
        errors.push(`EVIDENCE: config-driven entry "${key}" must cite backend file:line proving read table === write table`);
      }
      if (endpoint) {
        for (const [prefix, why] of FORBIDDEN_ENDPOINTS) {
          if (endpoint.startsWith(prefix)) {
            errors.push(`REAL-BACKEND: "${key}" wires ${endpoint} — must stay unwired: ${why}`);
          }
        }
      }
      continue;
    }
    // Legacy hand-written entries: assert the declared tables match.
    const readTable = field(block, "readTable");
    const writeTable = field(block, "writeTable");
    if (!readTable || !writeTable) {
      errors.push(`CLAUSE-5: entry "${key}" must declare both readTable and writeTable`);
    } else if (readTable !== writeTable) {
      errors.push(
        `CLAUSE-5 VIOLATION: entry "${key}" reads ${readTable} but its inline create writes ${writeTable} — a row created inline vanishes on reload`
      );
    }
    if (!/entityScoped:\s*true/.test(block)) {
      errors.push(`ENTITY-SCOPE: entry "${key}" must declare entityScoped: true`);
    }
  }

  for (const key of configDriven) {
    if (!/entityScoped:\s*true/.test(blocks[key]) && !/entityScoped:\s*true/.test(registry)) {
      errors.push(`ENTITY-SCOPE: config-driven entry "${key}" is not entity-scoped`);
    }
  }

  // ── NO-NEW-COMPONENT: a batch is wired, all through ONE generic drawer ───────────────────────
  if (configDriven.length < 10) {
    errors.push(
      `CONFIG-DRIVEN: only ${configDriven.length} config-driven catalog(s) wired — the batch must prove the registry works at scale (>=10)`
    );
  }
  if (!select.includes("CatalogQuickCreateDrawer")) {
    errors.push("NO-NEW-COMPONENT: ReferenceSelect must render the shared CatalogQuickCreateDrawer for config-driven kinds");
  }
  if (/kind\s*===\s*"/.test(drawer)) {
    errors.push("NO-NEW-COMPONENT: CatalogQuickCreateDrawer must contain NO per-catalog branch (found a `kind === \"…\"` test)");
  }
  for (const key of configDriven) {
    if (new RegExp(`["'\`]${key}["'\`]`).test(drawer)) {
      errors.push(`NO-NEW-COMPONENT: CatalogQuickCreateDrawer names the catalog "${key}" — it must be catalog-agnostic`);
    }
  }
  if (!/config\.fields/.test(drawer) || !/config\.create/.test(drawer)) {
    errors.push("NO-NEW-COMPONENT: CatalogQuickCreateDrawer must render config.fields and submit through config.create");
  }

  // ── REAL-BACKEND: every wired endpoint family is actually mounted ────────────────────────────
  for (const [prefix, registrar] of ENDPOINT_MOUNTS) {
    const used = configDriven.some((k) => (field(blocks[k], "endpoint") ?? "").startsWith(prefix));
    if (used && !new RegExp(`${registrar}\\(app\\)`).test(src.backendIndex)) {
      errors.push(`REAL-BACKEND: catalogs under ${prefix} are wired but ${registrar}(app) is not mounted in apps/backend/src/index.ts`);
    }
  }

  // ── NO-REGRESSION: the legacy kinds keep their original create backend ───────────────────────
  for (const [key, backend] of Object.entries(LEGACY_BACKENDS)) {
    const block = blocks[key];
    if (!block) {
      errors.push(`ADDITIVE: legacy create kind "${key}" was removed from the registry`);
      continue;
    }
    if (field(block, "backend") !== backend) {
      errors.push(`NO-REGRESSION: legacy kind "${key}" must stay on the "${backend}" backend (found "${field(block, "backend")}")`);
    }
    if (field(block, "label") !== key) {
      errors.push(
        `NO-REGRESSION: legacy kind "${key}" label must equal the key so the "+ Add new ${key}" string is byte-identical`
      );
    }
  }
  if (!select.includes("InlineCreateDrawer") || !select.includes("QuickCreateEntityModal")) {
    errors.push("ADDITIVE: ReferenceSelect must keep BOTH legacy create backends wired");
  }

  // ── PICKER-LAW: first row INSIDE the dropdown, entity-scoped write ───────────────────────────
  if (!/allowAddNew=\{\{/.test(select)) {
    errors.push('PICKER-LAW: the "+ Create" row must be passed to <Combobox allowAddNew=...> (inside the dropdown, not an external button)');
  }
  if (!/operating_company_id/.test(registry)) {
    errors.push("ENTITY-SCOPE: the config-driven create must send operating_company_id on the write");
  }
  if (!/method:\s*"POST"/.test(registry)) {
    errors.push("CONFIG-DRIVEN: the registry's shared create must actually POST");
  }

  // ── §7 product locks ─────────────────────────────────────────────────────────────────────────
  for (const [name, source] of [["catalogPickerRegistry", registry], ["CatalogQuickCreateDrawer", drawer], ["ReferenceSelect", select]]) {
    const banned = source.match(/\b(?:bg|text|border)-(?:purple|pink|indigo|violet|fuchsia|yellow|amber|blue)-\d{2,3}\b/g);
    if (banned) errors.push(`§7 palette: ${name} uses locked-out colors: ${[...new Set(banned)].join(", ")}`);
  }
  if (!/\+ Create /.test(registry)) {
    errors.push('§7 vocabulary: config-driven catalogs must offer "+ Create ___"');
  }
  if (/\+ New\b/.test(registry) || /\+ New\b/.test(drawer)) {
    errors.push('§7 vocabulary: "+ New" is forbidden — use "+ Create"');
  }

  return errors;
}

// ── selftest ───────────────────────────────────────────────────────────────────────────────────
const GOOD_REGISTRY = `
import { apiRequest } from "../../api/client";
function catalogEntry(entry) {
  return {
    key: entry.key,
    readTable: entry.table,
    writeTable: entry.table,
    readEndpoint: entry.endpoint,
    writeEndpoint: entry.endpoint,
    entityScoped: true,
    evidence: entry.evidence,
    create: catalogCreate(entry.endpoint),
  };
}
function catalogCreate(endpoint) {
  return async (id, values) => apiRequest(endpoint + "?operating_company_id=" + id, { method: "POST", body: values });
}
export const CATALOG_PICKER_CONFIGS = {
${Object.entries(LEGACY_BACKENDS)
  .map(
    ([k, b]) => `  ${k}: {
    key: "${k}",
    label: "${k}",
    backend: "${b}",
    readTable: "x.${k}",
    writeTable: "x.${k}",
    entityScoped: true,
    evidence: "apps/backend/src/whatever.ts:12",
  },`
  )
  .join("\n")}
${Array.from({ length: 10 })
  .map(
    (_, i) => `  cat_${i}: catalogEntry({
    key: "cat_${i}",
    label: "Catalog ${i}",
    table: "catalogs.cat_${i}",
    endpoint: "/api/v1/catalogs/dispatch/cat-${i}",
    evidence: "apps/backend/src/catalogs/dispatch/shared.ts:104,138,204",
  }),`
  )
  .join("\n")}
};
export function catalogAddNewLabel(key) {
  return CATALOG_PICKER_CONFIGS[key].backend === "catalog" ? "+ Create x" : "+ Add new x";
}
`;

const GOOD_SELECT = `
import { Combobox } from "../Combobox";
import { QuickCreateEntityModal } from "../forms/shared/QuickCreateEntityModal";
import { InlineCreateDrawer } from "./InlineCreateDrawer";
import { CatalogQuickCreateDrawer } from "./CatalogQuickCreateDrawer";
import { catalogAddNewLabel, getCatalogPickerConfig } from "./catalogPickerRegistry";
export function ReferenceSelect({ createKind }) {
  const config = getCatalogPickerConfig(createKind);
  const addLabel = catalogAddNewLabel(createKind);
  return (
    <div>
      <Combobox allowAddNew={{ label: addLabel, onAdd: () => setCreateOpen(true) }} />
      {config.backend === "inline-drawer" ? <InlineCreateDrawer /> : config.backend === "quick-create-modal" ? <QuickCreateEntityModal /> : <CatalogQuickCreateDrawer config={config} />}
    </div>
  );
}
`;

const GOOD_DRAWER = `
export function CatalogQuickCreateDrawer({ config, operatingCompanyId }) {
  const fields = config.fields ?? [];
  return <form onSubmit={() => config.create(operatingCompanyId, values)}>{fields.map((f) => f.label)}</form>;
}
`;

const GOOD_BACKEND = `
  await registerDriverCatalogRoutes(app);
  await registerFuelCatalogRoutes(app);
  await registerDispatchCatalogRoutes(app);
`;

function selftest() {
  const p44 = {
    detentionPicker: "const options = rows.map((row) => ({ value: row.id }));",
    bookLoad: 'detention_reason_id: values.detention_reason_id || undefined, pickup_time_type_id: stop.pickup_time_type_id || undefined, catalog_load_type_id: values.catalog_load_type_id || undefined, createKind="load_type", const options = rows.map((row) => ({ value: row.id }));',
    loadRoutes: "detention_reason_id: z.string().uuid().optional(), pickup_time_type_id: z.string().uuid().optional(), catalog_load_type_id: z.string().uuid().optional(),",
    bookService: "detention_expected_y_n, detention_reason_id, detention_expected_hours, time_window_type, pickup_time_type_id, appointment_start_at, catalog_load_type_id = $9::uuid,",
    migration: "FOREIGN KEY (detention_reason_id, operating_company_id)",
    pickupPicker: 'createKind="pickup_time_type"; const options = rows.map((row) => ({ value: row.id }));',
    pickupMigration: "FOREIGN KEY (pickup_time_type_id); enforce_load_stop_pickup_time_type_company",
    loadTypeMigration: "FOREIGN KEY (catalog_load_type_id, operating_company_id)",
    editMapping: 'catalog_load_type_id: str(load.catalog_load_type_id), ["catalog_load_type_id", "catalog_load_type_id",',
    cancellationService: "operating_company_id = $2; reason_code_id: reason.id",
    cancellationMigration: "FOREIGN KEY (reason_code_id, operating_company_id); ALTER COLUMN reason_code_id SET NOT NULL",
  };
  const good = { registry: GOOD_REGISTRY, select: GOOD_SELECT, drawer: GOOD_DRAWER, backendIndex: GOOD_BACKEND, ...p44 };
  const failures = [];

  const clean = contractErrors(good);
  if (clean.length) failures.push(`good fixture must pass, got:\n  - ${clean.join("\n  - ")}`);

  /** Each mutation must be CAUGHT — a selftest that cannot fail is worthless. */
  const mutations = [
    [
      "P44 detention selection falls back to code",
      { ...good, detentionPicker: 'const options = rows.map((row) => ({ value: row.code })); createdValueField="code"' },
      /P44-FK: detention picker/,
    ],
    [
      "the pre-fix hardcoded Set returns",
      { ...good, select: good.select + '\nconst INLINE_KINDS = new Set(["vendor","customer"]);\n' },
      /INLINE_KINDS/,
    ],
    [
      "ReferenceSelect stops consuming the registry",
      { ...good, select: good.select.replace(/getCatalogPickerConfig/g, "hardcodedKind") },
      /getCatalogPickerConfig/,
    ],
    [
      "a wired catalog's create writes a different table than it reads",
      { ...good, registry: good.registry.replace('readTable: "x.vendor",', 'readTable: "mdata.qbo_vendors",') },
      /CLAUSE-5 VIOLATION/,
    ],
    [
      "catalogEntry stops deriving both sides from one table",
      { ...good, registry: good.registry.replace("writeTable: entry.table,", 'writeTable: "catalogs.somewhere_else",') },
      /CLAUSE-5: catalogEntry\(\) must set readTable AND writeTable/,
    ],
    [
      "the batch shrinks below a meaningful size",
      { ...good, registry: good.registry.replace(/ {2}cat_[1-9]: catalogEntry\(\{[\s\S]*?\}\),\n/g, "") },
      /config-driven catalog\(s\) wired/,
    ],
    [
      "a known-broken payment-terms endpoint gets wired",
      { ...good, registry: good.registry.replace("/api/v1/catalogs/dispatch/cat-0", "/api/v1/catalogs/accounting/payment-terms") },
      /REAL-BACKEND: "cat_0" wires/,
    ],
    [
      "maintenance family wired without registrar mount",
      { ...good, registry: good.registry.replace("/api/v1/catalogs/dispatch/cat-1", "/api/v1/catalogs/maintenance/labor-codes") },
      /registerMaintenanceCatalogRoutes\(app\) is not mounted/,
    ],
    [
      "a legacy kind is moved to another backend",
      { ...good, registry: good.registry.replace('backend: "inline-drawer",\n    readTable: "x.vendor"', 'backend: "catalog",\n    readTable: "x.vendor"') },
      /NO-REGRESSION: legacy kind "vendor"/,
    ],
    [
      "a legacy kind is deleted",
      { ...good, registry: good.registry.replace(/ {2}class: \{[\s\S]*?\},\n/, "") },
      /ADDITIVE: legacy create kind "class" was removed/,
    ],
    [
      "the generic drawer grows a per-catalog branch",
      { ...good, drawer: good.drawer + '\nif (kind === "cat_0") return null;\n' },
      /NO-NEW-COMPONENT/,
    ],
    [
      // Plain string replace on purpose. scripts/verify-selftests-can-fail.mjs extracts this
      // function by counting curly braces, so an unbalanced brace anywhere in here — even inside a
      // regex character class or a comment — truncates the body and makes this selftest look
      // fake-green. Keep this mutation regex-free and brace-free.
      'the "+ Create" row moves outside the dropdown',
      { ...good, select: good.select.replace("allowAddNew=", "externalAddButton=") },
      /PICKER-LAW/,
    ],
    [
      "the write drops entity scoping",
      { ...good, registry: good.registry.replace(/operating_company_id/g, "") },
      /ENTITY-SCOPE|operating_company_id/,
    ],
    [
      "the dispatch routes are unmounted behind our back",
      { ...good, backendIndex: good.backendIndex.replace("await registerDispatchCatalogRoutes(app);", "") },
      /REAL-BACKEND: catalogs under \/api\/v1\/catalogs\/dispatch\//,
    ],
    ["the registry file disappears", { ...good, registry: MISSING }, /missing file/],
  ];

  for (const [name, fixture, expected] of mutations) {
    const found = contractErrors(fixture);
    if (!found.some((e) => expected.test(e))) {
      failures.push(`mutation NOT caught: ${name}\n    expected ${expected}\n    got: ${found.join(" | ") || "(no errors)"}`);
    }
  }

  if (failures.length) {
    console.error(`FAIL ${LABEL} --selftest:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`PASS ${LABEL} --selftest — good fixture clean, ${mutations.length}/${mutations.length} mutations caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const errors = contractErrors(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}: ${errors.length} problem(s)\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }
  const blocks = entryBlocks(stripComments(src.registry));
  const total = Object.keys(blocks).length;
  const driven = Object.values(blocks).filter((b) => /catalogEntry\(/.test(b)).length;
  console.log(
    `PASS ${LABEL} — picker is config-driven: ${total} registry entries (${driven} config-driven, ${total - driven} legacy), every entry's inline-create target table equals its read table.`
  );
}
