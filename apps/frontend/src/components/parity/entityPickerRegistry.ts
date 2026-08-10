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
 *
 * CLS-SILENT-CAP: roster page sizes below are surfaced by CappedListNotice in EntityPicker.tsx via
 * entityPickerListLimit() — never a silent truncate on server-searched kinds.
 */
import { listDrivers, listEquipment, listUnits, listVendors } from "../../api/mdata";
import { listLoads } from "../../api/loads";
import { listWorkOrders } from "../../api/maintenance";
import { listInsuranceClaims, listInsuranceLawsuits, listInsurancePolicies } from "../../api/insurance";
import { listFactoringAdvances } from "../../api/accounting";

export type EntityPickerKind =
  | "driver"
  | "unit"
  | "trailer"
  | "load"
  | "vendor"
  | "work_order"
  | "insurance_policy"
  | "insurance_claim"
  | "insurance_lawsuit"
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
  /**
   * SAF-B29: when true, EntityPicker wires Combobox.onSearch → list({ search }) and puts the term
   * in the react-query key. When false, Combobox keeps client-side filter (API has no search yet).
   */
  serverSearch: boolean;
  list: (
    operatingCompanyId: string,
    opts?: {
      search?: string;
      /**
       * FAIL-CA1: driver create defaults to Probation; money surfaces must see Active+Probation.
       * Dispatch/Book Load keep default `active_only` so DQF gates stay on Active roster.
       */
      driverRoster?: "active_only" | "active_or_probation";
    }
  ) => Promise<EntityPickerOption[]>;
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
    serverSearch: true,
    async list(operatingCompanyId, opts) {
      // SAF-B29: limit:200 WITHOUT search silently dropped every driver past page 1. The shared
      // EntityPicker is used across Safety (accidents filters, fines, escrow, …) — one silent
      // truncation reproduced on every call site. Typed term → server `search`; empty term still
      // pages the newest 200 (endpoint default is 50).
      // FAIL-CA1: money pickers pass driverRoster=active_or_probation — create defaults to Probation
      // (owner-locked); Active-only hid fresh SAMPLE drivers and only offered duplicate +Create.
      const search = opts?.search || undefined;
      const moneyRoster = opts?.driverRoster === "active_or_probation";
      const statuses = moneyRoster ? (["Active", "Probation"] as const) : (["Active"] as const);
      const pages = await Promise.all(
        statuses.map((status) =>
          listDrivers({
            operating_company_id: operatingCompanyId,
            status,
            limit: 200,
            search,
          })
        )
      );
      const seen = new Set<string>();
      const out: EntityPickerOption[] = [];
      for (const res of pages) {
        for (const d of res.drivers ?? []) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          out.push({
            value: d.id,
            label: nonEmpty(d.first_name, d.last_name) || String(d.id),
          });
        }
      }
      return out;
    },
  },

  trailer: {
    kind: "trailer",
    label: "trailer",
    readTable: "mdata.equipment",
    writeTable: "mdata.equipment",
    readEndpoint: "GET /api/v1/mdata/equipment",
    writeEndpoint: "POST /api/v1/mdata/equipment",
    entityScoped: true,
    evidence: "apps/backend/src/mdata/equipment.routes.ts:132 (SELECT) / :230 (INSERT)",
    inlineCreate: { available: true },
    serverSearch: true,
    async list(operatingCompanyId, opts) {
      const res = await listEquipment({
        operating_company_id: operatingCompanyId,
        limit: 200,
        search: opts?.search || undefined,
      });
      return (res.equipment ?? []).map((row) => {
        const e = row as {
          id: string;
          equipment_number?: string | null;
          equipment_type?: string | null;
          make?: string | null;
          model?: string | null;
        };
        return {
          value: e.id,
          label: nonEmpty(e.equipment_number) || String(e.id),
          sublabel: [e.equipment_type, e.make, e.model].filter(Boolean).join(" · ") || undefined,
        };
      });
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
    serverSearch: true,
    async list(operatingCompanyId, opts) {
      // DELIBERATELY NOT `include: "trailers"`. That flag makes the endpoint return a UNION of
      // mdata.units (trucks) AND mdata.equipment (trailers) — see
      // apps/backend/src/mdata/units-unified-list.service.ts:134,:157 — so the option list would
      // contain mdata.equipment ids while this config declares (and every consumer FKs to)
      // mdata.units(id). Picking a trailer would then violate
      // mdata.unit_border_crossings.unit_id -> mdata.units(id) and
      // safety.safety_events.subject_unit_id -> mdata.units(id) with a 23503 at save time, and the
      // declared readTable would be a lie. A picker MUST read exactly the table it declares.
      // SAF-B29: pass search so fleets > page size remain selectable by unit number.
      const res = await listUnits({
        operating_company_id: operatingCompanyId,
        limit: 500,
        search: opts?.search || undefined,
      });
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
    serverSearch: true,
    async list(operatingCompanyId, opts) {
      const res = await listLoads({
        operating_company_id: [operatingCompanyId],
        limit: 200,
        sort: "-created_at",
        search: opts?.search || undefined,
      });
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
    serverSearch: true,
    async list(operatingCompanyId, opts) {
      // Prod TRANSP vendors ~950: with search, a 200 page is correct; without search keep 1000 so
      // verify-entity-picker-not-capped still holds for empty-term opens.
      const res = await listVendors({
        operating_company_id: operatingCompanyId,
        limit: opts?.search ? 200 : 1000,
        search: opts?.search || undefined,
      });
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
    // listWorkOrders has no search param yet — Combobox local filter remains.
    serverSearch: false,
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
    // listInsurancePolicies has no search param yet — Combobox local filter remains.
    serverSearch: false,
    async list(operatingCompanyId) {
      const res = await listInsurancePolicies({ operating_company_id: operatingCompanyId });
      return (res.policies ?? []).map((p) => ({
        value: p.id,
        label: p.policy_number,
        sublabel: p.insurer_name,
      }));
    },
  },

  insurance_claim: {
    kind: "insurance_claim",
    label: "insurance claim",
    readTable: "insurance.claims",
    writeTable: "insurance.claims",
    readEndpoint: "GET /api/v1/insurance/claims",
    writeEndpoint: "POST /api/v1/insurance/claims",
    entityScoped: true,
    evidence: "apps/backend/src/insurance/claim.routes.ts (company-scoped SELECT / INSERT)",
    inlineCreate: {
      available: false,
      reason: "An insurance claim is an audited transaction with policy, loss, reserve and recovery fields; create it in Insurance, then link it here.",
    },
    serverSearch: false,
    async list(operatingCompanyId) {
      const res = await listInsuranceClaims({ operating_company_id: operatingCompanyId });
      return (res.claims ?? []).map((claim) => ({
        value: claim.id,
        label: claim.claim_number,
        sublabel: claim.status,
      }));
    },
  },

  insurance_lawsuit: {
    kind: "insurance_lawsuit",
    label: "insurance lawsuit",
    readTable: "insurance.lawsuits",
    writeTable: "insurance.lawsuits",
    readEndpoint: "GET /api/v1/insurance/lawsuits",
    writeEndpoint: "POST /api/v1/insurance/lawsuits",
    entityScoped: true,
    evidence: "apps/backend/src/insurance/lawsuit.routes.ts (company-scoped SELECT / INSERT)",
    inlineCreate: {
      available: false,
      reason: "A lawsuit is an audited legal transaction with parties, court, demand and settlement fields; create it in Insurance, then link it here.",
    },
    serverSearch: false,
    async list(operatingCompanyId) {
      const res = await listInsuranceLawsuits({ operating_company_id: operatingCompanyId });
      return (res.lawsuits ?? []).map((lawsuit) => ({
        value: lawsuit.id,
        label: lawsuit.case_number,
        sublabel: lawsuit.status,
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
    serverSearch: true,
    async list(operatingCompanyId, opts) {
      const res = await listFactoringAdvances(operatingCompanyId, {
        limit: 200,
        search: opts?.search || undefined,
      });
      return (res.rows ?? []).map((r) => ({
        value: r.id,
        label: r.display_id,
        sublabel: nonEmpty(r.status, r.factoring_company_name ? `· ${r.factoring_company_name}` : null) || undefined,
      }));
    },
  },
};

/** Hard roster page size for one open (CLS-SILENT-CAP — EntityPicker renders CappedListNotice). */
export function entityPickerListLimit(
  kind: EntityPickerKind,
  opts?: { search?: string; driverRoster?: "active_only" | "active_or_probation" }
): number {
  switch (kind) {
    case "driver":
      return opts?.driverRoster === "active_or_probation" ? 400 : 200;
    case "unit":
      return 500;
    case "vendor":
      return opts?.search ? 200 : 1000;
    case "trailer":
    case "load":
    case "factoring_advance":
      return 200;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

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
