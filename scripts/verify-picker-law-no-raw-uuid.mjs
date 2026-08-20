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
  // P23-QBO-VENDOR-MAPPING-USES-MIRROR-ID CLOSED: VendorMappingResolutionPage's link ("qbo_vendor_id")
  // and dedupe ("canonical_qbo_vendor_id") raw-uuid inputs are gone -- both fields now bind to
  // ReferenceSelect over canonical mdata.vendors (vendor_id / canonical_vendor_id), and the backend
  // (vendor-mapping-actions.routes.ts) resolves the linked qbo_vendor_id server-side. confirm-mismatch's
  // matching field never gets its own exemption entry here (same file+field key as link would have
  // collapsed to one), because it was converted to a read-only display, not a raw-uuid `<input>` at all.
];

/**
 * The exemption list is a RATCHET: it may shrink, never grow. Raising this number is a visible,
 * reviewable edit to the guard itself — which is the point. It is not a threshold to tune.
 */
// NOTE: ceiling must stay >= (real EXEMPTIONS.length + 1) -- --selftest temporarily pushes one
// synthetic "archived-superseded" fixture onto EXEMPTIONS to exercise that category's assertions,
// so a ceiling set to exactly the real count fails the selftest's own good-fixture check.
const EXEMPTION_CEILING = 8;

/** An "admin-audit-forensic-id" exemption must actually live on an admin/audit surface. */
const AUDIT_PATH = /\/(admin|audit)\/|AuditTrail|AuditLog|ActivityLog|audit-log/;

// =================================================================================================
// NO-ENFORCED-FK FINDINGS — a SECOND, separate ratchet (the EXEMPTIONS ceiling above is untouched).
//
// OWNER RULING (2026-07-25), binding: "Every picker must write the SAME canonical table it reads,
// and any raw-uuid it replaces must resolve to an ENFORCED FK, not a memo." A raw-UUID box replaced
// by a picker that writes into a jsonb memo, a bare text/uuid column with no REFERENCES, or a
// different table than it reads is NOT fixed — it is the same defect wearing a dropdown, because
// the database will still accept an orphan while the dropdown implies it cannot. The repo already
// has that shape on record: catalogs.maintenance_vendors keeps mdata_vendor_id INSIDE a metadata
// jsonb with an app-level existence check and no FK.
//
// So these fields stay as raw inputs ON PURPOSE and are reported, not claimed. Each names the
// unconstrained column, the migration line that declares it, and the remedy (an FK migration — a
// schema change, which is the other lane's and is HELD for the owner; C1 is frontend-only).
//
// THIS LIST IS SELF-INVALIDATING, which is the point: the guard READS db/migrations and FAILS if
// the cited column ever acquires a REFERENCES clause or an ADD CONSTRAINT ... FOREIGN KEY. The day
// the FK lands, this guard turns red and says "migrate the call site" — the finding cannot rot.
// =================================================================================================
const NO_ENFORCED_FK = [];

/** Second ratchet, independent of EXEMPTION_CEILING. May only SHRINK. */
const NO_ENFORCED_FK_CEILING = 0;

/**
 * The §10(b) RETIRE / canonical map. A picker may NEVER read or write the right-hand side.
 * Owner-restated 2026-07-25; CI guard G4 fails on a write/FK to one of these.
 */
const RETIRE_TABLES = [
  [/^payroll\./i, "driver settlement lives in driver_finance.*"],
  [/^settlement\./i, "driver settlement lives in driver_finance.*"],
  [/^accounting\.qbo_/i, "the QBO mirror is mdata.qbo_* and is never pickable"],
  [/^bank\./i, "banking lives in banking.*"],
  [/^maint\./i, "maintenance lives in maintenance.* (maint.part / maint.pm_schedule / maint.position_* are RETIRE)"],
  [/^dispatch\.loads$/i, "loads live in mdata.loads"],
  [/^catalogs\.cancellation_reasons$/i, "legacy: no operating_company_id, RLS OFF, retiring — use catalogs.load_cancellation_reasons"],
];

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

