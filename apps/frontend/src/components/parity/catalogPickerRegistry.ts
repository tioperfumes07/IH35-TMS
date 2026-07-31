/**
 * LST-PICKER-01/03 — the per-catalog picker CONFIG REGISTRY.
 *
 * THE DEFECT THIS REPLACES
 * ------------------------
 * The shared picker capability (ReferenceSelect) already documented the 7-clause picker law and was
 * adopted by ~42 call sites, but its create kinds were a HARDCODED UNION OF SIX
 * (`QuickCreateKind = "vendor" | "customer" | "item" | "category" | "part" | "class"`) dispatched to
 * two FORKED backends by a hardcoded `INLINE_KINDS` Set. A catalog outside those six could not have
 * inline create at all without someone authoring a brand-new form component — so ~68 of 75 catalogs
 * had no "+ Create" row in their consuming picker.
 *
 * Adding a catalog is now a CONFIG ENTRY in this file. No new component, no new Set member, no edit
 * to ReferenceSelect.
 *
 * VERIFY-2 CLAUSE 5 IS THE HARD RULE
 * ----------------------------------
 * Inline create MUST write the SAME canonical table the picker READS, or the created row vanishes on
 * reload. Every entry therefore declares `readTable` / `writeTable` / `readEndpoint` / `writeEndpoint`
 * plus the backend `evidence` (file:line) that proves it. For `backend: "catalog"` entries the two
 * endpoints are the SAME REST collection served by one route factory that interpolates a single
 * `config.tableName` into both the list SELECT and the create INSERT — read/write parity holds by
 * construction, not by hope. `scripts/verify-lst-picker-config-driven.mjs` fails the build if any
 * catalog-backed entry ever declares divergent tables or endpoints.
 *
 * ZERO BEHAVIOUR CHANGE FOR THE ORIGINAL SIX
 * ------------------------------------------
 * vendor / customer / account / service keep routing to InlineCreateDrawer; item / category / part /
 * class keep routing to QuickCreateEntityModal; their "+ Add new ___" default label is unchanged
 * (explicitly the allowed inline mini-create form per scripts/verify-create-vocab-section7.mjs:39).
 * Only the DISPATCH mechanism moved from a hardcoded Set into `backend` on the config.
 */
import { apiRequest } from "../../api/client";

/**
 * Which create surface a key renders.
 *  - "inline-drawer"      → InlineCreateDrawer (rich BK7 forms; account commit is financial-gated)
 *  - "quick-create-modal" → QuickCreateEntityModal (ParityDrawer shell, bespoke per-kind fields)
 *  - "catalog"            → CatalogQuickCreateDrawer, driven ENTIRELY by `fields` + `create` below.
 *                           This is the config-driven path: new catalogs use it and add NO component.
 */
export type CatalogPickerBackend = "inline-drawer" | "quick-create-modal" | "catalog";

export type CatalogCreateField = {
  name: "display_name" | "code" | "description";
  label: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  help?: string;
  multiline?: boolean;
};

export type CatalogCreateResult = {
  id: string;
  label: string;
  /** Catalog `code` column. Pickers whose option value IS the code select on this instead of `id`. */
  code?: string;
};

export type CatalogPickerConfig = {
  /** The `createKind` a caller passes to <ReferenceSelect>. */
  key: string;
  /** Singular human noun. Drives the dropdown's first row and the create drawer title. */
  label: string;
  backend: CatalogPickerBackend;
  /** Canonical schema-qualified table the picker READS. */
  readTable: string;
  /** Canonical schema-qualified table inline create WRITES. VERIFY-2 cl.5: MUST equal readTable. */
  writeTable: string;
  /** REST collection the picker lists from. */
  readEndpoint: string;
  /** REST collection inline create POSTs to. Same collection ⇒ same table, by construction. */
  writeEndpoint: string;
  /** Every catalog here is entity-scoped: operating_company_id is required on read AND on write. */
  entityScoped: true;
  /**
   * "same-endpoint-verified" — one route factory interpolates one tableName into SELECT and INSERT.
   * "legacy-bespoke-form"    — pre-existing hand-written create form; table recorded for the record.
   */
  readWriteParity: "same-endpoint-verified" | "legacy-bespoke-form";
  /** Backend file:line proving the read table equals the write table. Never a bare assertion. */
  evidence: string;
  /** Only for backend "catalog": the fields the generic drawer renders. */
  fields?: readonly CatalogCreateField[];
  /** Only for backend "catalog": the POST. Entity id is always the first argument. */
  create?: (operatingCompanyId: string, values: CatalogCreateValues) => Promise<CatalogCreateResult>;
};

export type CatalogCreateValues = {
  display_name: string;
  code?: string;
  description?: string;
  /** Optional extras for catalogs whose create requires more than name/code (e.g. event_type). */
  event_type?: string;
  severity?: string;
};

