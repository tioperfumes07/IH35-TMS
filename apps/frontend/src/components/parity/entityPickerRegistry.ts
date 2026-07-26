/**
 * C1 — the ENTITY picker CONFIG REGISTRY (sibling of catalogPickerRegistry, same shape of idea).
 *
 * THE DEFECT THIS EXISTS TO CLOSE
 * -------------------------------
 * 31 forms across the product asked an operator to TYPE or PASTE a database UUID into a plain text
 * box ("Equipment UUID", "Subject driver UUID (optional)", "UUID of load", "Work order UUID"). No
 * operator knows a UUID, so the field is left blank — dropping the FK every downstream linkage
 * depends on — or pasted unvalidated, which is how a reference ends up pointing at a row in another
 * company. It happened because there was no shared primitive for "a reference to an entity of kind
 * K": the repo had a config-driven CATALOG picker (ReferenceSelect + catalogPickerRegistry, #3550)
 * for reference lists, and several one-off entity pickers, but nothing an arbitrary form could
 * reach for. So every new form reached for a text box.
 *
 * WHY A REGISTRY AND NOT A PROP BAG
 * ---------------------------------
 * The picker law's hard clause is that inline create must WRITE THE SAME CANONICAL TABLE the picker
 * READS — otherwise the created row vanishes on reload. That is a fact about a KIND, not about a
 * call site, so it is declared once here with the backend `evidence` (file:line) that proves it,
 * and `scripts/verify-picker-law-no-raw-uuid.mjs` fails the build if any kind ever declares
 * divergent tables, a RETIRE table, a QBO mirror, or drops entity scoping.
 *
 * MASTER DATA GETS INLINE CREATE; TRANSACTIONS DO NOT
 * ---------------------------------------------------
 * QuickBooks, NetSuite, McLeod and Alvys all draw the same line, and it is a real one rather than a
 * convenience: a reference dropdown offers "+ Add new" for MASTER DATA (vendor, customer, driver,
 * unit, policy) because creating one is a two-field act that must not cost you the form you are
 * filling in. None of them offers inline creation of a TRANSACTION (a load, a work order, a
 * factoring advance) from a subordinate form — those are multi-step documents with their own
 * money, status and audit consequences, and burying them in a dropdown is how you get half-built
 * loads. Transaction kinds therefore declare `inlineCreate.available: false` WITH the reason, so
 * the omission is a recorded decision and not an oversight.
 *
 * ADDITIVE: this file adds a mechanism beside catalogPickerRegistry; it replaces nothing. Catalog
 * reference lists keep going through ReferenceSelect exactly as before.
 */
import { listDrivers, listUnits, listVendors } from "../../api/mdata";
import { listLoads } from "../../api/loads";
import { listWorkOrders } from "../../api/maintenance";
import { listInsurancePolicies } from "../../api/insurance";
import { listFactoringAdvances } from "../../api/accounting";

export type EntityPickerKind =
  | "driver"
  | "unit"
  | "load"
  | "vendor"
  | "work_order"
  | "insurance_policy"
  | "factoring_advance";

export type EntityPickerOption = {
  value: string;
  /** Human identity of the row. NEVER a truncated uuid — if a row has no name it is not pickable. */
  label: string;
  /** Secondary line, QBO-style "Name + context" (e.g. "PENDING · Faro Factoring"). */
  sublabel?: string;
};

export type EntityPickerConfig = {
  kind: EntityPickerKind;
  /** Singular human noun. Drives the placeholder and the "+ Create ___" first row. */
  label: string;
  /** Canonical schema-qualified table the picker READS. */
  readTable: string;
  /**
   * Canonical schema-qualified table a create WRITES. Picker law: MUST equal readTable, or the
   * created row is invisible to the list the operator is looking at.
   */
  writeTable: string;
  readEndpoint: string;
  writeEndpoint: string;
  /** Every kind is company-scoped: operating_company_id is required on read AND on write. */
  entityScoped: true;
  /** Backend file:line proving read table == write table. Never a bare assertion. */
  evidence: string;
  /** Master data → inline create. Transactions → picker only, with the reason recorded. */
  inlineCreate: { available: true } | { available: false; reason: string };
  list: (operatingCompanyId: string) => Promise<EntityPickerOption[]>;
};

