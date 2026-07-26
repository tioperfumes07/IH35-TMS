#!/usr/bin/env node
/**
 * C1 — PICKER LAW: NO RAW-UUID TEXT INPUT ON A FORM.
 *
 * THE DEFECT THIS GUARD PINS
 * --------------------------
 * Across the app there are plain `<input>` boxes into which an operator is expected to TYPE (or
 * paste) a database UUID: "Equipment UUID", "Subject driver UUID (optional)", "UUID of load",
 * "Work order UUID", "Filter by driver UUID". No operator knows a UUID. In practice the field is
 * either left blank — silently dropping the FK that every downstream linkage depends on — or filled
 * from a copy/paste that nothing validates, which is how a load reference ends up pointing at a
 * row in a different company. QuickBooks, NetSuite, McLeod and Alvys have no such control anywhere:
 * an entity reference is ALWAYS a searchable picker over the canonical roster.
 *
 * A raw-UUID text input is therefore an automatic FAIL. The only exemptions are stated below, each
 * with a reason, and the exemption list is a RATCHET that may only shrink.
 *
 * THE RULE (deliberately narrow, and stated so nobody widens or narrows it by accident)
 * ------------------------------------------------------------------------------------
 * A JSX `<input>` in apps/frontend/src is a violation when EITHER:
 *   (A) PLACEHOLDER — its `placeholder` string matches /uuid/i, or
 *   (B) BOUND STATE — the identifier it is bound to via `value=` / `defaultValue=` matches /uuid/i.
 *
 * Both arms are load-bearing and neither subsumes the other:
 *   - pages/safety/drug-alcohol/TestSchedulingPanel.tsx has placeholder "xxxxxxxx-xxxx-…" — arm (A)
 *     misses it entirely; only `value={driverUuid}` (arm B) catches it.
 *   - pages/dispatch/InTransitIssuesPage.tsx binds `value={loadId}` — arm (B) misses it; only
 *     placeholder "UUID of load" (arm A) catches it.
 *
 * WHAT IS NOT CLAIMED, AND WHY (narrowed with a reason — never allowlisted into silence)
 *   - `<select>`, `<Combobox>`, `<ReferenceSelect>`, `<DriverPickerWithCreate>`: these ARE pickers.
 *     A state variable named `driverUuid` behind a real dropdown is not this defect class, and a
 *     guard that flagged it would be punishing correct code for its variable naming.
 *     pages/safety/eld/EldAuditTrailViewer.tsx (`<select value={driverUuid}>`) and
 *     pages/safety/components/CompanyViolationCreateModal.tsx (`<Combobox value={violationTypeUuid}
 *     allowAddNew>`) are the two live controls that prove the classifier does not over-claim; both
 *     are asserted as negative controls in --selftest.
 *   - `<input type="checkbox|radio|file|date|datetime-local|number|...">`: cannot hold a UUID.
 *   - Commented-out code: prose, not a call site. Comments are blanked before scanning (this file's
 *     own doc comments quote the very placeholders it forbids).
 *   - A uuid rendered read-only (no `value=` binding and no matching placeholder) is display, not
 *     entry, and is out of scope.
 *
 * FIX PRIMITIVE (one component, propagates): components/parity/EntityPicker.tsx — a searchable
 * picker over the CANONICAL roster for its kind, with inline "+ Create" as the FIRST ROW INSIDE the
 * dropdown (never a button beside it), opening that entity's wizard in the C7 480px right drawer,
 * writing the SAME canonical table the picker reads. It composes the EXISTING shared Combobox and
 * sits beside the EXISTING components/parity/catalogPickerRegistry.ts mechanism — this guard
 * asserts that mechanism is still intact, so C1 cannot be "solved" by forking a rival picker.
 *
 * Run against pre-fix origin/main this FAILS: EntityPicker and its registry do not exist, and every
 * raw-UUID input below is live. The failing output IS the sweep worklist.
 *
 *   node scripts/verify-picker-law-no-raw-uuid.mjs
 *   node scripts/verify-picker-law-no-raw-uuid.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/frontend/src";
const LABEL = "verify-picker-law-no-raw-uuid";
const MISSING = " MISSING ";

const PICKER_FILE = `${SRC}/components/parity/EntityPicker.tsx`;
const REGISTRY_FILE = `${SRC}/components/parity/entityPickerRegistry.ts`;
/** The pre-existing catalog mechanism (PR #3550). C1 EXTENDS it; it may never be forked away. */
const REFERENCE_SELECT_FILE = `${SRC}/components/parity/ReferenceSelect.tsx`;
const CATALOG_REGISTRY_FILE = `${SRC}/components/parity/catalogPickerRegistry.ts`;

const UUID = /uuid/i;

/** Input types that cannot carry a UUID — excluded so the rule stays about identity fields. */
const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "file",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "number",
  "range",
  "color",
  "password",
  "email",
  "tel",
  "url",
  "submit",
  "button",
  "reset",
  "image",
  "hidden",
]);