function p23DispatchErrors({ border, transfer, service, routes, migrations }) {
  const errors = [];
  if (!/<EntityPicker[\s\S]*?kind="load"[\s\S]*?value=\{form\.loadId/.test(border)) errors.push("P23-DISPATCH: border load must use the canonical load picker");
  if (!/<EntityPicker[\s\S]*?kind="driver"[\s\S]*?value=\{form\.driverId/.test(border)) errors.push("P23-DISPATCH: border driver must use the canonical driver picker");
  if (!/<EntityPicker[\s\S]*?kind="trailer"[\s\S]*?value=\{equipmentUuid/.test(transfer)) errors.push("P23-DISPATCH: equipment transfer must use the canonical trailer picker");
  if (/value="truck"/.test(transfer) || /"truck"\s*\|\s*"trailer"/.test(service) || /z\.enum\(\["truck"/.test(routes)) errors.push("P23-DISPATCH: truck cannot target the trailer/chassis equipment table");
  for (const constraint of ["unit_border_crossings_driver_company_fk", "unit_border_crossings_load_company_fk", "equipment_transfer_requests_equipment_fk"]) {
    if (!migrations.includes(constraint)) errors.push(`P23-DISPATCH: missing enforced FK ${constraint}`);
  }
  return errors;
}

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

  // ---- 1b. NO-ENFORCED-FK FINDINGS — the owner's enforced-FK clause, mechanised ----------------
  // Each entry is a raw input left in place ON PURPOSE. It must still describe live code, and the
  // claim "this column has no FK" is VERIFIED against db/migrations rather than trusted.
  if (NO_ENFORCED_FK.length > NO_ENFORCED_FK_CEILING) {
    errors.push(
      `FK-RATCHET: ${NO_ENFORCED_FK.length} no-enforced-FK findings exceeds the ceiling of ` +
        `${NO_ENFORCED_FK_CEILING}. This list may only SHRINK — add the FK and migrate the call site.`
    );
  }
  for (const finding of NO_ENFORCED_FK) {
    const k = key(finding.file, finding.field);
    if (seen.has(k)) errors.push(`FK-DUP: ${k} is both an exemption and a no-enforced-FK finding.`);
    seen.add(k);

    if (!hitKeys.has(k)) {
      errors.push(
        `FK-STALE: no-enforced-FK finding ${k} matches no raw-uuid input any more. If the field was ` +
          `migrated, delete the finding; a finding that no longer describes real code is a hole.`
      );
    }
    if (!finding.remedy || finding.remedy.trim().length < 40) {
      errors.push(`FK-REMEDY: ${k} names no remedy. A finding without a remedy is an excuse.`);
    }

    // THE SELF-INVALIDATING PART: read the migration and prove the column really is unconstrained.
    // The moment someone adds the FK, this fires and demands the call site be migrated.
    const parts = String(finding.column ?? "").split(".");
    const bareColumn = parts.length === 3 ? parts[2] : null;
    const qualifiedTable = parts.length === 3 ? `${parts[0]}.${parts[1]}` : null;
    const sql = src.migrations?.[finding.migration];
    if (!bareColumn) {
      errors.push(`FK-COLUMN: ${k} does not name a schema.table.column.`);
    } else if (!sql || sql === MISSING) {
      errors.push(`FK-EVIDENCE: ${k} cites ${finding.migration}, which does not exist.`);
    } else {
      // SCOPED TO THE TABLE. An earlier draft searched every migration for `FOREIGN KEY (load_id)`
      // and fired on OTHER tables that legitimately have a load_id FK — a false FK-RESOLVED that
      // would have pushed a field to be "migrated" onto a column that is still unconstrained. The
      // check now only considers statements that mention this finding's own schema.table.
      const escaped = qualifiedTable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const statements = Object.values(src.migrations ?? {})
        .flatMap((body) => String(body).split(";"))
        .filter((stmt) => new RegExp(`(^|[^a-z0-9_.])${escaped}([^a-z0-9_]|$)`, "i").test(stmt));

      const declared = String(sql)
        .split(";")
        .filter((stmt) => new RegExp(`(^|[^a-z0-9_.])${escaped}([^a-z0-9_]|$)`, "i").test(stmt))
        .some((stmt) => new RegExp(`(^|[\\s(,])${bareColumn}\\s+uuid`, "i").test(stmt));
      if (!declared) {
        errors.push(
          `FK-EVIDENCE: ${k} cites ${finding.migration} but that migration declares no ` +
            `\`${bareColumn} uuid\` column on ${qualifiedTable}. The finding's evidence does not hold.`
        );
      }

      const nowConstrained = statements.some(
        (stmt) =>
          new RegExp(`FOREIGN\\s+KEY\\s*\\(\\s*${bareColumn}\\s*\\)`, "i").test(stmt) ||
          new RegExp(`(^|[\\s(,])${bareColumn}\\s+uuid[^,)]*REFERENCES`, "i").test(stmt)
      );
      if (nowConstrained) {
        errors.push(
          `FK-RESOLVED: ${finding.column} now HAS an enforced foreign key. The no-enforced-FK finding ` +
            `for ${k} is obsolete — delete it and migrate the field to <EntityPicker>.`
        );
      }
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
    // TIGHTENED in the fix half (never weakened): the original assertion looked for the literal
    // `shell="drawer"`, which forced the component to duplicate a whole create element per shell
    // just to satisfy a regex. The real contract is TWO rules, and both are now asserted:
    //   (a) the shell/variant handed to the create surface resolves to a drawer — a ternary is fine,
    //       because CHROME-11 legitimately picks ParityDrawer when the picker is already inside a
    //       money drawer and C7's 480px Modal drawer otherwise;
    //   (b) the picker must DELEGATE to the entity's real create surface and never render a dialog
    //       shell of its own. A bare `<Modal>` here would be exactly the second shell C7 forbids,
    //       and the old regex would have happily passed one that carried variant="drawer".
    if (!/(?:shell|variant)\s*=\s*(?:"drawer"|\{[^}]*"drawer")/.test(p)) {
      errors.push(
        `PRIMITIVE-DRAWER: ${PICKER_FILE} never hands its create surface a drawer shell ` +
          `(shell/variant resolving to "drawer"). C1 composes onto C7's drawer.`
      );
    }
    if (/<Modal[\s/>]/.test(p)) {
      errors.push(
        `PRIMITIVE-SHELL: ${PICKER_FILE} renders its own <Modal>. The picker must DELEGATE to the ` +
          `entity's real create surface, never build a second dialog shell.`
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
        // §10(b) canonical/RETIRE map, owner-restated 2026-07-25. CI guard G4 fails on a write/FK
        // to any of these; a picker must never surface one in the first place.
        for (const [pattern, canonical] of RETIRE_TABLES) {
          if (pattern.test(table)) {
            errors.push(
              `REGISTRY-RETIRE-MAP: kind "${kind}" targets ${table}, which is on the §10(b) RETIRE map — ${canonical}.`
            );
          }
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

  // Archived-superseded selftest fixture: the two archived mutation cases below need a live entry
  // of this category to exercise. Restore the real exemption list at the end of selftest.
  const originalExemptions = EXEMPTIONS.slice();
  EXEMPTIONS.push({
    file: `${SRC}/pages/safety/ComplaintsPage.tsx`,
    field: "respondent_uuid",
    category: "archived-superseded",
    successor: `${SRC}/pages/safety/tabs/ComplaintsTab.tsx`,
    reason: "selftest fixture for archived-superseded mutation checks",
  });

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

  // Migration fixtures for the no-enforced-FK findings: the column exists as a bare `uuid` with no
  // REFERENCES anywhere. If a real finding's migration ever stops looking like this, the guard says so.
  // Several findings can cite the SAME migration (0295 declares both load_id and driver_id), so
  // group the columns per file rather than letting the last one win.
  const goodMigrations = {};
  for (const f of NO_ENFORCED_FK) {
    const [schema, table, col] = f.column.split(".");
    goodMigrations[f.migration] =
      `${goodMigrations[f.migration] ?? `CREATE TABLE ${schema}.${table} (\n  id uuid PRIMARY KEY,`}\n  ${col} uuid,`;
  }
  for (const k of Object.keys(goodMigrations)) goodMigrations[k] += "\n  other text\n);\n";
  // NEGATIVE CONTROL for the table-scoping fix: a DIFFERENT table that legitimately FKs a column of
  // the same name must NOT resolve the finding. An earlier draft searched every migration globally
  // and fired FK-RESOLVED off an unrelated table — which would have pushed a field to be migrated
  // onto a column that is still unconstrained. The good fixture carries that decoy permanently.
  goodMigrations["db/migrations/0001_unrelated_table_with_same_column_names.sql"] =
    "CREATE TABLE other.some_table (\n  id uuid PRIMARY KEY,\n  load_id uuid REFERENCES mdata.loads(id),\n  driver_id uuid REFERENCES mdata.drivers(id),\n  equipment_uuid uuid REFERENCES mdata.equipment(id)\n);\n" +
    "ALTER TABLE other.another_table ADD CONSTRAINT fk_z FOREIGN KEY (load_id) REFERENCES mdata.loads(id);\n";

  const good = {
    picker: goodPicker,
    registry: goodRegistry,
    referenceSelect: goodReferenceSelect,
    catalogRegistry: "export const CATALOG_PICKERS = {};",
    migrations: goodMigrations,
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
  // Same for the no-enforced-FK findings: their raw inputs are still live on purpose.
  for (const f of NO_ENFORCED_FK) {
    const fields = NO_ENFORCED_FK.filter((e) => e.file === f.file);
    good.files[f.file] = fields.map((x) => `<input value={form.${x.field}} placeholder="uuid" />`).join("\n");
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

  // NEGATIVE CONTROL for the tightened drawer rule: CHROME-11 legitimately chooses ParityDrawer
  // when the picker sits inside an open money drawer and C7's Modal drawer otherwise, so the
  // ternary shell form is the SHIPPED shape and must not be flagged.
  const ternaryShell = {
    ...good,
    picker: goodPicker.replace('shell="drawer"', 'shell={nestedInDrawer ? "drawer" : "modal"}'),
  };
  if (contractErrors(ternaryShell).some((e) => /PRIMITIVE-DRAWER/.test(e))) {
    failures.push("drawer rule OVER-claimed: the CHROME-11 ternary shell form must be accepted.");
  }

  const withFile = (base, rel, source) => ({ ...base, files: { ...base.files, [rel]: source } });

  const mutations = [
    [
      "a raw-uuid input survives the sweep (placeholder arm)",
      withFile(good, `${SRC}/pages/dispatch/InTransitIssuesPage.tsx`, '<input value={loadId} placeholder="UUID of load" />'),
      /PICKER-LAW: .*InTransitIssuesPage.*loadId/,
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
      "inline create abandons the C7 drawer for another shape",
      { ...good, picker: goodPicker.replace('shell="drawer"', 'shell="popover"') },
      /PRIMITIVE-DRAWER/,
    ],
    [
      "the picker builds its own dialog shell instead of delegating to the entity's create surface",
      { ...good, picker: goodPicker.replace("<config.Create", "<Modal variant=\"drawer\"><config.Create") },
      /PRIMITIVE-SHELL/,
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
      "a kind is pointed at a §10(b) RETIRE-map table (maint.* instead of maintenance.*)",
      { ...good, registry: goodRegistry.replace(/"mdata\.units"/g, '"maint.part"') },
      /REGISTRY-RETIRE-MAP: .*maint\.part/,
    ],
    [
      "a kind is pointed at the legacy cancellation-reasons catalog",
      { ...good, registry: goodRegistry.replace(/"mdata\.units"/g, '"catalogs.cancellation_reasons"') },
      /REGISTRY-RETIRE-MAP: .*cancellation_reasons/,
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

  const p23Good = {
    border: '<EntityPicker kind="load" value={form.loadId || null} /><EntityPicker kind="driver" value={form.driverId || null} />',
    transfer: '<EntityPicker kind="trailer" value={equipmentUuid || null} />',
    service: 'equipment_kind: "trailer" | "chassis";',
    routes: 'z.enum(["trailer", "chassis"])',
    migrations: 'unit_border_crossings_driver_company_fk unit_border_crossings_load_company_fk equipment_transfer_requests_equipment_fk',
  };
  const p23Mutations = [
    ["raw border load returns", { ...p23Good, border: p23Good.border.replace('<EntityPicker kind="load" value={form.loadId || null} />', '<input value={form.loadId} />') }, /border load/],
    ["truck option returns", { ...p23Good, transfer: '<option value="truck">Truck</option>' + p23Good.transfer }, /truck cannot target/],
    ["equipment FK disappears", { ...p23Good, migrations: p23Good.migrations.replace('equipment_transfer_requests_equipment_fk', '') }, /missing enforced FK equipment_transfer/],
  ];
  for (const [name, fixture, expected] of p23Mutations) {
    const found = p23DispatchErrors(fixture);
    if (!found.some((e) => expected.test(e))) failures.push(`mutation NOT caught: ${name}`);
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
        // P23-QBO-VENDOR-MAPPING-USES-MIRROR-ID closed both real "blocked-needs-backend" exemptions,
        // so none remains in EXEMPTIONS to corrupt -- build a synthetic one instead, same technique
        // already used for the archived-superseded fixture above. This checks the RULE, not real code.
        EXEMPTIONS.length = 0;
        EXEMPTIONS.push({
          file: `${SRC}/pages/x/SyntheticBlockedFixture.tsx`,
          field: "syntheticField",
          category: "blocked-needs-backend",
          blocker: "",
          reason: "selftest fixture for blocked-needs-backend mutation checks, matches no real code",
        });
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
  EXEMPTIONS.push(...originalExemptions);

  // The no-enforced-FK findings table has its own rules; same technique, restored afterwards.
  const originalFk = NO_ENFORCED_FK.slice();
  const fkTableMutations = [
    [
      "a no-enforced-FK finding names no remedy",
      () => {
        NO_ENFORCED_FK.length = 0;
        NO_ENFORCED_FK.push({ ...originalFk[0], remedy: "later" });
      },
      /FK-REMEDY/,
    ],
    [
      "the no-enforced-FK list grows past its ceiling",
      () => {
        NO_ENFORCED_FK.length = 0;
        for (let i = 0; i <= NO_ENFORCED_FK_CEILING; i += 1) NO_ENFORCED_FK.push({ ...originalFk[0], field: `f${i}` });
      },
      /FK-RATCHET/,
    ],
    [
      "a field is BOTH exempted and filed as a no-enforced-FK finding (double-counted silence)",
      () => {
        NO_ENFORCED_FK.length = 0;
        NO_ENFORCED_FK.push({ ...originalFk[0], file: original[0].file, field: original[0].field });
      },
      /FK-DUP/,
    ],
    [
      "a finding does not name a schema.table.column",
      () => {
        NO_ENFORCED_FK.length = 0;
        NO_ENFORCED_FK.push({ ...originalFk[0], column: "somewhere" });
      },
      /FK-COLUMN/,
    ],
  ];
  for (const [name, mutate, expected] of fkTableMutations) {
    mutate();
    const found = contractErrors(good);
    if (!found.some((e) => expected.test(e))) {
      failures.push(
        `mutation NOT caught: ${name}\n      expected ${expected}\n      got: ${found.join(" | ") || "(no errors)"}`
      );
    }
  }
  NO_ENFORCED_FK.length = 0;
  NO_ENFORCED_FK.push(...originalFk);

  const total = mutations.length + tableMutations.length + fkTableMutations.length + p23Mutations.length;
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

/**
 * Every db/migrations/*.sql, so the no-enforced-FK findings can be VERIFIED against the schema
 * source of truth in the repo instead of believed. Read-only; no database is touched.
 */
function collectMigrations() {
  const out = {};
  const dir = path.join(ROOT, "db", "migrations");
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (!name.endsWith(".sql")) continue;
    out[`db/migrations/${name}`] = fs.readFileSync(path.join(dir, name), "utf8");
  }
  return out;
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
    migrations: collectMigrations(),
    files,
  };
  const errors = contractErrors(src);
  errors.push(...p23DispatchErrors({
    border: files[`${SRC}/components/border-crossing/WizardStep1.tsx`] ?? "",
    transfer: files[`${SRC}/components/dispatch/EquipmentTransferModal.tsx`] ?? "",
    service: read("apps/backend/src/dispatch/equipment-transfer/request.service.ts"),
    routes: read("apps/backend/src/dispatch/equipment-transfer/routes.ts"),
    migrations: Object.values(src.migrations).join("\n"),
  }));
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
  if (NO_ENFORCED_FK.length) {
    console.log(
      `  REMAINING — ${NO_ENFORCED_FK.length} field(s) left as raw inputs because the target column has ` +
        `NO ENFORCED FK (owner ruling: a picker over an unconstrained column is the same defect wearing a dropdown):`
    );
    for (const f of NO_ENFORCED_FK) console.log(`    · ${f.column} — verified unconstrained in ${f.migration}`);
  }
}