function nonEmpty(...parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

const ENTITY_PICKERS: Record<EntityPickerKind, EntityPickerConfig> = {
  driver: {
    kind: "driver",
    label: "driver",
    readTable: "mdata.drivers",
    writeTable: "mdata.drivers",
    readEndpoint: "GET /api/v1/mdata/drivers",
    writeEndpoint: "POST /api/v1/mdata/drivers",
    entityScoped: true,
    evidence: "apps/backend/src/mdata/drivers.routes.ts:351 (SELECT) / :614 (INSERT)",
    inlineCreate: { available: true },
    async list(operatingCompanyId) {
      // limit:200 = the full active roster. The endpoint defaults to 50 (ORDER BY created_at DESC),
      // which silently hid every driver past the newest 50 from every picker that omitted a limit.
      const res = await listDrivers({ operating_company_id: operatingCompanyId, status: "Active", limit: 200 });
      return (res.drivers ?? []).map((d) => ({
        value: d.id,
        label: nonEmpty(d.first_name, d.last_name) || String(d.id),
      }));
    },
  },

  unit: {
    kind: "unit",
    label: "unit",
    readTable: "mdata.units",
    writeTable: "mdata.units",
    readEndpoint: "GET /api/v1/mdata/units",
    writeEndpoint: "POST /api/v1/mdata/units",
    entityScoped: true,
    evidence: "apps/backend/src/mdata/units.routes.ts:216 (SELECT) / :251 (INSERT)",
    inlineCreate: { available: true },
    async list(operatingCompanyId) {
      // DELIBERATELY NOT `include: "trailers"`. That flag makes the endpoint return a UNION of
      // mdata.units (trucks) AND mdata.equipment (trailers) — see
      // apps/backend/src/mdata/units-unified-list.service.ts:134,:157 — so the option list would
      // contain mdata.equipment ids while this config declares (and every consumer FKs to)
      // mdata.units(id). Picking a trailer would then violate
      // mdata.unit_border_crossings.unit_id -> mdata.units(id) and
      // safety.safety_events.subject_unit_id -> mdata.units(id) with a 23503 at save time, and the
      // declared readTable would be a lie. A picker MUST read exactly the table it declares.
      const res = await listUnits({ operating_company_id: operatingCompanyId, limit: 500 });
      return (res.units ?? []).map((row) => {
        const u = row as { id: string; unit_number?: string | null; display_id?: string | null };
        return {
          value: u.id,
          label: nonEmpty(u.unit_number) || nonEmpty(u.display_id) || String(u.id),
        };
      });
    },
  },

  load: {
    kind: "load",
    label: "load",
    readTable: "mdata.loads",
    writeTable: "mdata.loads",
    readEndpoint: "GET /api/v1/mdata/loads",
    writeEndpoint: "POST /api/v1/mdata/loads",
    entityScoped: true,
    evidence: "apps/backend/src/mdata/loads.routes.ts:270 (SELECT) / dispatch/book-load.service.ts:994 (INSERT)",
    inlineCreate: {
      available: false,
      reason:
        "A load is a transaction, not master data. Book Load is an owner-ratified multi-step wide wizard with money, stops, status and audit consequences; McLeod, Alvys, NetSuite and QBO all refuse to bury a document of that weight inside a reference dropdown. Pick an existing load here; book a new one from Dispatch.",
    },
    async list(operatingCompanyId) {
      const res = await listLoads({ operating_company_id: [operatingCompanyId], limit: 200, sort: "-created_at" });
      return (res.loads ?? []).map((l) => ({
        value: l.id,
        label: l.load_number,
        sublabel: nonEmpty(l.customer_name, l.first_pickup_city ? `· ${l.first_pickup_city}` : null) || undefined,
      }));
    },
  },

  vendor: {
    kind: "vendor",
    label: "vendor",
    readTable: "mdata.vendors",
    writeTable: "mdata.vendors",
    readEndpoint: "GET /api/v1/mdata/vendors",
    writeEndpoint: "POST /api/v1/mdata/vendors",
    entityScoped: true,
    evidence: "apps/backend/src/mdata/vendors.routes.ts:267 (SELECT) / :413 (INSERT)",
    inlineCreate: {
      available: false,
      reason:
        "Vendor inline create ALREADY exists and is already picker-law compliant: <ReferenceSelect createKind=\"vendor\"> routes to InlineCreateDrawer at ~42 call sites. C1's rule is to extend the #3550 mechanism, not duplicate it — a second vendor creator here would be exactly the fork this block forbids. Use ReferenceSelect when a vendor field needs create; use this picker when it only needs to SELECT (e.g. a list filter).",
    },
    async list(operatingCompanyId) {
      const res = await listVendors({ operating_company_id: operatingCompanyId, limit: 500 });
      return (res.vendors ?? []).map((v) => ({ value: v.id, label: v.name, sublabel: v.vendor_type }));
    },
  },

  work_order: {
    kind: "work_order",
    label: "work order",
    readTable: "maintenance.work_orders",
    writeTable: "maintenance.work_orders",
    readEndpoint: "GET /api/v1/maintenance/work-orders",
    writeEndpoint: "POST /api/v1/maintenance/work-orders",
    entityScoped: true,
    evidence: "apps/backend/src/maintenance/work-orders.routes.ts:473 (SELECT) / work-orders/work-orders.routes.ts:661 (INSERT)",
    inlineCreate: {
      available: false,
      reason:
        "A work order is a transaction, not master data, and Create Work Order is the second owner-ratified wide wizard (C7). Its display id encodes unit, source type and date, so it cannot be conjured from a dropdown; the only C1 call site is a LOOKUP anyway ('detect warranty from work order').",
    },
    async list(operatingCompanyId) {
      const res = await listWorkOrders(operatingCompanyId);
      return (res.work_orders ?? []).map((w) => ({
        value: w.id,
        label: nonEmpty(w.display_id) || String(w.id),
        sublabel: nonEmpty(w.unit_number, w.status ? `· ${w.status}` : null) || undefined,
      }));
    },
  },

  insurance_policy: {
    kind: "insurance_policy",
    label: "policy",
    readTable: "insurance.policy",
    writeTable: "insurance.policy",
    readEndpoint: "GET /api/v1/insurance/policies",
    writeEndpoint: "POST /api/v1/insurance/policies",
    entityScoped: true,
    evidence: "apps/backend/src/insurance/policy.routes.ts:196 (SELECT) / :266 (INSERT)",
    inlineCreate: { available: true },
    async list(operatingCompanyId) {
      const res = await listInsurancePolicies({ operating_company_id: operatingCompanyId });
      return (res.policies ?? []).map((p) => ({
        value: p.id,
        label: p.policy_number,
        sublabel: p.insurer_name,
      }));
    },
  },

  factoring_advance: {
    kind: "factoring_advance",
    label: "factoring batch",
    readTable: "accounting.factoring_advances",
    writeTable: "accounting.factoring_advances",
    readEndpoint: "GET /api/v1/accounting/factoring-advances",
    writeEndpoint: "POST /api/v1/accounting/factoring-advances",
    entityScoped: true,
    evidence: "apps/backend/src/accounting/factoring-advances.routes.ts:79 (SELECT) / :347 (INSERT)",
    inlineCreate: {
      available: false,
      reason:
        "A factoring advance is a money document: it carries advance rate, reserve, factor fee and a GL consequence, and creating one is a submission to the factor. C1 is a frontend-only UI sweep and must never open a money-creating surface from a dropdown; the batch is created in Factoring and selected here.",
    },
    async list(operatingCompanyId) {
      const res = await listFactoringAdvances(operatingCompanyId, { limit: 200 });
      return (res.rows ?? []).map((r) => ({
        value: r.id,
        label: r.display_id,
        sublabel: nonEmpty(r.status, r.factoring_company_name ? `· ${r.factoring_company_name}` : null) || undefined,
      }));
    },
  },
};

export function getEntityPickerConfig(kind: EntityPickerKind): EntityPickerConfig {
  const config = ENTITY_PICKERS[kind];
  if (!config) throw new Error(`Unknown entity picker kind: ${String(kind)}`);
  return config;
}

export function entityPickerKinds(): EntityPickerKind[] {
  return Object.keys(ENTITY_PICKERS) as EntityPickerKind[];
}

/** "+ Create driver" — §7 vocabulary, never "+ New" / "+ Add". */
export function entityAddNewLabel(kind: EntityPickerKind): string {
  return `+ Create ${getEntityPickerConfig(kind).label}`;
}