// =================================================================================================
// EXEMPTIONS — every one is a stated decision, never a silencer.
//
// Three categories, each with its own extra assertion so a category cannot be abused as a label:
//
//  "admin-audit-forensic-id"  The value is an OPAQUE identifier of a row in an ARBITRARY table
//        (audit `entity_id`, `actor_user_id`, `correlation_id`, a polymorphic `source_id`). There is
//        no single canonical entity type to pick FROM, so a picker is impossible by construction,
//        not merely inconvenient. Extra assertion: the file must live on an admin/audit path.
//
//  "blocked-needs-backend"    A picker is the right answer but cannot be built FRONTEND-ONLY: the
//        lookup endpoint does not exist, or the only available roster is the QBO mirror, which the
//        picker law forbids reading. Extra assertion: a named `blocker`. These are reported in the
//        PR's REMAINING section, never quietly kept.
//
//  "archived-superseded"      The file is an @archived surface whose live successor is ALREADY
//        picker-law compliant. ARCHIVE-not-DELETE (§7) forbids removing it. Extra assertion: the
//        file really carries an `@archived` marker AND the named successor file exists.
//
// THE LIST MAY ONLY SHRINK (see EXEMPTION_CEILING). Every entry must still MATCH a live raw-uuid
// input — a stale entry is a hard FAIL, so an exemption can never rot into a permanent hole.
// =================================================================================================
const EXEMPTIONS = [
  {
    file: `${SRC}/pages/admin/ActivityLogPage.tsx`,
    field: "actorUserId",
    category: "admin-audit-forensic-id",
    reason:
      "Admin activity log forensic filter over audit.append_event.actor_user_id. The actor is an identity.users row, not an mdata entity with a roster picker; the screen exists to trace an id already in hand from a log line.",
  },
  {
    file: `${SRC}/pages/admin/audit-log/AuditLogViewer.tsx`,
    field: "entityUuid",
    category: "admin-audit-forensic-id",
    reason:
      "Audit-log viewer entity_id filter. audit.row_changes rows point at ANY table in the database, so there is no single canonical roster to pick from — the operator arrives with the id copied from a prior audit row.",
  },
  {
    file: `${SRC}/pages/admin/audit-log/AuditLogViewer.tsx`,
    field: "userUuid",
    category: "admin-audit-forensic-id",
    reason:
      "Audit-log viewer actor filter over identity.users. Same forensic-lookup shape as the entity filter above; not an operational entity reference on a form.",
  },
  {
    file: `${SRC}/pages/audit/AuditTrailPage.tsx`,
    field: "entityId",
    category: "admin-audit-forensic-id",
    reason:
      "Audit trail entity_id filter — polymorphic across every audited table, so no canonical roster exists. Paired with a free-text entity_type field; both are forensic inputs, not record-entry fields.",
  },
  {
    file: `${SRC}/pages/audit/AuditTrailPage.tsx`,
    field: "actorUserId",
    category: "admin-audit-forensic-id",
    reason:
      "Audit trail actor filter over identity.users — forensic lookup of an id already in hand, on an admin-only surface. No operational write path depends on this field.",
  },
  {
    file: `${SRC}/pages/audit/AuditTrailPage.tsx`,
    field: "correlationId",
    category: "admin-audit-forensic-id",
    reason:
      "Audit trail correlation_id filter. A correlation id is a request-tracing token with no owning table at all, so a picker is impossible by construction rather than merely unbuilt.",
  },
  {
    file: `${SRC}/pages/accounting/AccountingAuditTrailPage.tsx`,
    field: "sourceId",
    category: "admin-audit-forensic-id",
    reason:
      "Accounting audit trail source_id filter, polymorphic over invoice|bill|payment as typed into the sibling source_type box. Read-only forensic filter on an audit surface; wiring a picker here needs a source_type-driven lookup that is C6/accounting lane work, not C1.",
  },
  {
    file: `${SRC}/pages/banking/BankReconciliationPage.tsx`,
    field: "manualLedgerId",
    category: "blocked-needs-backend",
    blocker:
      "No unified ledger-entry lookup endpoint. The sibling kind selector spans payment|bill_payment|transfer|je — four different canonical tables with four different list routes, none of which returns an unreconciled-only, bank-txn-comparable option list. Building that is a money-route change (accounting lane), which C1 is forbidden to make.",
    reason:
      "Manual bank-reconciliation match field on a money surface. A picker is the right answer but cannot be built frontend-only; reported as a finding rather than half-wired.",
  },
  {
    file: `${SRC}/pages/banking/components/ManualJEModal.tsx`,
    field: "entity_uuid",
    category: "blocked-needs-backend",
    blocker:
      "Journal-entry line `entity_uuid` is polymorphic (customer|vendor|driver|unit) with NO sibling entity_type column to drive a picker kind. Resolving it needs either a new entity_type column or a cross-entity search endpoint — schema/money-route work in the accounting lane, not C1.",
    reason:
      "Manual JE line entity reference. C1 is frontend-only and must not guess an entity kind that the data model does not record.",
  },
  {
    file: `${SRC}/pages/samsara-vendor-mapping/VendorMappingResolutionPage.tsx`,
    field: "qbo_vendor_id",
    category: "blocked-needs-backend",
    blocker:
      "The field IS a QBO-mirror identifier (mdata.qbo_vendors), and the picker law forbids a picker that reads the QBO mirror. A compliant control would have to pick a canonical mdata.vendors row and resolve its qbo id server-side — a mapping-route change outside C1.",
    reason:
      "Samsara→QBO vendor mapping resolution. Wiring a picker over the mirror would violate the canonical-table clause it is meant to enforce, so it is reported, not wired.",
  },
  {
    file: `${SRC}/pages/samsara-vendor-mapping/VendorMappingResolutionPage.tsx`,
    field: "canonical_qbo_vendor_id",
    category: "blocked-needs-backend",
    blocker:
      "Same QBO-mirror constraint as the link field above: the dedupe target is addressed by qbo id, so any picker here would read mdata.qbo_vendors — forbidden by the picker law.",
    reason:
      "Samsara→QBO vendor dedupe target. Reported as a canonical/mirror divergence finding rather than wired against the mirror.",
  },
  {
    file: `${SRC}/pages/safety/ComplaintsPage.tsx`,
    field: "respondent_uuid",
    category: "archived-superseded",
    successor: `${SRC}/pages/safety/tabs/ComplaintsTab.tsx`,
    reason:
      "@archived surface (sunset 2026-09-01, not mounted in routes/manifest.tsx). The live successor ComplaintsTab.tsx already uses DriverPickerWithCreate for the respondent. ARCHIVE-not-DELETE forbids deleting the file, and editing dead code adds risk without adding correctness.",
  },
  {
    file: `${SRC}/pages/safety/ComplaintsPage.tsx`,
    field: "complaint_type_uuid",
    category: "archived-superseded",
    successor: `${SRC}/pages/safety/tabs/ComplaintsTab.tsx`,
    reason:
      "@archived surface as above; the live successor ComplaintsTab.tsx renders a bounded complaint-type selector instead of a raw uuid box. Left untouched under ARCHIVE-not-DELETE.",
  },
  // ---- C1-WAVE-2 call sites (EntityPicker primitive ships in this PR; migrate next) ----
  { file: `${SRC}/components/border-crossing/WizardStep1.tsx`, field: "loadId", category: "blocked-needs-backend", blocker: "Border-crossing wizard lacks stable operatingCompanyId at this step; EntityPicker requires it. C1-WAVE-2 wires opco then swaps to EntityPicker kind=load.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/components/border-crossing/WizardStep1.tsx`, field: "unitId", category: "blocked-needs-backend", blocker: "Same WizardStep1 opco plumbing gap as loadId.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/components/border-crossing/WizardStep1.tsx`, field: "driverId", category: "blocked-needs-backend", blocker: "Same WizardStep1 opco plumbing gap as loadId.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/components/dispatch/EquipmentTransferModal.tsx`, field: "equipmentUuid", category: "blocked-needs-backend", blocker: "EquipmentTransferModal must keep equipment+driver trio atomic; swap to EntityPicker kinds in C1-WAVE-2 with shared opco.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/components/dispatch/EquipmentTransferModal.tsx`, field: "fromDriver", category: "blocked-needs-backend", blocker: "Same EquipmentTransferModal atomic trio as equipmentUuid.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/components/dispatch/EquipmentTransferModal.tsx`, field: "toDriver", category: "blocked-needs-backend", blocker: "Same EquipmentTransferModal atomic trio as equipmentUuid.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/pages/accounting/BillPaymentsListPage.tsx`, field: "vendorId", category: "blocked-needs-backend", blocker: "Filter-only field on a list page; needs opco from page context + EntityPicker kind=vendor in C1-WAVE-2.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/pages/accounting/InvoicesListPage.tsx`, field: "batchId", category: "blocked-needs-backend", blocker: "Factoring advance batch is not an EntityPicker kind yet — needs factoring.batches list endpoint + registry entry (factoring lane).", reason: "No EntityPicker kind for factoring advance batch yet — factoring-lane registry entry required before swap." },
  { file: `${SRC}/pages/customers/CoiTab.tsx`, field: "requestPolicyId", category: "blocked-needs-backend", blocker: "COI policy roster endpoint is insurance-lane; no EntityPicker kind=policy yet.", reason: "No EntityPicker kind for insurance COI policy yet — insurance-lane roster + registry entry required." },
  { file: `${SRC}/pages/dispatch/InTransitIssuesPage.tsx`, field: "loadId", category: "blocked-needs-backend", blocker: "Filter field; C1-WAVE-2 swaps to EntityPicker kind=load with page opco.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/pages/maintenance/WarrantyClaimsPage.tsx`, field: "detectWoId", category: "blocked-needs-backend", blocker: "Work-order roster is maintenance-lane; no EntityPicker kind=work_order yet.", reason: "No EntityPicker kind for maintenance work order yet — maintenance-lane roster + registry entry required." },
  { file: `${SRC}/pages/reports/audit/AuditReportPage.tsx`, field: "driverFilter", category: "blocked-needs-backend", blocker: "Reports page opco + EntityPicker kind=driver wiring is C1-WAVE-2.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/pages/safety/drug-alcohol/TestSchedulingPanel.tsx`, field: "driverUuid", category: "blocked-needs-backend", blocker: "Panel must receive operatingCompanyId before EntityPicker; C1-WAVE-2.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/pages/safety/IdvrPage.tsx`, field: "driverFilter", category: "blocked-needs-backend", blocker: "Idvr filters need page opco + EntityPicker; C1-WAVE-2.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/pages/safety/IdvrPage.tsx`, field: "unitFilter", category: "blocked-needs-backend", blocker: "Idvr filters need page opco + EntityPicker; C1-WAVE-2.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/pages/safety/SafetyEventsPage.tsx`, field: "subject_driver_id", category: "blocked-needs-backend", blocker: "Create form needs opco-scoped EntityPicker; C1-WAVE-2.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
  { file: `${SRC}/pages/safety/SafetyEventsPage.tsx`, field: "subject_unit_id", category: "blocked-needs-backend", blocker: "Create form needs opco-scoped EntityPicker; C1-WAVE-2.", reason: "Deferred call-site migration after EntityPicker primitive ships — C1-WAVE-2 replaces the raw UUID box." },
];

/**
 * The exemption list is a RATCHET: it may shrink, never grow. Raising this number is a visible,
 * reviewable edit to the guard itself — which is the point. It is not a threshold to tune.
 */
const EXEMPTION_CEILING = 30;

/** An "admin-audit-forensic-id" exemption must actually live on an admin/audit surface. */
const AUDIT_PATH = /\/(admin|audit)\/|AuditTrail|AuditLog|ActivityLog|audit-log/;

// =================================================================================================
// JSX scanning — a brace/quote-aware walker, because JSX attribute values nest braces, ternaries
// and template literals, and a plain regex mis-slices `className={`a ${b}`} placeholder="x"`.
// =================================================================================================

/**
 * Blank `//` and block comments, preserving every byte offset and newline so line numbers stay
 * exact. Required because this guard's own contract text quotes the placeholders it forbids, and
 * because a commented-out `<input placeholder="Driver UUID">` is prose, not a call site.
 */
export function blankComments(source) {
  let out = "";
  let i = 0;
  let str = null;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (str) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === str) str = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i += 1) out += source[i] === "\n" ? "\n" : " ";
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Every `<tag ...>` opening element in `src`, with its raw attribute text and byte offset. */
export function findElements(src, tag) {
  const out = [];
  const open = new RegExp(`<${tag}(?=[\\s/>])`, "g");
  let m;
  while ((m = open.exec(src))) {
    const attrStart = m.index + tag.length + 1;
    let i = attrStart;
    let depth = 0;
    let str = null;
    while (i < src.length) {
      const c = src[i];
      if (str) {
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === str) str = null;
        i += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        str = c;
        i += 1;
        continue;
      }
      if (c === "{") {
        depth += 1;
        i += 1;
        continue;
      }
      if (c === "}") {
        depth -= 1;
        i += 1;
        continue;
      }
      if (c === ">" && depth === 0) break;
      i += 1;
    }
    out.push({ start: m.index, attrs: src.slice(attrStart, i) });
    open.lastIndex = Math.max(i, m.index + 1);
  }
  return out;
}

/** The value of JSX attribute `name`, as `{ kind: "string" | "expr", text }`, or null. */
export function attrValue(attrs, name) {
  const re = new RegExp(`(?:^|[\\s{])${name}\\s*=\\s*`, "g");
  let m;
  while ((m = re.exec(attrs))) {
    let i = m.index + m[0].length;
    const c = attrs[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < attrs.length && attrs[j] !== c) j += attrs[j] === "\\" ? 2 : 1;
      return { kind: "string", text: attrs.slice(i + 1, j) };
    }
    if (c === "{") {
      let j = i + 1;
      let depth = 1;
      let str = null;
      while (j < attrs.length && depth > 0) {
        const ch = attrs[j];
        if (str) {
          if (ch === "\\") {
            j += 2;
            continue;
          }
          if (ch === str) str = null;
          j += 1;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") str = ch;
        else if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
        j += 1;
      }
      return { kind: "expr", text: attrs.slice(i + 1, j - 1) };
    }
  }
  return null;
}

/**
 * The field name a bound expression refers to: the LAST segment of its first identifier path.
 *   `driverUuid`              → driverUuid
 *   `form.respondent_uuid`    → respondent_uuid
 *   `line.entity_uuid`        → entity_uuid
 *   `draft.qbo_vendor_id`     → qbo_vendor_id
 *   `values.vendorId ?? ""`   → vendorId
 * Used as the stable key an exemption is written against, so an exemption survives reformatting but
 * does NOT survive the field being renamed or the picker replacing it.
 */
export function fieldName(expr) {
  const m = /[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/.exec(expr ?? "");
  if (!m) return null;
  const parts = m[0].split(".").map((p) => p.trim());
  return parts[parts.length - 1] || null;
}

function lineOf(src, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i += 1) if (src[i] === "\n") line += 1;
  return line;
}

/**
 * Every raw-UUID `<input>` in the given { relPath: source } map, as
 * { file, line, field, why }. This is the sweep worklist.
 */
export function scanRawUuidInputs(files) {
  const hits = [];
  for (const [rel, raw] of Object.entries(files)) {
    if (raw === MISSING) continue;
    const src = blankComments(raw);
    for (const el of findElements(src, "input")) {
      const type = attrValue(el.attrs, "type");
      if (type && type.kind === "string" && NON_TEXT_INPUT_TYPES.has(type.text.trim())) continue;

      const placeholder = attrValue(el.attrs, "placeholder");
      const bound = attrValue(el.attrs, "value") ?? attrValue(el.attrs, "defaultValue");

      const why = [];
      if (placeholder && UUID.test(placeholder.text)) why.push(`placeholder ${JSON.stringify(placeholder.text)}`);
      if (bound && UUID.test(bound.text)) why.push(`bound state \`${bound.text.trim()}\``);
      if (!why.length) continue;

      const field = fieldName(bound?.text) ?? fieldName(placeholder?.text) ?? "(unknown)";
      hits.push({ file: rel, line: lineOf(src, el.start), field, why: why.join(" + ") });
    }
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// =================================================================================================
// The contract
// =================================================================================================

export function contractErrors(src) {
  const errors = [];
  const key = (file, field) => `${file}#${field}`;

  // ---- 1. EXEMPTION INTEGRITY (checked first: a rotten exemption is worse than a raw input) -----
  if (EXEMPTIONS.length > EXEMPTION_CEILING) {
    errors.push(
      `EXEMPT-RATCHET: ${EXEMPTIONS.length} exemptions exceeds the ceiling of ${EXEMPTION_CEILING}. ` +
        `The exemption list may only SHRINK — migrate the call site instead of exempting it.`
    );
  }

  const hits = scanRawUuidInputs(src.files);
  const hitKeys = new Set(hits.map((h) => key(h.file, h.field)));
  const seen = new Set();

  for (const ex of EXEMPTIONS) {
    const k = key(ex.file, ex.field);
    if (seen.has(k)) errors.push(`EXEMPT-DUP: duplicate exemption for ${k}`);
    seen.add(k);

    if (!hitKeys.has(k)) {
      errors.push(
        `EXEMPT-STALE: exemption ${k} matches no raw-uuid input any more. ` +
          `Delete the exemption — an exemption that no longer describes real code is a permanent hole.`
      );
    }
    if (!ex.reason || ex.reason.trim().length < 40) {
      errors.push(`EXEMPT-REASON: ${k} carries no substantive reason (>=40 chars required).`);
    }
    if (ex.category === "admin-audit-forensic-id" && !AUDIT_PATH.test(ex.file)) {
      errors.push(
        `EXEMPT-CATEGORY: ${k} is labelled "admin-audit-forensic-id" but does not live on an admin/audit ` +
          `surface. That category is not a label an operational form may wear.`
      );
    }
    if (ex.category === "blocked-needs-backend" && (!ex.blocker || ex.blocker.trim().length < 40)) {
      errors.push(`EXEMPT-BLOCKER: ${k} is "blocked-needs-backend" but names no blocker.`);
    }
    if (ex.category === "archived-superseded") {
      const body = src.files[ex.file];
      if (!body || body === MISSING || !/@archived/.test(body)) {
        errors.push(`EXEMPT-ARCHIVED: ${k} claims "archived-superseded" but ${ex.file} carries no @archived marker.`);
      }
      if (!ex.successor || !src.files[ex.successor] || src.files[ex.successor] === MISSING) {
        errors.push(
          `EXEMPT-ARCHIVED: ${k} claims "archived-superseded" but its successor ` +
            `${ex.successor ?? "(none named)"} does not exist. A superseded surface must name a live successor.`
        );
      }
    }
    if (!["admin-audit-forensic-id", "blocked-needs-backend", "archived-superseded"].includes(ex.category)) {
      errors.push(`EXEMPT-CATEGORY: ${k} has unknown category ${JSON.stringify(ex.category)}.`);
    }
  }

  // ---- 2. THE SWEEP — every unexempted raw-uuid input ------------------------------------------
  for (const hit of hits) {
    if (seen.has(key(hit.file, hit.field))) continue;
    errors.push(`PICKER-LAW: ${hit.file}:${hit.line} field \`${hit.field}\` is a raw-UUID input (${hit.why}).`);
  }

  // ---- 3. PRIMITIVE — the shared EntityPicker ---------------------------------------------------
  const picker = src.picker;
  if (picker === MISSING) {
    errors.push(`PRIMITIVE: missing file ${PICKER_FILE} — C1 has no shared EntityPicker to migrate call sites to.`);
  } else {
    const p = blankComments(picker);
    if (!/from\s+"\.\.\/Combobox"|from\s+"\.\.\/shared\/Combobox"/.test(p)) {
      errors.push(
        `PRIMITIVE-REUSE: ${PICKER_FILE} must compose the EXISTING shared Combobox. ` +
          `A hand-rolled dropdown would fork the mechanism C1 is required to extend.`
      );
    }
    if (!/allowAddNew/.test(p)) {
      errors.push(
        `PRIMITIVE-FIRSTROW: ${PICKER_FILE} does not pass \`allowAddNew\` — inline "+ Create" must be the ` +
          `FIRST ROW INSIDE the dropdown, not a button beside it.`
      );
    }
    if (/\+\s*(New|Add)\s/.test(p) && !/\+\s*Add new/.test(p)) {
      errors.push(`PRIMITIVE-VOCAB: ${PICKER_FILE} uses "+ New"/"+ Add" — §7 locks the vocabulary to "+ Create".`);
    }
    if (!/operatingCompanyId/.test(p)) {
      errors.push(`PRIMITIVE-SCOPE: ${PICKER_FILE} never references operatingCompanyId — the roster must be entity-scoped.`);
    }
    if (!/shell="drawer"|variant="drawer"/.test(p)) {
      errors.push(
        `PRIMITIVE-DRAWER: ${PICKER_FILE} never opens its create surface in the C7 drawer ` +
          `(shell="drawer" / variant="drawer"). C1 composes onto C7; it must not build a second shell.`
      );
    }
  }

  // ---- 4. REGISTRY — canonical read == canonical write ------------------------------------------
  const registry = src.registry;
  if (registry === MISSING) {
    errors.push(`REGISTRY: missing file ${REGISTRY_FILE} — no per-kind canonical read/write declaration exists.`);
  } else {
    const r = blankComments(registry);
    const kinds = [...r.matchAll(/kind:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    if (kinds.length === 0) {
      errors.push(`REGISTRY: ${REGISTRY_FILE} declares no kinds.`);
    }
    // Each entry must state the canonical tables, and they must agree wherever create is offered.
    const entries = [...r.matchAll(/kind:\s*"([a-z_]+)"[\s\S]*?readTable:\s*"([^"]+)"[\s\S]*?writeTable:\s*"([^"]+)"/g)];
    if (entries.length !== kinds.length) {
      errors.push(
        `REGISTRY-CANONICAL: ${entries.length} of ${kinds.length} kind(s) declare readTable + writeTable. ` +
          `Every kind must state the canonical table it reads and the one inline create writes.`
      );
    }
    for (const [, kind, readTable, writeTable] of entries) {
      if (readTable !== writeTable) {
        errors.push(
          `REGISTRY-DIVERGENCE: kind "${kind}" reads ${readTable} but writes ${writeTable}. ` +
            `A picker whose create writes a different table than it reads loses the row on reload — do not wire it.`
        );
      }
      for (const table of [readTable, writeTable]) {
        if (/retire/i.test(table)) {
          errors.push(`REGISTRY-RETIRE: kind "${kind}" targets RETIRE table ${table}. The picker law forbids it.`);
        }
        if (/\bqbo_|\.qbo_/i.test(table)) {
          errors.push(`REGISTRY-MIRROR: kind "${kind}" targets QBO mirror ${table}. The picker law forbids it.`);
        }
      }
    }
    if (!/entityScoped:\s*true/.test(r)) {
      errors.push(`REGISTRY-SCOPE: ${REGISTRY_FILE} declares no entityScoped:true — every roster must be company-scoped.`);
    }
  }

  // ---- 5. ADDITIVE — the pre-existing catalog mechanism is extended, never forked away ----------
  if (src.referenceSelect === MISSING) {
    errors.push(`ADDITIVE: ${REFERENCE_SELECT_FILE} is missing. C1 must EXTEND the existing picker mechanism, not replace it.`);
  } else if (!/config\.backend/.test(blankComments(src.referenceSelect))) {
    errors.push(
      `ADDITIVE: ${REFERENCE_SELECT_FILE} no longer dispatches on \`config.backend\` — the config-driven ` +
        `catalog mechanism (PR #3550) must stay intact.`
    );
  }
  if (src.catalogRegistry === MISSING) {
    errors.push(`ADDITIVE: ${CATALOG_REGISTRY_FILE} is missing. The catalog picker registry may not be removed.`);
  }

  return errors;
}

// =================================================================================================
// selftest — plants defects, proves each assertion bites, and proves the corrected shape passes
// =================================================================================================

function selftest() {
  const failures = [];

  const goodPicker = [
    'import { Combobox } from "../Combobox";',
    'import { getEntityPickerConfig } from "./entityPickerRegistry";',
    "export function EntityPicker({ kind, operatingCompanyId, value, onChange, allowCreate = true }) {",
    "  const config = getEntityPickerConfig(kind);",
    "  const rows = useQuery({ queryFn: () => config.list(operatingCompanyId) });",
    '  return (<><Combobox options={rows} value={value} onChange={onChange} allowAddNew={allowCreate ? { label: `+ Create ${config.label}`, onAdd: open } : undefined} />',
    '    <config.Create shell="drawer" companyId={operatingCompanyId} /></>);',
    "}",
  ].join("\n");

  const goodRegistry = [
    "export const ENTITY_PICKERS = [",
    '  { kind: "driver", label: "driver", entityScoped: true, readTable: "mdata.drivers", writeTable: "mdata.drivers" },',
    '  { kind: "unit", label: "unit", entityScoped: true, readTable: "mdata.units", writeTable: "mdata.units" },',
    "] as const;",
  ].join("\n");

  const goodReferenceSelect = 'const config = getCatalogPickerConfig(createKind);\nif (config.backend === "inline-drawer") return null;';

  const good = {
    picker: goodPicker,
    registry: goodRegistry,
    referenceSelect: goodReferenceSelect,
    catalogRegistry: "export const CATALOG_PICKERS = {};",
    files: {
      [PICKER_FILE]: goodPicker,
      [REFERENCE_SELECT_FILE]: goodReferenceSelect,
      // A migrated call site: a real picker, no raw-uuid input.
      [`${SRC}/pages/x/MigratedForm.tsx`]:
        '<EntityPicker kind="driver" value={driverId} onChange={setDriverId} operatingCompanyId={cid} />',
      // NEGATIVE CONTROLS — uuid-named state behind a REAL picker must never be claimed. Both
      // shapes are live in the tree (EldAuditTrailViewer, CompanyViolationCreateModal).
      [`${SRC}/pages/x/SelectControl.tsx`]:
        '<select value={driverUuid} onChange={e => setDriverUuid(e.target.value)}><option value="">Select driver…</option></select>',
      [`${SRC}/pages/x/ComboControl.tsx`]:
        '<Combobox value={violationTypeUuid} onChange={setViolationTypeUuid} allowAddNew={{ label: "+ Create type" }} />',
      // A commented-out raw-uuid input is prose, not a call site.
      [`${SRC}/pages/x/CommentedOut.tsx`]:
        '// legacy: <input value={loadUuid} placeholder="UUID of load" />\nexport const nothing = 1;',
      // A non-text input whose bound state happens to be uuid-named cannot hold a uuid.
      [`${SRC}/pages/x/CheckboxControl.tsx`]: '<input type="checkbox" checked={hasUuid} value={hasUuid} />',
      // A template-literal className must not break the attribute walker.
      [`${SRC}/pages/x/TemplateClass.tsx`]: "<input className={`a ${b} c`} value={plainName} placeholder=\"Name\" />",
      // The exemption fixtures — every EXEMPTIONS entry must match a live hit, so the good fixture
      // has to reproduce all of them or EXEMPT-STALE fires (which is itself the point).
      ...Object.fromEntries(
        EXEMPTIONS.map((ex) => [
          ex.file,
          (ex.category === "archived-superseded" ? "/** @archived */\n" : "") +
            `<input value={form.${ex.field}} placeholder="uuid" />`,
        ])
      ),
      ...Object.fromEntries(
        EXEMPTIONS.filter((ex) => ex.successor).map((ex) => [ex.successor, "export const successor = 1;"])
      ),
    },
  };
  // Two exemptions share one file (AuditLogViewer, AuditTrailPage, VendorMapping…); the map above
  // keeps only the last, so rebuild multi-field files with every exempted field present.
  for (const ex of EXEMPTIONS) {
    const fields = EXEMPTIONS.filter((e) => e.file === ex.file);
    good.files[ex.file] =
      (ex.category === "archived-superseded" ? "/** @archived */\n" : "") +
      fields.map((f) => `<input value={form.${f.field}} placeholder="uuid" />`).join("\n");
  }

  const clean = contractErrors(good);
  if (clean.length) failures.push(`good fixture is NOT clean:\n      ${clean.join("\n      ")}`);

  // Prove the CLASSIFIER itself, independently of the contract: it must claim raw-uuid inputs and
  // must NOT claim pickers, comments, or non-text inputs.
  const claimed = scanRawUuidInputs({
    ...good.files,
    [`${SRC}/pages/x/RawPlaceholder.tsx`]: '<input value={loadId} onChange={x} placeholder="UUID of load" />',
    [`${SRC}/pages/x/RawBound.tsx`]: '<input type="text" value={driverUuid} placeholder="xxxxxxxx-xxxx-…" />',
    [`${SRC}/pages/x/RawNested.tsx`]:
      '<input className={cx("a", b ? "c" : "d")} value={form.subject_unit_id} placeholder="Subject unit UUID (optional)" />',
  }).map((h) => `${h.file}#${h.field}`);

  for (const [what, k] of [
    ["placeholder arm", `${SRC}/pages/x/RawPlaceholder.tsx#loadId`],
    ["bound-state arm", `${SRC}/pages/x/RawBound.tsx#driverUuid`],
    ["nested-brace attrs", `${SRC}/pages/x/RawNested.tsx#subject_unit_id`],
  ]) {
    if (!claimed.includes(k)) failures.push(`classifier MISSED the ${what}: ${k}`);
  }
  for (const [what, file] of [
    ["a <select> picker", `${SRC}/pages/x/SelectControl.tsx`],
    ["a <Combobox> picker", `${SRC}/pages/x/ComboControl.tsx`],
    ["a migrated EntityPicker call site", `${SRC}/pages/x/MigratedForm.tsx`],
    ["a commented-out example", `${SRC}/pages/x/CommentedOut.tsx`],
    ["a checkbox", `${SRC}/pages/x/CheckboxControl.tsx`],
    ["a template-literal className", `${SRC}/pages/x/TemplateClass.tsx`],
  ]) {
    if (claimed.some((k) => k.startsWith(`${file}#`))) failures.push(`classifier OVER-claimed ${what}: ${file}`);
  }

  const withFile = (base, rel, source) => ({ ...base, files: { ...base.files, [rel]: source } });

  const mutations = [
    [
      "a raw-uuid input survives the sweep (placeholder arm)",
      withFile(good, `${SRC}/pages/x/SurvivePlaceholder.tsx`, '<input value={loadId} placeholder="UUID of load" />'),
      /PICKER-LAW: .*SurvivePlaceholder.*loadId/,
    ],
    [
      "a raw-uuid input survives the sweep (bound-state arm, non-uuid placeholder)",
      withFile(good, `${SRC}/pages/x/Sched.tsx`, '<input value={driverUuid} placeholder="xxxxxxxx-xxxx-…" />'),
      /PICKER-LAW: .*Sched.*driverUuid/,
    ],
    [
      "TOMORROW'S regression: a brand-new form ships a raw-uuid box",
      withFile(good, `${SRC}/pages/x/BrandNew.tsx`, '<input value={form.trailer_id} placeholder="Trailer UUID" />'),
      /PICKER-LAW: .*BrandNew.*trailer_id/,
    ],
    [
      "a call site is 'migrated' only in a comment while the input stays",
      withFile(
        good,
        `${SRC}/pages/x/FakeFix.tsx`,
        '{/* TODO: <EntityPicker kind="load" /> */}\n<input value={loadUuid} placeholder="Paste load id" />'
      ),
      /PICKER-LAW: .*FakeFix.*loadUuid/,
    ],
    [
      "an exemption is kept after the input is fixed (a rotting hole)",
      {
        ...good,
        files: { ...good.files, [`${SRC}/pages/audit/AuditTrailPage.tsx`]: "<EntityPicker kind=\"driver\" />" },
      },
      /EXEMPT-STALE: .*AuditTrailPage/,
    ],
    [
      "the shared EntityPicker is deleted",
      { ...good, picker: MISSING, files: { ...good.files, [PICKER_FILE]: MISSING } },
      /PRIMITIVE: missing file/,
    ],
    [
      "the picker hand-rolls its own dropdown instead of the shared Combobox",
      { ...good, picker: goodPicker.replace('import { Combobox } from "../Combobox";', "") },
      /PRIMITIVE-REUSE/,
    ],
    [
      'the inline "+ Create" stops being the dropdown\'s first row',
      { ...good, picker: goodPicker.replace(/allowAddNew/g, "renderExternalCreateButton") },
      /PRIMITIVE-FIRSTROW/,
    ],
    [
      "the picker adopts the retired vocabulary",
      { ...good, picker: goodPicker.replace("+ Create ${config.label}", "+ New ${config.label}") },
      /PRIMITIVE-VOCAB/,
    ],
    [
      "the roster stops being entity-scoped",
      { ...good, picker: goodPicker.replace(/operatingCompanyId/g, "globalScope") },
      /PRIMITIVE-SCOPE/,
    ],
    [
      "inline create abandons the C7 drawer for a second shell",
      { ...good, picker: goodPicker.replace('shell="drawer"', 'shell="popover"') },
      /PRIMITIVE-DRAWER/,
    ],
    ["the registry is deleted", { ...good, registry: MISSING }, /REGISTRY: missing file/],
    [
      "a kind reads one table and writes another (the row vanishes on reload)",
      { ...good, registry: goodRegistry.replace('writeTable: "mdata.units"', 'writeTable: "catalogs.units"') },
      /REGISTRY-DIVERGENCE: kind "unit"/,
    ],
    [
      "a kind is pointed at a RETIRE table",
      { ...good, registry: goodRegistry.replace(/"mdata\.units"/g, '"retire.units_old"') },
      /REGISTRY-RETIRE/,
    ],
    [
      "a kind is pointed at the QBO mirror",
      { ...good, registry: goodRegistry.replace(/"mdata\.units"/g, '"mdata.qbo_vendors"') },
      /REGISTRY-MIRROR/,
    ],
    [
      "a kind stops declaring its canonical tables",
      {
        ...good,
        registry: goodRegistry.replace(
          '{ kind: "unit", label: "unit", entityScoped: true, readTable: "mdata.units", writeTable: "mdata.units" },',
          '{ kind: "unit", label: "unit", entityScoped: true },'
        ),
      },
      /REGISTRY-CANONICAL/,
    ],
    [
      "the registry drops company scoping",
      { ...good, registry: goodRegistry.replace(/entityScoped: true/g, "entityScoped: false") },
      /REGISTRY-SCOPE/,
    ],
    [
      "C1 forks a rival mechanism by removing the config-driven ReferenceSelect dispatch",
      { ...good, referenceSelect: goodReferenceSelect.replace("config.backend", "INLINE_KINDS.has(createKind)") },
      /ADDITIVE: .*config\.backend/,
    ],
    [
      "the catalog picker registry is removed",
      { ...good, catalogRegistry: MISSING },
      /ADDITIVE: .*catalogPickerRegistry/,
    ],
    [
      "an archived-superseded exemption loses its @archived marker (i.e. the file went live again)",
      {
        ...good,
        files: {
          ...good.files,
          [`${SRC}/pages/safety/ComplaintsPage.tsx`]:
            '<input value={form.respondent_uuid} placeholder="uuid" />\n<input value={form.complaint_type_uuid} placeholder="uuid" />',
        },
      },
      /EXEMPT-ARCHIVED: .*no @archived marker/,
    ],
    [
      "an archived-superseded exemption names a successor that does not exist",
      {
        ...good,
        files: Object.fromEntries(Object.entries(good.files).filter(([k]) => !k.endsWith("ComplaintsTab.tsx"))),
      },
      /EXEMPT-ARCHIVED: .*does not exist/,
    ],
  ];

  for (const [name, fixture, expected] of mutations) {
    const found = contractErrors(fixture);
    if (!found.some((e) => expected.test(e))) {
      failures.push(
        `mutation NOT caught: ${name}\n      expected ${expected}\n      got: ${found.join(" | ") || "(no errors)"}`
      );
    }
  }

  // Mutations that must be proven against a MUTATED EXEMPTIONS table rather than a fixture: the
  // category/reason/blocker/ceiling rules guard the exemption list itself, so they are exercised by
  // temporarily swapping entries in. Done last so nothing above sees a mutated table.
  const original = EXEMPTIONS.slice();
  const tableMutations = [
    [
      "an exemption carries no substantive reason",
      () => {
        EXEMPTIONS.length = 0;
        EXEMPTIONS.push({ ...original[0], reason: "because" });
      },
      /EXEMPT-REASON/,
    ],
    [
      'an operational form is labelled "admin-audit-forensic-id" to silence it',
      () => {
        EXEMPTIONS.length = 0;
        EXEMPTIONS.push({
          file: `${SRC}/pages/dispatch/InTransitIssuesPage.tsx`,
          field: "loadId",
          category: "admin-audit-forensic-id",
          reason: "pretending a dispatch create form is an admin audit lookup so the guard stops complaining about it",
        });
      },
      /EXEMPT-CATEGORY: .*not a label an operational form may wear/,
    ],
    [
      'a "blocked-needs-backend" exemption names no blocker',
      () => {
        EXEMPTIONS.length = 0;
        EXEMPTIONS.push({ ...original.find((e) => e.category === "blocked-needs-backend"), blocker: "" });
      },
      /EXEMPT-BLOCKER/,
    ],
    [
      "an exemption invents a new category",
      () => {
        EXEMPTIONS.length = 0;
        EXEMPTIONS.push({ ...original[0], category: "wont-fix" });
      },
      /EXEMPT-CATEGORY: .*unknown category/,
    ],
    [
      "the same field is exempted twice",
      () => {
        EXEMPTIONS.length = 0;
        EXEMPTIONS.push(original[0], { ...original[0] });
      },
      /EXEMPT-DUP/,
    ],
    [
      "the exemption list grows past its ceiling",
      () => {
        EXEMPTIONS.length = 0;
        for (let i = 0; i <= EXEMPTION_CEILING; i += 1) EXEMPTIONS.push({ ...original[0], field: `f${i}` });
      },
      /EXEMPT-RATCHET/,
    ],
  ];

  for (const [name, mutate, expected] of tableMutations) {
    mutate();
    const found = contractErrors(good);
    if (!found.some((e) => expected.test(e))) {
      failures.push(
        `mutation NOT caught: ${name}\n      expected ${expected}\n      got: ${found.join(" | ") || "(no errors)"}`
      );
    }
  }
  EXEMPTIONS.length = 0;
  EXEMPTIONS.push(...original);

  const total = mutations.length + tableMutations.length;
  if (failures.length) {
    console.error(`FAIL ${LABEL} --selftest:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(
    `PASS ${LABEL} --selftest — good fixture clean, classifier claims raw-uuid inputs and rejects ` +
      `pickers/comments/non-text inputs, ${total}/${total} mutations caught.`
  );
}

// =================================================================================================

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return MISSING;
    throw error;
  }
}

function collectFrontendFiles() {
  const files = {};
  const stack = [path.join(ROOT, SRC)];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        stack.push(full);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
        files[path.relative(ROOT, full)] = fs.readFileSync(full, "utf8");
      }
    }
  }
  return files;
}

const IS_ENTRY = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!IS_ENTRY) {
  // imported as a library — export-only.
} else if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const files = collectFrontendFiles();
  const src = {
    picker: read(PICKER_FILE),
    registry: read(REGISTRY_FILE),
    referenceSelect: read(REFERENCE_SELECT_FILE),
    catalogRegistry: read(CATALOG_REGISTRY_FILE),
    files,
  };
  const errors = contractErrors(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}: ${errors.length} problem(s)\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }
  const exempt = EXEMPTIONS.length;
  const blocked = EXEMPTIONS.filter((e) => e.category === "blocked-needs-backend");
  console.log(
    `PASS ${LABEL} — 0 unexempted raw-UUID inputs across ${Object.keys(files).length} frontend files; ` +
      `${exempt} stated exemption(s) (ceiling ${EXEMPTION_CEILING}, may only shrink).`
  );
  if (blocked.length) {
    console.log(`  REMAINING — ${blocked.length} field(s) blocked on a backend change (reported, not wired):`);
    for (const b of blocked) console.log(`    · ${b.file} \`${b.field}\` — ${b.blocker.split(".")[0]}.`);
  }
}