/**
 * Catalog `code` columns are constrained to /^[A-Z][A-Z0-9-]+$/ by every route factory
 * (e.g. apps/backend/src/catalogs/dispatch/shared.ts:40). Derive a compliant code from the display
 * name when the operator does not type one, so a quick inline create never 400s on a format rule the
 * operator was never shown.
 */
export function deriveCatalogCode(displayName: string, explicit?: string): string {
  const source = (explicit ?? "").trim() || displayName;
  let code = source
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  if (!/^[A-Z]/.test(code)) code = `C-${code}`.slice(0, 24);
  code = code.replace(/-+$/g, "");
  if (code.length < 2) code = "CATALOG";
  return code;
}

const CATALOG_FIELDS: readonly CatalogCreateField[] = [
  { name: "display_name", label: "Name", required: true, maxLength: 160 },
  {
    name: "code",
    label: "Code",
    maxLength: 24,
    placeholder: "Auto-derived from the name",
    help: "Uppercase letters, digits and hyphens. Leave blank to derive it from the name.",
  },
  { name: "description", label: "Description", maxLength: 500, multiline: true },
];

/**
 * The ONE create call every config-driven catalog uses.
 *
 * It POSTs to the config's `endpoint` — the SAME collection the picker lists from — because every
 * per-entity catalog route factory (dispatch/shared.ts:192, driver/factory.ts:134, fuel/factory.ts:134)
 * exposes the identical contract: POST {basePath}?operating_company_id=… with {code, display_name,
 * description?}. Going through the endpoint string rather than a per-catalog client singleton is what
 * makes "add a catalog = add a config entry" literally true, and keeps this registry from importing
 * every catalog API module just to reach a `.create`.
 */
function catalogCreate(endpoint: string) {
  return async (operatingCompanyId: string, values: CatalogCreateValues): Promise<CatalogCreateResult> => {
    const code = deriveCatalogCode(values.display_name, values.code);
    const displayName = values.display_name.trim();
    // Entity scoping is not optional: the route 400s without it, and an unscoped catalog row would
    // leak across TRANSP / TRK / USMCA.
    const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
    const created = await apiRequest<{ id: string; code?: string }>(`${endpoint}?${query.toString()}`, {
      method: "POST",
      body: {
        code,
        display_name: displayName,
        description: values.description?.trim() || undefined,
      },
    });
    return { id: String(created.id), label: displayName, code: created.code ?? code };
  };
}

function catalogEntry(entry: {
  key: string;
  label: string;
  table: string;
  endpoint: string;
  evidence: string;
}): CatalogPickerConfig {
  // Read table === write table and read endpoint === write endpoint, expressed ONCE so the two can
  // never drift apart in a later edit. This is VERIFY-2 clause 5 enforced structurally.
  return {
    key: entry.key,
    label: entry.label,
    backend: "catalog",
    readTable: entry.table,
    writeTable: entry.table,
    readEndpoint: entry.endpoint,
    writeEndpoint: entry.endpoint,
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence: entry.evidence,
    fields: CATALOG_FIELDS,
    create: catalogCreate(entry.endpoint),
  };
}

/**
 * THE REGISTRY. One entry per catalog. Adding a catalog is adding an object here.
 *
 * NOT wired on purpose (each is a real finding, reported in the PR body rather than papered over):
 *  - /api/v1/catalogs/fleet/*        — POST/PATCH emit invalid SQL: the RETURNING list at
 *    apps/backend/src/catalogs/fleet/factory.ts:198 (also :206, :282) ends in a `--` comment that
 *    swallows the rest of the line, leaving a trailing comma → 42601. Every fleet create 500s today.
 *  - /api/v1/catalogs/maintenance/*  — registerMaintenanceCatalogRoutes is defined at
 *    apps/backend/src/catalogs/maintenance/index.ts:4 and NEVER mounted in apps/backend/src/index.ts
 *    → every maintenance catalog create 404s.
 *  - /api/v1/catalogs/accounting/payment-terms — codeColumn and nameColumn are BOTH "terms_name"
 *    (apps/backend/src/catalogs/accounting/index.ts:100-101) → INSERT names the column twice → 42701.
 *  - /api/v1/catalogs/safety/* (except civil_fine_types + complaint_types + company_violation_types + dot_violation_types wired below) — remaining
 *    safety catalogs use bespoke column names (type_code/type_name, reason_code/reason_name,
 *    violation_code/display_name). civil_fine_types matches {code, display_name}; complaint_types
 *    uses a per-catalog create map.
 *  - /api/v1/catalogs/driver/{license-classes,endorsements,restrictions,...} — FIXED by SWEEP-C11
 *    (2026-07-25): this surface's POST/PATCH/DELETE now return 410 (writesBlocked, factory.ts) —
 *    it can no longer diverge from the canonical /api/v1/lists/drivers/* (reference.*) surface.
 *    Still not wired here on purpose: it's a read-only archive now, not a pickable create target.
 *  - /api/v1/accounting/categories   — reads mdata.qbo_accounts, creates into catalogs.* (clause-5
 *    violation). Out of scope here; another PR owns it.
 *  - /api/v1/catalogs/driver/escrow-types — endpoint is healthy, but escrow is financial-cluster and
 *    this lane is frontend-only. Deliberately deferred to an owner-gated block.
 */
export const CATALOG_PICKER_CONFIGS = {
  // ── The original six, unchanged. Only the DISPATCH moved out of a hardcoded Set. ──────────────
  vendor: {
    key: "vendor",
    label: "vendor",
    backend: "inline-drawer",
    readTable: "mdata.vendors",
    writeTable: "mdata.vendors",
    readEndpoint: "/api/v1/mdata/vendors",
    writeEndpoint: "/api/v1/mdata/vendors",
    entityScoped: true,
    readWriteParity: "legacy-bespoke-form",
    evidence: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx:149-162 (QB-STD-5 canonical fix)",
  },


  customer: {
    key: "customer",
    label: "customer",
    backend: "inline-drawer",
    readTable: "mdata.customers",
    writeTable: "mdata.customers",
    readEndpoint: "/api/v1/mdata/customers",
    writeEndpoint: "/api/v1/mdata/customers",
    entityScoped: true,
    readWriteParity: "legacy-bespoke-form",
    evidence: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx:164-173 (D1-1)",
  },


  account: {
    key: "account",
    label: "account",
    backend: "inline-drawer",
    readTable: "catalogs.accounts",
    writeTable: "catalogs.accounts",
    readEndpoint: "/api/v1/catalogs/accounts",
    writeEndpoint: "/api/v1/catalogs/accounting/chart-of-accounts",
    entityScoped: true,
    readWriteParity: "legacy-bespoke-form",
    evidence: "apps/backend/src/catalogs/accounting/index.ts:17 (tableName catalogs.accounts) — create commit is FINANCIAL-GATED in NewAccountDrawerForm",
  },


  // NOTE: every legacy `label` is byte-identical to its key so `catalogAddNewLabel` reproduces the
  // previous `+ Add new ${createKind}` string exactly. Do not "improve" these — the six must not move.
  service: {
    key: "service",
    label: "service",
    backend: "inline-drawer",
    readTable: "catalogs.items",
    writeTable: "catalogs.items",
    readEndpoint: "/api/v1/catalogs/accounting/items",
    writeEndpoint: "/api/v1/catalogs/accounting/items",
    entityScoped: true,
    readWriteParity: "legacy-bespoke-form",
    evidence: "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx:5 (QB-STD-5) + apps/backend/src/catalogs/accounting/index.ts:145",
  },


  item: {
    key: "item",
    label: "item",
    backend: "quick-create-modal",
    readTable: "catalogs.items",
    writeTable: "catalogs.items",
    readEndpoint: "/api/v1/catalogs/accounting/items",
    writeEndpoint: "/api/v1/catalogs/accounting/items",
    entityScoped: true,
    readWriteParity: "legacy-bespoke-form",
    evidence: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx:174-203 (QB-STD-5)",
  },


  category: {
    key: "category",
    label: "category",
    backend: "quick-create-modal",
    readTable: "catalogs.accounts",
    writeTable: "catalogs.accounts",
    readEndpoint: "/api/v1/catalogs/accounts",
    writeEndpoint: "/api/v1/catalogs/accounting/chart-of-accounts",
    entityScoped: true,
    readWriteParity: "legacy-bespoke-form",
    evidence: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx:204-225 (FIX-02)",
  },


  class: {
    key: "class",
    label: "class",
    backend: "quick-create-modal",
    readTable: "catalogs.classes",
    writeTable: "catalogs.classes",
    readEndpoint: "/api/v1/catalogs/accounting/classes",
    writeEndpoint: "/api/v1/catalogs/accounting/classes",
    entityScoped: true,
    readWriteParity: "legacy-bespoke-form",
    evidence: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx:226-239 (QB-STD-5)",
  },


  part: {
    key: "part",
    label: "part",
    backend: "quick-create-modal",
    readTable: "maintenance.parts_inventory",
    writeTable: "maintenance.parts_inventory",
    readEndpoint: "/api/v1/maintenance/parts-inventory",
    writeEndpoint: "/api/v1/maintenance/parts-inventory/purchases",
    entityScoped: true,
    readWriteParity: "legacy-bespoke-form",
    evidence: "apps/backend/src/maintenance/parts-inventory.routes.ts:44 (SELECT) and :63 (INSERT) — both maintenance.parts_inventory",
  },



  // ── Batch 1, config-driven. Every one verified: one route factory, one tableName, SELECT+INSERT. ──
  // Dispatch — apps/backend/src/catalogs/dispatch/shared.ts:104 builds `catalogs.${tableName}` once
  // and uses it for the list SELECT (:138) and the create INSERT (:204).
  // LST-WIRE-04 — vendor types. The vendor create form used a FROZEN TypeScript union of eight
  // values while catalogs.vendor_types sat seeded and unread, so a type could be picked but never
  // added, renamed or retired. This entry gives the picker its canonical table plus the inline
  // "+ Add new vendor type" row, per entity.
  vendor_type: catalogEntry({
    key: "vendor_type",
    label: "Vendor type",
    table: "catalogs.vendor_types",
    endpoint: "/api/v1/catalogs/vendors/vendor-types",
    evidence: "apps/backend/src/catalogs/generic-catalog.factory.ts:143 (SELECT) and :188 (INSERT) — both catalogs.${config.tableName} from vendorTypesCatalogConfig",
  }),


  load_type: catalogEntry({
    key: "load_type",
    label: "Load type",
    table: "catalogs.load_types",
    endpoint: "/api/v1/catalogs/dispatch/load-types",
    evidence: "apps/backend/src/catalogs/dispatch/shared.ts:104,138,204 — one tableName, SELECT and INSERT",
  }),


  detention_reason: catalogEntry({
    key: "detention_reason",
    label: "Detention reason",
    table: "catalogs.detention_reasons",
    endpoint: "/api/v1/catalogs/dispatch/detention-reasons",
    evidence: "apps/backend/src/catalogs/dispatch/shared.ts:104,138,204 — one tableName, SELECT and INSERT",
  }),


  pickup_time_type: catalogEntry({
    key: "pickup_time_type",
    label: "Pickup time type",
    table: "catalogs.pickup_time_types",
    endpoint: "/api/v1/catalogs/dispatch/pickup-time-types",
    evidence: "apps/backend/src/catalogs/dispatch/shared.ts:104,138,204 — one tableName, SELECT and INSERT",
  }),


  additional_charge: catalogEntry({
    key: "additional_charge",
    label: "Accessorial charge",
    table: "catalogs.additional_charges",
    endpoint: "/api/v1/catalogs/dispatch/additional-charges",
    evidence: "apps/backend/src/catalogs/dispatch/shared.ts:104,138,204 — one tableName, SELECT and INSERT",
  }),



  // Load cancellation reasons — bespoke POST body (reason_code + required category), same canonical
  // table the Cancel Load dropdown reads via GET /api/v1/dispatch/cancellation-reasons.
  // VERIFY-2 cl.5: write = catalogs.load_cancellation_reasons (routes.ts INSERT :135) = list SELECT :224.
  // Category defaults to "other" on inline create; Lists → Load Cancellation Reasons edits it later.
  load_cancellation_reason: {
    key: "load_cancellation_reason",
    label: "cancellation reason",
    backend: "catalog",
    readTable: "catalogs.load_cancellation_reasons",
    writeTable: "catalogs.load_cancellation_reasons",
    readEndpoint: "/api/v1/catalogs/load-cancellation-reasons",
    writeEndpoint: "/api/v1/catalogs/load-cancellation-reasons",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/catalogs/load-cancellation-reasons.routes.ts:112 (SELECT) and :135 (INSERT) — both catalogs.load_cancellation_reasons; cancel picker list at dispatch/cancellation.service.ts:224",
    fields: CATALOG_FIELDS,
    create: async (operatingCompanyId, values) => {
      const displayName = values.display_name.trim();
      // Backend regex is /^[A-Z][A-Z0-9_]+$/ (underscores, not hyphens).
      const source = (values.code ?? "").trim() || displayName;
      let reasonCode = source
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
      if (!/^[A-Z]/.test(reasonCode)) reasonCode = `C_${reasonCode}`.slice(0, 80);
      reasonCode = reasonCode.replace(/_+$/g, "");
      if (reasonCode.length < 2) reasonCode = "OTHER";
      const created = await apiRequest<{
        reason: { id: string; reason_code: string; display_name: string };
      }>("/api/v1/catalogs/load-cancellation-reasons", {
        method: "POST",
        body: {
          operating_company_id: operatingCompanyId,
          reason_code: reasonCode,
          display_name: displayName,
          category: "other",
          description: values.description?.trim() || undefined,
        },
      });
      return {
        id: String(created.reason.id),
        label: created.reason.display_name,
        code: created.reason.reason_code,
      };
    },
  },



  // Driver — apps/backend/src/catalogs/driver/factory.ts: SELECT :94 and INSERT :172 both
  // `catalogs.${config.tableName}`. escrow-types deliberately excluded (financial cluster).
  pay_rate_template: catalogEntry({
    key: "pay_rate_template",
    label: "Pay rate template",
    table: "catalogs.pay_rate_templates",
    endpoint: "/api/v1/catalogs/driver/pay-rate-templates",
    evidence: "apps/backend/src/catalogs/driver/factory.ts:94,172 + driver/index.ts:6 tableName pay_rate_templates",
  }),


  driver_deduction_type: catalogEntry({
    key: "driver_deduction_type",
    label: "Driver deduction type",
    table: "catalogs.driver_deduction_types",
    endpoint: "/api/v1/catalogs/driver/deduction-types",
    evidence: "apps/backend/src/catalogs/driver/factory.ts:94,172 + driver/index.ts:14 tableName driver_deduction_types",
  }),


  // Escrow forfeit draw reasons — same table as driver_deduction_types, but create MUST set
  // may_draw_escrow=true so the new row appears in EscrowForfeitModal's filtered picker.
  escrow_draw_reason: {
    key: "escrow_draw_reason",
    label: "escrow draw reason",
    backend: "catalog",
    readTable: "catalogs.driver_deduction_types",
    writeTable: "catalogs.driver_deduction_types",
    readEndpoint: "/api/v1/catalogs/driver/deduction-types",
    writeEndpoint: "/api/v1/catalogs/driver/deduction-types",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/catalogs/driver/factory.ts SELECT+INSERT catalogs.driver_deduction_types (optionalBooleans may_draw_escrow); EscrowForfeitModal filtered consumer",
    fields: CATALOG_FIELDS,
    create: async (operatingCompanyId, values) => {
      const displayName = values.display_name.trim();
      const code = deriveCatalogCode(displayName, values.code);
      const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
      const created = await apiRequest<{ id: string; code?: string; display_name?: string }>(
        `/api/v1/catalogs/driver/deduction-types?${query.toString()}`,
        {
          method: "POST",
          body: {
            code,
            display_name: displayName,
            description: values.description?.trim() || undefined,
            may_draw_escrow: true,
            is_active: true,
            sort_order: 0,
          },
        }
      );
      return {
        id: String(created.id),
        label: created.display_name ?? displayName,
        code: created.code ?? code,
      };
    },
  },


  driver_pay_type: catalogEntry({
    key: "driver_pay_type",
    label: "Driver pay type",
    table: "catalogs.driver_pay_types",
    endpoint: "/api/v1/catalogs/driver/pay-types",
    evidence: "apps/backend/src/catalogs/driver/factory.ts:94,172 + driver/index.ts:22 tableName driver_pay_types",
  }),



  // Fuel — apps/backend/src/catalogs/fuel/factory.ts: SELECT :83 and INSERT :159 both
  // `catalogs.${config.tableName}`.
  fuel_card_type: catalogEntry({
    key: "fuel_card_type",
    label: "Fuel card type",
    table: "catalogs.fuel_card_types",
    endpoint: "/api/v1/catalogs/fuel/card-types",
    evidence: "apps/backend/src/catalogs/fuel/factory.ts:83,159 + fuel/index.ts:6 tableName fuel_card_types",
  }),


  fuel_exception_type: catalogEntry({
    key: "fuel_exception_type",
    label: "Fuel exception type",
    table: "catalogs.fuel_exception_types",
    endpoint: "/api/v1/catalogs/fuel/exception-types",
    evidence: "apps/backend/src/catalogs/fuel/factory.ts:83,159 + fuel/index.ts:14 tableName fuel_exception_types",
  }),


  fuel_station_brand: catalogEntry({
    key: "fuel_station_brand",
    label: "Fuel station brand",
    table: "catalogs.fuel_station_brands",
    endpoint: "/api/v1/catalogs/fuel/station-brands",
    evidence: "apps/backend/src/catalogs/fuel/factory.ts:83,159 + fuel/index.ts:22 tableName fuel_station_brands",
  }),



  // Civil fine types — FineCreateModal previously used Combobox allowAddNew with an external mutate
  // (not ReferenceSelect / CatalogQuickCreateDrawer). POST body matches generic {code, display_name}.
  civil_fine_type: catalogEntry({
    key: "civil_fine_type",
    label: "civil fine type",
    table: "catalogs.civil_fine_types",
    endpoint: "/api/v1/catalogs/safety/civil-fine-types",
    evidence:
      "apps/backend/src/catalogs/safety/civil-fine-types.routes.ts:28 (SELECT) and :110 (INSERT) — both catalogs.civil_fine_types; FineCreateModal catalogs-safety list consumer",
  }),



// Complaint types — ComplaintsTab had SelectCombobox with Lists-only management (no inline create).
  // Options keyed by type_code (createdValueField=code); v6.4 complaints store type_code, not UUID.
  complaint_type: {
    key: "complaint_type",
    label: "complaint type",
    backend: "catalog",
    readTable: "catalogs.complaint_types",
    writeTable: "catalogs.complaint_types",
    readEndpoint: "/api/v1/catalogs/safety/complaint-types",
    writeEndpoint: "/api/v1/catalogs/safety/complaint-types",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/catalogs/safety/complaint-types.routes.ts SELECT+INSERT catalogs.complaint_types; ComplaintsTab catalogs-safety list consumer",
    fields: CATALOG_FIELDS,
    create: async (operatingCompanyId, values) => {
      const typeName = values.display_name.trim();
      const typeCode = deriveCatalogCode(typeName, values.code);
      const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
      const created = await apiRequest<{
        id: string;
        type_code?: string;
        type_name?: string;
      }>(`/api/v1/catalogs/safety/complaint-types?${query.toString()}`, {
        method: "POST",
        body: {
          type_code: typeCode,
          type_name: typeName,
          default_severity: null,
          is_active: true,
        },
      });
      return {
        id: String(created.id),
        label: created.type_name ?? typeName,
        code: created.type_code ?? typeCode,
      };
    },
  },



  // DOT violation types — HOSViolationsTab had Combobox with NO inline create (Lists-only).
  // Options keyed by violation_code; create defaults basic_category=hours_of_service so the row
  // appears in the HOS-filtered picker list.
  dot_violation_type: {
    key: "dot_violation_type",
    label: "DOT violation type",
    backend: "catalog",
    readTable: "catalogs.dot_violation_types",
    writeTable: "catalogs.dot_violation_types",
    readEndpoint: "/api/v1/catalogs/safety/dot-violation-types",
    writeEndpoint: "/api/v1/catalogs/safety/dot-violation-types",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/catalogs/safety/dot-violation-types.routes.ts SELECT+INSERT catalogs.dot_violation_types; HOSViolationsTab + HosViolationCreateModal catalogs-safety list consumers",
    fields: CATALOG_FIELDS,
    create: async (operatingCompanyId, values) => {
      const displayName = values.display_name.trim();
      // Schema: /^[A-Z0-9][A-Z0-9.-]*$/ — deriveCatalogCode is hyphen-safe and matches.
      const violationCode = deriveCatalogCode(displayName, values.code);
      const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
      const created = await apiRequest<{
        id: string;
        violation_code?: string;
        display_name?: string;
      }>(`/api/v1/catalogs/safety/dot-violation-types?${query.toString()}`, {
        method: "POST",
        body: {
          violation_code: violationCode,
          display_name: displayName,
          description: values.description?.trim() || null,
          basic_category: "hours_of_service",
          is_active: true,
          sort_order: 0,
        },
      });
      return {
        id: String(created.id),
        label: created.display_name ?? displayName,
        code: created.violation_code ?? violationCode,
      };
    },
  },



  // Company violation types — CompanyViolationCreateModal used Combobox allowAddNew + external
  // mini-form (not ReferenceSelect first-row). POST uses type_code/type_name/default_severity.
  company_violation_type: {
    key: "company_violation_type",
    label: "company violation type",
    backend: "catalog",
    readTable: "catalogs.company_violation_types",
    writeTable: "catalogs.company_violation_types",
    readEndpoint: "/api/v1/catalogs/safety/company-violation-types",
    writeEndpoint: "/api/v1/catalogs/safety/company-violation-types",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/catalogs/safety/company-violation-types.routes.ts:26 (SELECT) and :110 (INSERT) — both catalogs.company_violation_types",
    fields: CATALOG_FIELDS,
    create: async (operatingCompanyId, values) => {
      const typeName = values.display_name.trim();
      const typeCode = deriveCatalogCode(typeName, values.code);
      const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
      const created = await apiRequest<{ id: string; type_code?: string; type_name?: string }>(
        `/api/v1/catalogs/safety/company-violation-types?${query.toString()}`,
        {
          method: "POST",
          body: {
            type_code: typeCode,
            type_name: typeName,
            // Backend requires 1–10; inline create defaults to 1 (operator can edit on Lists later).
            default_severity: 1,
            amount_cents: null,
            is_active: true,
          },
        }
      );
      return {
        id: String(created.id),
        label: `${created.type_code ?? typeCode} — ${created.type_name ?? typeName}`,
        code: created.type_code ?? typeCode,
      };
    },
  },



  // Cargo claim reasons — CargoClaimIntakeSurface used a bare <select> with NO inline create.
  // Options keyed by reason_code (createdValueField=code); claim stores claim_reason_code.
  cargo_claim_reason: {
    key: "cargo_claim_reason",
    label: "claim reason",
    backend: "catalog",
    readTable: "catalogs.cargo_claim_reasons",
    writeTable: "catalogs.cargo_claim_reasons",
    readEndpoint: "/api/v1/catalogs/safety/cargo-claim-reasons",
    writeEndpoint: "/api/v1/catalogs/safety/cargo-claim-reasons",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/catalogs/safety/cargo-claim-reasons.routes.ts SELECT+INSERT catalogs.cargo_claim_reasons; CargoClaimIntakeSurface catalogs-safety list consumer",
    fields: CATALOG_FIELDS,
    create: async (operatingCompanyId, values) => {
      const displayName = values.display_name.trim();
      const reasonCode = deriveCatalogCode(displayName, values.code);
      const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
      const created = await apiRequest<{
        id: string;
        reason_code?: string;
        display_name?: string;
      }>(`/api/v1/catalogs/safety/cargo-claim-reasons?${query.toString()}`, {
        method: "POST",
        body: {
          reason_code: reasonCode,
          display_name: displayName,
          description: values.description?.trim() || null,
          claim_category: "other",
          is_active: true,
          sort_order: 0,
        },
      });
      return {
        id: String(created.id),
        label: created.display_name ?? displayName,
        code: created.reason_code ?? reasonCode,
      };
    },
  },



  // Internal fine reasons — InternalFinesPage used SelectCombobox sentinel + external Modal
  // (not ReferenceSelect / CatalogQuickCreateDrawer). Options keyed by UUID (reason_uuid).
  // default_amount is required (cents); inline create defaults to 100 ($1.00) — edit on Lists for
  // the real default (same pattern as company_violation default_severity=1).
  internal_fine_reason: {
    key: "internal_fine_reason",
    label: "fine reason",
    backend: "catalog",
    readTable: "catalogs.internal_fine_reasons",
    writeTable: "catalogs.internal_fine_reasons",
    readEndpoint: "/api/v1/catalogs/safety/internal-fine-reasons",
    writeEndpoint: "/api/v1/catalogs/safety/internal-fine-reasons",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/catalogs/safety/internal-fine-reasons.routes.ts SELECT+INSERT catalogs.internal_fine_reasons; InternalFinesPage catalogs-safety list consumer",
    fields: CATALOG_FIELDS,
    create: async (operatingCompanyId, values) => {
      const reasonName = values.display_name.trim();
      const reasonCode = deriveCatalogCode(reasonName, values.code);
      const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
      const created = await apiRequest<{
        id: string;
        reason_code?: string;
        reason_name?: string;
        default_amount?: number;
      }>(`/api/v1/catalogs/safety/internal-fine-reasons?${query.toString()}`, {
        method: "POST",
        body: {
          reason_code: reasonCode,
          reason_name: reasonName,
          // API expects cents (converted to numeric dollars on INSERT).
          default_amount: 100,
          is_active: true,
        },
      });
      return {
        id: String(created.id),
        label: created.reason_name ?? reasonName,
        code: created.reason_code ?? reasonCode,
      };
    },
  },



  // Dispatcher error reasons — UserDetail previously toasted "Add reason in catalog" (fake +Add).
  // Write path: generic factory POST /api/v1/catalogs/dispatch/dispatcher-error-reasons (entityScoped).
  // label column (not display_name); event_type+severity required — passed via createExtras from the form.
  dispatcher_error_reason: {
    key: "dispatcher_error_reason",
    label: "error reason",
    backend: "catalog",
    readTable: "catalogs.dispatcher_error_reasons",
    writeTable: "catalogs.dispatcher_error_reasons",
    readEndpoint: "/api/v1/catalogs/dispatch/dispatcher-error-reasons",
    writeEndpoint: "/api/v1/catalogs/dispatch/dispatcher-error-reasons",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/catalogs/generic-catalog.factory.ts entityScoped INSERT + routes.ts dispatchErrorReasonsCatalogConfig; picker list apps/backend/src/mdata/dispatcher-safety-events.routes.ts GET catalogs/dispatcher-error-reasons",
    fields: CATALOG_FIELDS,
    create: async (operatingCompanyId, values) => {
      const label = values.display_name.trim();
      const code = deriveCatalogCode(label, values.code).replace(/-/g, "_");
      const eventType = (values.event_type ?? "other").trim();
      const severity = (values.severity ?? "warning").trim();
      const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
      const created = await apiRequest<{ id: string; code?: string; label?: string; display_name?: string }>(
        `/api/v1/catalogs/dispatch/dispatcher-error-reasons?${query.toString()}`,
        {
          method: "POST",
          body: {
            code,
            label,
            event_type: eventType,
            severity,
            description: values.description?.trim() || undefined,
          },
        }
      );
      return {
        id: String(created.id),
        label: created.label ?? created.display_name ?? label,
        code: created.code ?? code,
      };
    },
  },



  // Customer quality event reasons — CustomerDetail Reason Combobox had no inline create at all.
  // Same factory surface as LST-A-01 Lists hub: POST /api/v1/catalogs/customers/customer-quality-event-reasons.
  customer_quality_event_reason: {
    key: "customer_quality_event_reason",
    label: "quality reason",
    backend: "catalog",
    readTable: "catalogs.customer_quality_event_reasons",
    writeTable: "catalogs.customer_quality_event_reasons",
    readEndpoint: "/api/v1/catalogs/customers/customer-quality-event-reasons",
    writeEndpoint: "/api/v1/catalogs/customers/customer-quality-event-reasons",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/catalogs/generic-catalog.factory.ts entityScoped INSERT + routes.ts customerQualityEventReasonsCatalogConfig",
    fields: CATALOG_FIELDS,
    create: async (operatingCompanyId, values) => {
      const label = values.display_name.trim();
      const code = deriveCatalogCode(label, values.code).replace(/-/g, "_");
      const eventType = (values.event_type ?? "other").trim();
      const severity = (values.severity ?? "warning").trim();
      const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
      const created = await apiRequest<{ id: string; code?: string; label?: string; display_name?: string }>(
        `/api/v1/catalogs/customers/customer-quality-event-reasons?${query.toString()}`,
        {
          method: "POST",
          body: {
            code,
            label,
            event_type: eventType,
            severity,
            description: values.description?.trim() || undefined,
          },
        }
      );
      return {
        id: String(created.id),
        label: created.label ?? created.display_name ?? label,
        code: created.code ?? code,
      };
    },
  },



  // Driver termination reasons — DriverDetail + TerminateConfirmModal previously toasted
  // "Add reason in catalog" or used a bare Combobox with no inline create.
  // POST /api/v1/catalogs/driver-termination-reasons requires code, label, severity (owner-only).
  driver_termination_reason: {
    key: "driver_termination_reason",
    label: "termination reason",
    backend: "catalog",
    readTable: "catalogs.driver_termination_reasons",
    writeTable: "catalogs.driver_termination_reasons",
    readEndpoint: "/api/v1/catalogs/driver-termination-reasons",
    writeEndpoint: "/api/v1/catalogs/driver-termination-reasons",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/mdata/driver-safety-events.routes.ts SELECT+INSERT catalogs.driver_termination_reasons; DriverDetail safety-event picker consumer",
    fields: CATALOG_FIELDS,
    create: async (operatingCompanyId, values) => {
      const label = values.display_name.trim();
      const code = deriveCatalogCode(label, values.code).replace(/-/g, "_");
      const severity = (values.severity ?? "warning").trim();
      const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
      const created = await apiRequest<{ id: string; code?: string; label?: string }>(
        `/api/v1/catalogs/driver-termination-reasons?${query.toString()}`,
        {
          method: "POST",
          body: {
            code,
            label,
            severity,
            description: values.description?.trim() || undefined,
          },
        }
      );
      return {
        id: String(created.id),
        label: created.label ?? label,
        code: created.code ?? code,
      };
    },
  },



  // Payment terms — customer/vendor profile pickers used Combobox or SelectCombobox with no inline
  // create (CustomerProfileForm had an external mini-form). POST body is terms_name + days_until_due
  // on the healthy /api/v1/catalogs/payment-terms route (NOT accounting/payment-terms → 42701).
  payment_term: {
    key: "payment_term",
    label: "payment term",
    backend: "catalog",
    readTable: "catalogs.payment_terms",
    writeTable: "catalogs.payment_terms",
    readEndpoint: "/api/v1/catalogs/payment-terms",
    writeEndpoint: "/api/v1/catalogs/payment-terms",
    entityScoped: true,
    readWriteParity: "same-endpoint-verified",
    evidence:
      "apps/backend/src/catalogs/payment-terms.routes.ts:127 (SELECT) and :154 (INSERT) — both catalogs.payment_terms; mdata payment-term options consumer",
    fields: [
      { name: "display_name", label: "Terms name", required: true, maxLength: 200, placeholder: "Net 30" },
      {
        name: "days_until_due",
        label: "Days until due",
        required: true,
        inputType: "number",
        placeholder: "30",
        help: "Number of days until payment is due (0 = due on receipt).",
      },
    ],
    create: async (operatingCompanyId, values) => {
      const termsName = values.display_name.trim();
      const daysRaw = values.days_until_due ?? 30;
      const daysUntilDue = Number(daysRaw);
      if (Number.isNaN(daysUntilDue) || daysUntilDue < 0) {
        throw new Error("Days until due must be a non-negative number.");
      }
      const created = await apiRequest<{
        id: string;
        terms_name?: string;
        days_until_due?: number;
      }>("/api/v1/catalogs/payment-terms", {
        method: "POST",
        body: {
          operating_company_id: operatingCompanyId,
          terms_name: termsName,
          days_until_due: daysUntilDue,
        },
      });
      const days = created.days_until_due ?? daysUntilDue;
      const name = created.terms_name ?? termsName;
      return {
        id: String(created.id),
        label: `${name} (${days}d)`,
      };
    },
  },

} as const satisfies Record<string, CatalogPickerConfig>;

/** Every create kind <ReferenceSelect> accepts — derived from the config, never hand-maintained. */
export type CatalogPickerKey = keyof typeof CATALOG_PICKER_CONFIGS;

export const CATALOG_PICKER_KEYS = Object.keys(CATALOG_PICKER_CONFIGS) as CatalogPickerKey[];

export function getCatalogPickerConfig(key: CatalogPickerKey): CatalogPickerConfig {
  return CATALOG_PICKER_CONFIGS[key];
}

/**
 * The dropdown's permanent FIRST ROW label (QB-STD-1/2).
 *
 * The original six keep "+ Add new ___" verbatim — the one "+ Add" form §7 allows, whitelisted at
 * scripts/verify-create-vocab-section7.mjs:39 — so nothing about them changes. Config-driven catalogs
 * use the §7 preferred "+ Create ___".
 */
export function catalogAddNewLabel(key: CatalogPickerKey): string {
  const config = CATALOG_PICKER_CONFIGS[key];
  return config.backend === "catalog" ? `+ Create ${config.label}` : `+ Add new ${config.label}`;
}
