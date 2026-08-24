#!/usr/bin/env node
/**
 * GUARD — verify-scenario-tracker-live-binding
 *
 * THE FAILURES THIS PINS DOWN, all of which were live in this codebase before this PR:
 *
 * 1. KEY DRIFT. The frontend registry used `hop.pod_bol`; the backend used `hop.evidence`. They never
 *    bound, so that dot could not go live no matter what the data said, and nothing failed — it simply
 *    sat grey forever. Every FE key must exist in the backend registry.
 *
 * 2. UNPROBED SLICES. The backend registry held only the 9 hops while the FE rendered 24. The 15 Part B
 *    cards therefore had no backend entry at all and could never show live status.
 *
 * 3. IMPORTED ROWS COUNTED AS PROOF — the dangerous one. Prod holds 16,245 QuickBooks-cloned bills and
 *    11,976 cloned invoices against 5 and 8 TMS-native ones. A probe that counts the whole table
 *    certifies the TMS AP and invoicing flows GREEN on work the TMS never performed. For a board whose
 *    entire purpose is "no stale green", that is the worst possible defect: authoritative, freshly
 *    timestamped, and wrong. Every money probe must carry its origin discriminator.
 *
 * 4. MASKED-CONNECTION CERTIFICATION. Under FORCED RLS a `0` can mean "this connection cannot see",
 *    not "there is no data" — observed live while building this, on the same client, varying between
 *    runs. A certifier that trusts those zeroes writes a false all-red board and flips passed slices to
 *    'fix' as though they regressed. Both writers must assert a positive control before writing.
 *
 * METHOD: static. Comments are stripped before structural assertions so this header cannot satisfy or
 * trip anything. --selftest mutates the REAL sources and requires every assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-scenario-tracker-live-binding";
const BACKEND = "apps/backend/src/home/scenario-registry.ts";
const FE = "apps/frontend/src/pages/program/scenario-tracker/registry.ts";
const CERTIFIER = "scripts/scenario-certify.mjs";
const SCOREBOARD = "scripts/scoreboard-from-live.mjs";
const HOME = "apps/frontend/src/pages/program/scenario-tracker/ScenarioTrackerHome.tsx";

/** Money probes that MUST exclude imported rows, and the discriminator each one needs. */
const ORIGIN_REQUIRED = [
  { key: "hop.invoice", needle: "i.qbo_invoice_id IS NULL", why: "11,976 of 11,984 invoices are QBO clones" },
  { key: "scenario.ap", needle: "b.qbo_bill_id IS NULL", why: "16,245 of 16,250 bills are QBO clones" },
  { key: "scenario.customer", needle: "c.qbo_customer_id IS NULL", why: "2,689 of 2,696 customers are QBO clones" },
  { key: "scenario.coa", needle: "a.qbo_account_id IS NULL", why: "1,295 of 1,442 accounts are QBO clones" },
  { key: "scenario.fuel", needle: "f.load_id IS NOT NULL", why: "all 1,548 fuel rows are CSV-imported" },
  { key: "scenario.roadside_ap", needle: "b.qbo_bill_id IS NULL", why: "QBO clone bills must not prove roadside TMS AP" },
];

/** Scenario proof must represent the full trigger, not merely a row in its first table. */
const CHAIN_REQUIRED = [
  {
    key: "scenario.parts_receive",
    needles: [
      "maintenance.parts_purchases",
      "maintenance.parts_inventory",
      "pi.id = p.parts_inventory_id",
      "pi.operating_company_id = p.operating_company_id",
      "mdata.vendors",
      "v.operating_company_id = p.operating_company_id",
      "maintenance.work_orders",
      "w.operating_company_id = p.operating_company_id",
      "p.qty_received > 0",
      "p.purchase_amount_cents > 0",
      "p.created_by_user_id IS NOT NULL",
      "NULLIF(BTRIM(pi.part_number), '') IS NOT NULL",
      "p.vendor_id IS NULL OR v.id IS NOT NULL",
      "p.work_order_id IS NULL OR w.id IS NOT NULL",
      "lib.feature_flag_overrides",
      "ffo.flag_key = 'PARTS_PURCHASE_GL_POSTING_ENABLED'",
      "ffo.operating_company_id = p.operating_company_id",
      "ffo.enabled = true",
      "accounting.parts_purchase_postings",
      "ppp.parts_purchase_id = p.id",
      "ppp.parts_inventory_id = p.parts_inventory_id",
      "ppp.amount_cents = p.purchase_amount_cents",
      "accounting.journal_entries",
      "je.status = 'posted'",
      "je.voided_at IS NULL",
      "accounting.journal_entry_postings",
      "balance.debit_or_credit = 'debit'",
      "balance.debit_or_credit = 'credit'",
    ],
  },
  {
    key: "scenario.roadside_ap",
    needles: [
      "accounting.bills",
      "maintenance.work_orders",
      "w.id = b.linked_work_order_uuid",
      "w.operating_company_id = b.operating_company_id",
      "w.voided_at IS NULL",
      "dispatch.intransit_issues",
      "i.id = w.source_intransit_issue_id",
      "i.promoted_to_wo_id = w.id",
      "i.operating_company_id = w.operating_company_id",
      "i.load_id = w.load_id",
      "i.unit_id = w.unit_id",
      "accounting.posting_batches",
      "pb.source_transaction_id = b.id::text",
      "pb.batch_status = 'posted'",
      "accounting.journal_entry_postings",
      "jep.source_transaction_id = b.id::text",
      "accounting.journal_entries",
      "je.status = 'posted'",
      "je.voided_at IS NULL",
      "accounting.transaction_source_links",
      "tsl.linked_object_id = b.id::text",
      "b.qbo_bill_id IS NULL",
      "b.amount_cents > 0",
      "NULLIF(BTRIM(b.vendor_id), '') IS NOT NULL",
      "b.unit_id = i.unit_id",
      "balance.debit_or_credit = 'debit'",
      "balance.debit_or_credit = 'credit'",
    ],
  },
  {
    key: "scenario.fuel",
    needles: [
      "fuel.fuel_transactions",
      "mdata.loads",
      "l.id = f.load_id",
      "l.operating_company_id = f.operating_company_id",
      "f.archived_at IS NULL",
      "f.total_cost > 0",
      "l.soft_deleted_at IS NULL",
      "accounting.posting_batches",
      "accounting.journal_entry_postings",
      "jep.source_transaction_type = 'fuel_event'",
      "jep.source_transaction_id = f.id::text",
      "accounting.journal_entries",
      "je.status = 'posted'",
      "je.voided_at IS NULL",
      "accounting.transaction_source_links",
      "tsl.linked_object_type = 'fuel_event'",
      "tsl.linked_object_id = f.id::text",
      "pb.source_transaction_type = 'fuel_event'",
      "pb.source_transaction_id = f.id::text",
      "pb.batch_status = 'posted'",
      "balance.debit_or_credit = 'debit'",
      "balance.debit_or_credit = 'credit'",
    ],
  },
  {
    key: "hop.deliver",
    needles: [
      "mdata.load_stops",
      "mdata.loads",
      "l.id = s.load_id",
      "s.actual_departure_at IS NOT NULL",
      "s.stop_type = 'delivery'",
      "s.status::text = 'departed'",
      "s.soft_deleted_at IS NULL",
      "l.soft_deleted_at IS NULL",
      "mdata.load_stops later",
      "later.load_id = s.load_id",
      "later.stop_type = 'delivery'",
      "later.status::text <> 'cancelled'",
      "later.soft_deleted_at IS NULL",
      "later.sequence_number > s.sequence_number",
    ],
  },
  {
    key: "hop.dispatch",
    needles: [
      "events.event_log",
      "e.source_table = 'mdata.loads'",
      "e.source_reference_id = l.id",
      "e.subject_type = 'load'",
      "e.subject_id = l.id",
      "e.operating_company_id = l.operating_company_id",
      "e.event_type = 'load.status_changed'",
      "e.payload->>'to_status' = 'in_transit'",
      "e.actor_user_id IS NOT NULL",
      "e.is_active = true",
      "l.soft_deleted_at IS NULL",
    ],
  },
  {
    key: "hop.assign",
    needles: [
      "dispatch.load_assignment_history",
      "mdata.loads",
      "l.operating_company_id = b.operating_company_id",
      "mdata.drivers",
      "d.id = l.assigned_primary_driver_id",
      "d.operating_company_id = l.operating_company_id",
      "mdata.units",
      "u.id = l.assigned_unit_id",
      "u.owner_company_id = l.operating_company_id OR u.currently_leased_to_company_id = l.operating_company_id",
      "b.driver_id = l.assigned_primary_driver_id",
      "l.soft_deleted_at IS NULL",
      "d.status = 'Active'",
      "d.archived_at IS NULL",
      "d.deactivated_at IS NULL",
      "u.deactivated_at IS NULL",
      "u.is_oos IS NOT TRUE",
      "u.is_dispatch_blocked IS NOT TRUE",
      "h.load_id = l.id",
      "h.operating_company_id = l.operating_company_id",
      "h.new_driver_id = l.assigned_primary_driver_id",
      "h.new_unit_id = l.assigned_unit_id",
      "dispatch.load_assignment_history later",
      "later.new_driver_id IS DISTINCT FROM h.new_driver_id OR later.new_unit_id IS DISTINCT FROM h.new_unit_id",
      "(later.assigned_at, later.created_at, later.id) > (h.assigned_at, h.created_at, h.id)",
    ],
  },
  {
    key: "scenario.trailer_swap",
    needles: [
      "dispatch.load_assignment_history",
      "mdata.loads",
      "l.id = h.load_id",
      "l.operating_company_id = h.operating_company_id",
      "l.soft_deleted_at IS NULL",
      "l.status::text NOT IN ('delivered', 'cancelled', 'void', 'completed', 'closed')",
      "mdata.equipment",
      "old_trailer.id = h.previous_trailer_id",
      "old_trailer.owner_company_id = h.operating_company_id",
      "new_trailer.id = h.new_trailer_id",
      "new_trailer.owner_company_id = h.operating_company_id",
      "new_trailer.deactivated_at IS NULL",
      "new_trailer.status::text = 'Active'",
      "h.previous_trailer_id <> h.new_trailer_id",
      "dispatch.load_assignment_history later",
      "later.new_trailer_id <> h.new_trailer_id",
      "(later.assigned_at, later.created_at, later.id) > (h.assigned_at, h.created_at, h.id)",
    ],
  },
  {
    key: "scenario.breakdown_relay",
    needles: [
      "dispatch.intransit_issues",
      "maintenance.work_orders",
      "w.id = i.promoted_to_wo_id",
      "w.source_intransit_issue_id = i.id",
      "w.operating_company_id = i.operating_company_id",
      "w.load_id = i.load_id",
      "w.unit_id = i.unit_id",
      "w.voided_at IS NULL",
      "dispatch.load_assignment_history",
      "h.load_id = i.load_id",
      "h.operating_company_id = i.operating_company_id",
      "h.previous_unit_id = i.unit_id",
      "h.assigned_at >= i.reported_at",
      "mdata.loads",
      "l.assigned_unit_id = h.new_unit_id",
      "l.soft_deleted_at IS NULL",
      "mdata.units",
      "dead_unit.is_oos = true OR dead_unit.is_dispatch_blocked = true",
      "live_unit.deactivated_at IS NULL",
      "live_unit.is_oos IS NOT TRUE",
      "live_unit.is_dispatch_blocked IS NOT TRUE",
      "h.previous_unit_id <> h.new_unit_id",
    ],
  },
  {
    key: "scenario.driver_onboarding",
    needles: [
      "safety.onboarding_sessions",
      "mdata.drivers",
      "d.id = s.driver_id",
      "d.operating_company_id = s.operating_company_id",
      "mdata.driver_company_authorizations",
      "dca.company_id = s.operating_company_id",
      "dca.is_authorized = true",
      "dca.deactivated_at IS NULL",
      "s.status = 'completed'",
      "s.current_step = 7",
      "s.completed_at IS NOT NULL",
      "s.step_data ?& ARRAY[",
      "'identity', 'cdl_upload', 'medical_card', 'dqf_docs'",
      "'signatures', 'i9', 'vehicle_assignment'",
      "s.admin_override = true",
      "NULLIF(BTRIM(s.admin_override_reason), '') IS NOT NULL",
      "d.status = 'Active'",
      "d.archived_at IS NULL",
      "d.deactivated_at IS NULL",
      "d.hire_date IS NOT NULL",
      "NULLIF(BTRIM(d.cdl_number), '') IS NOT NULL",
      "NULLIF(BTRIM(d.cdl_state), '') IS NOT NULL",
      "d.cdl_expires_at >= CURRENT_DATE",
      "d.dot_medical_expires_at >= CURRENT_DATE",
    ],
  },
  {
    key: "scenario.accident",
    needles: [
      "safety.accident_cost_lines",
      "insurance.claim",
      "c.id = a.insurance_claim_id",
      "c.accident_report_id = a.id",
      "c.tenant_id = a.operating_company_id",
      "maintenance.work_orders",
      "w.insurance_claim_id = c.id",
      "w.source_type = 'AC'",
      "w.voided_at IS NULL",
      "accounting.bills",
      "b.linked_work_order_uuid = w.id",
      "b.qbo_bill_id IS NULL",
      "accounting.posting_batches",
      "pb.source_transaction_type = 'bill'",
      "pb.source_transaction_id = b.id::text",
      "pb.batch_status = 'posted'",
      "accounting.journal_entry_postings",
      "jep.posting_batch_id = pb.id",
      "jep.source_transaction_type = 'bill'",
      "jep.source_transaction_id = b.id::text",
      "accounting.journal_entries",
      "je.id = jep.journal_entry_uuid",
      "je.status = 'posted'",
      "je.voided_at IS NULL",
      "a.driver_id IS NOT NULL",
      "a.unit_id IS NOT NULL",
      "a.load_id IS NOT NULL",
      "acl.amount_cents > 0",
      "driver_finance.driver_liabilities",
      "dl.origin = 'safety_accident'",
      "dl.origin_id::text = a.id::text",
      "dl.type = 'accident_damage'",
      "dl.original_amount > 0",
      "dl.status <> 'voided'",
    ],
  },
  {
    key: "scenario.escrow",
    needles: [
      "accounting.escrow_postings",
      "accounting.escrow_accounts",
      "ea.operating_company_id = ep.operating_company_id",
      "ea.holder_type = 'driver'",
      "driver_finance.driver_settlements",
      "s.id = ep.source_id",
      "s.driver_id = ea.holder_id",
      "s.voided_at IS NULL",
      "s.reversed_at IS NULL",
      "accounting.journal_entries",
      "je.id = ep.linked_journal_entry_id",
      "je.status = 'posted'",
      "je.voided_at IS NULL",
      "ep.source_type = 'driver_settlement'",
      "ep.posting_type IN ('deposit', 'release')",
      "ep.amount_cents > 0",
    ],
  },
  {
    key: "scenario.deductions",
    needles: [
      "s.id = d.applied_to_settlement_id",
      "s.operating_company_id = d.operating_company_id",
      "s.voided_at IS NULL",
      "s.reversed_at IS NULL",
      "d.status = 'applied'",
      "d.is_held = false",
      "driver_finance.settlement_lines",
      "sl.line_type = 'deduction'",
      "sl.is_active = true",
      "sl.source_table = 'driver_finance.driver_settlement_deductions'",
      "sl.source_reference_id = d.id",
      "driver_finance.payrun_gl_runs",
      "accounting.journal_entries",
      "je.status = 'posted'",
      "je.voided_at IS NULL",
      "pr.status = 'posted'",
    ],
  },
  {
    key: "scenario.advance",
    needles: [
      "a.driver_id IS NOT NULL",
      "a.disbursement_status = 'disbursed'",
      "a.disbursed_at IS NOT NULL",
      "accounting.posting_batches",
      "accounting.journal_entry_postings",
      "accounting.journal_entries",
      "jep.source_transaction_type = 'driver_advance'",
      "jep.source_transaction_id = a.id",
      "je.status = 'posted'",
      "je.voided_at IS NULL",
      "pb.operating_company_id = a.operating_company_id",
      "pb.source_transaction_type = 'driver_advance'",
      "pb.source_transaction_id = a.id",
      "pb.batch_status = 'posted'",
    ],
  },
  {
    key: "scenario.settlement",
    needles: [
      "s.voided_at IS NULL",
      "s.reversed_at IS NULL",
      "s.status = 'paid'",
      "s.paid_at IS NOT NULL",
      "s.payment_state IN ('paid', 'cleared')",
      "driver_finance.payrun_gl_runs",
      "accounting.journal_entries",
      "je.operating_company_id = pr.operating_company_id",
      "je.status = 'posted'",
      "je.voided_at IS NULL",
      "pr.settlement_id = s.id",
      "pr.operating_company_id = s.operating_company_id",
      "pr.status = 'posted'",
    ],
  },
  {
    key: "scenario.maintenance",
    needles: [
      "w.status = 'closed'",
      "w.voided_at IS NULL",
      "w.unit_id IS NOT NULL",
      "w.vendor_id IS NOT NULL",
      "w.load_id IS NOT NULL",
      "maintenance.work_order_lines",
      "wol.line_type IN ('part', 'parts')",
      "wol.line_type = 'labor'",
      "accounting.bills",
      "accounting.posting_batches",
      "pb.batch_status = 'posted'",
      "pb.source_transaction_id = b.id::text",
      "b.linked_work_order_uuid = w.id",
    ],
  },
  {
    key: "scenario.insurance",
    needles: [
      "insurance.policy",
      "p.operating_company_id = c.operating_company_id",
      "p.status = 'active'",
      "p.cancelled_on IS NULL",
      "c.amount_paid_cents > 0",
      "accounting.insurance_claim_recovery_postings",
      "accounting.journal_entries",
      "je.status = 'posted'",
      "je.voided_at IS NULL",
      "rp.claim_id = c.id",
      "rp.operating_company_id = c.operating_company_id",
      "rp.status = 'posted'",
      "rp.is_active = true",
      "rp.voided_at IS NULL",
    ],
  },
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}
function keysIn(src) {
  return new Set(Array.from(src.matchAll(/"((?:hop|scenario)\.[a-z_]+)"/g)).map((m) => m[1]));
}

function check(sources) {
  const errors = [];
  const backendRaw = sources[BACKEND];
  const feRaw = sources[FE];
  const backend = stripComments(backendRaw ?? "");

  // 1 + 2 — every FE key is bound in the backend registry.
  const beKeys = keysIn(backend);
  const feKeys = keysIn(stripComments(feRaw ?? ""));
  for (const k of feKeys) {
    if (!beKeys.has(k)) {
      errors.push(
        `${BACKEND}: frontend renders "${k}" but the backend registry has no entry — the dot can never ` +
          `show live status (this is exactly how hop.pod_bol/hop.evidence drifted).`
      );
    }
  }
  if (feKeys.size && beKeys.size < feKeys.size) {
    errors.push(`${BACKEND}: ${beKeys.size} backend slices vs ${feKeys.size} rendered by the FE — Part B unprobed.`);
  }
  if (beKeys.has("hop.evidence")) {
    errors.push(`${BACKEND}: 'hop.evidence' is back — the FE uses 'hop.pod_bol'; these must not diverge again.`);
  }

  // 3 — imported rows must never count as proof a TMS flow works.
  for (const { key, needle, why } of ORIGIN_REQUIRED) {
    const at = backend.indexOf(`"${key}"`);
    if (at === -1) {
      errors.push(`${BACKEND}: slice "${key}" is missing.`);
      continue;
    }
    const nextKey = backend.slice(at + key.length + 2).search(/"(?:hop|scenario)\.[a-z_]+"/);
    const block = backend.slice(at, nextKey === -1 ? undefined : at + key.length + 2 + nextKey);
    if (!block.includes(needle)) {
      errors.push(
        `${BACKEND}: "${key}" does not restrict to TMS-native rows (expected \`${needle}\`). ${why} — ` +
          `counting them certifies the flow GREEN on work the TMS never did.`
      );
    }
  }

  for (const { key, needles } of CHAIN_REQUIRED) {
    const at = backend.indexOf(`"${key}"`);
    if (at === -1) {
      errors.push(`${BACKEND}: scenario chain "${key}" is missing.`);
      continue;
    }
    const nextKey = backend.slice(at + key.length + 2).search(/"(?:hop|scenario)\.[a-z_]+"/);
    const block = backend.slice(at, nextKey === -1 ? undefined : at + key.length + 2 + nextKey);
    for (const needle of needles) {
      if (!block.includes(needle)) {
        errors.push(`${BACKEND}: "${key}" does not prove its complete chain (missing \`${needle}\`).`);
      }
    }
  }

  // 4 — both live writers must refuse to write from a masked connection.
  for (const f of [CERTIFIER, SCOREBOARD]) {
    const src = stripComments(sources[f] ?? "");
    if (!src) {
      errors.push(`${f}: missing — the tracker has no automatic writer.`);
      continue;
    }
    if (!/assertNotMasked/.test(src)) {
      errors.push(
        `${f}: no masking assertion. Under FORCED RLS a 0 can mean "masked", so writing without a ` +
          `positive control publishes a false all-zero board.`
      );
    }
    if (!/bypass_rls'\s*,\s*'lucia'\s*,\s*false/.test(src)) {
      errors.push(
        `${f}: the bypass must be SESSION-scoped (third arg false). Transaction-local is discarded ` +
          `between the implicit transactions of later queries, and every probe silently reads 0.`
      );
    }
    // Match the named form only. An earlier version also tried to catch a bare trailing `, true]` in
    // the argument list, but that alternative was unanchored (CodeQL js/regex/missing-regexp-anchor)
    // and matched almost any array literal ending in true — a guard that fires on unrelated code gets
    // muted, and a muted guard protects nothing. The certifier passes is_test_data by name, so the
    // named form is the one that matters.
    if (/is_test_data\s*[:=]\s*true\b/.test(src) && /set_scenario_status/.test(src)) {
      errors.push(`${f}: appears to certify with is_test_data=true — a fixture cert must never move a real dot.`);
    }
  }

  // 5 — every rendered slice must click through to a real in-app route (V3). Dead titles = tracker theater.
  const home = sources[HOME] ?? "";
  if (!/to=\{hop\.href\}/.test(home)) {
    errors.push(`${HOME}: Part A hops must Link with to={hop.href} — titles were dead before this pin.`);
  }
  if (!/to=\{item\.href\}/.test(home)) {
    errors.push(`${HOME}: Part B cards must Link with to={item.href} — titles were dead before this pin.`);
  }
  if (!/useState<EntityScope>\("USMCA"\)/.test(home)) {
    errors.push(`${HOME}: default entity must be USMCA (launch law — do not default ALL/TRANSP).`);
  }
  const feSrc = sources[FE] ?? "";
  const feKeysForHref = keysIn(stripComments(feSrc));
  for (const k of feKeysForHref) {
    const needle = `key: "${k}"`;
    const at = feSrc.indexOf(needle);
    if (at === -1) {
      errors.push(`${FE}: slice "${k}" key not found as key: "…" (href pin).`);
      continue;
    }
    const rest = feSrc.slice(at + needle.length);
    const next = rest.search(/key:\s*"(?:hop|scenario)\./);
    const block = rest.slice(0, next === -1 ? undefined : next);
    if (!/href:\s*"\/[^"]+"/.test(block)) {
      errors.push(`${FE}: slice "${k}" has no href:"/…" — the tracker cannot open the wizard that performs the hop.`);
    }
  }

  const hopSection =
    (sources[FE] ?? "").split("export const HOP_IDENTITY")[1]?.split("export const SCENARIO_IDENTITY")[0] ?? "";
  const hopHrefs = [...hopSection.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  const dupHrefs = hopHrefs.filter((h, i) => hopHrefs.indexOf(h) !== i);
  if (dupHrefs.length) {
    errors.push(
      `${FE}: duplicate hop hrefs (${[...new Set(dupHrefs)].join(", ")}) — PROGRAM-TRACKER-F07 hops must land on distinct screens.`,
    );
  }

  return errors;
}

function loadAll() {
  const out = {};
  for (const f of [BACKEND, FE, CERTIFIER, SCOREBOARD, HOME]) {
    try {
      out[f] = readFileSync(f, "utf8");
    } catch {
      out[f] = "";
    }
  }
  return out;
}

function selftest() {
  const real = loadAll();
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real sources do not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const mutations = [
    ["pod_bol key reverted to hop.evidence", (s) => ({ ...s, [BACKEND]: s[BACKEND].split('"hop.pod_bol"').join('"hop.evidence"') })],
    ["invoice probe counts QBO clones", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND i.qbo_invoice_id IS NULL", "") })],
    ["bills probe counts QBO clones", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND b.qbo_bill_id IS NULL", "") })],
    ["fuel probe drops the load link", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("WHERE f.load_id IS NOT NULL", "WHERE true") })],
    ["assignment probe accepts a bill for another driver", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND b.driver_id = l.assigned_primary_driver_id", "") })],
    ["assignment probe loses current unit history", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND h.new_unit_id = l.assigned_unit_id", "") })],
    ["assignment probe ignores a later reassignment", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND (later.new_driver_id IS DISTINCT FROM h.new_driver_id OR later.new_unit_id IS DISTINCT FROM h.new_unit_id)", "") })],
    ["dispatch probe accepts status without its spine event", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND e.event_type = 'load.status_changed'", "") })],
    ["dispatch probe accepts a non-transit transition", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND e.payload->>'to_status' = 'in_transit'", "") })],
    ["dispatch probe loses same-company event scope", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND e.operating_company_id = l.operating_company_id", "") })],
    ["delivery probe accepts a non-final stop", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND later.sequence_number > s.sequence_number", "") })],
    ["delivery probe accepts a cancelled departure", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND s.status::text = 'departed'", "") })],
    ["delivery probe accepts a deleted parent load", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND s.soft_deleted_at IS NULL\n           AND l.soft_deleted_at IS NULL", "AND s.soft_deleted_at IS NULL") })],
    ["fuel probe loses its posting batch", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND pb.source_transaction_id = f.id::text", "") })],
    ["fuel probe accepts an unposted JE", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND je.status = 'posted'", "") })],
    ["fuel probe loses its reverse source link", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND tsl.linked_object_id = f.id::text", "") })],
    ["roadside AP probe loses issue-to-WO backlink", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND i.promoted_to_wo_id = w.id", "") })],
    ["roadside AP probe loses its reverse bill source", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND tsl.linked_object_id = b.id::text", "") })],
    ["roadside AP probe loses bill-to-unit identity", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND b.unit_id = i.unit_id", "") })],
    ["trailer swap accepts a completed load", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND l.status::text NOT IN ('delivered', 'cancelled', 'void', 'completed', 'closed')", "") })],
    ["trailer swap ignores a later replacement", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND later.new_trailer_id <> h.new_trailer_id", "") })],
    ["breakdown relay loses the WO back-link", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND w.source_intransit_issue_id = i.id", "") })],
    ["breakdown relay accepts a blocked replacement", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND live_unit.is_dispatch_blocked IS NOT TRUE", "") })],
    ["driver onboarding accepts an incomplete session", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND s.status = 'completed'", "") })],
    ["driver onboarding accepts an expired CDL", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND d.cdl_expires_at >= CURRENT_DATE", "") })],
    ["accident probe loses its claim back-link", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND c.accident_report_id = a.id", "") })],
    ["accident probe accepts an unposted repair", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND pb.batch_status = 'posted'", "") })],
    ["accident probe loses its JE posting line", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND jep.source_transaction_id = b.id::text", "") })],
    ["bill posting probe compares text to uuid", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("pb.source_transaction_id = b.id::text", "pb.source_transaction_id = b.id") })],
    ["escrow probe accepts a non-driver account", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND ea.holder_type = 'driver'", "") })],
    ["escrow probe loses its linked JE", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("ON je.id = ep.linked_journal_entry_id", "ON true") })],
    ["deduction probe accepts a held deduction", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND d.is_held = false", "") })],
    ["deduction probe loses its source line", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND sl.source_reference_id = d.id", "") })],
    ["advance probe accepts an undisbursed row", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND a.disbursement_status = 'disbursed'", "") })],
    ["advance probe drops its posting batch", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND pb.batch_status = 'posted'", "") })],
    ["settlement probe drops payment proof", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("OR s.payment_state IN ('paid', 'cleared')", "") })],
    ["settlement probe accepts an unposted payrun", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND pr.status = 'posted'", "") })],
    ["maintenance probe counts an unposted WO", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND pb.batch_status = 'posted'", "") })],
    ["maintenance probe drops labor proof", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND wol.line_type = 'labor'", "AND wol.line_type = 'part'") })],
    ["insurance probe drops recovery posting", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND rp.status = 'posted'", "") })],
    ["insurance probe accepts a voided JE", (s) => ({ ...s, [BACKEND]: s[BACKEND].split("AND je.voided_at IS NULL").join("") })],
    ["certifier loses its masking guard", (s) => ({ ...s, [CERTIFIER]: s[CERTIFIER].split("assertNotMasked").join("skipCheck") })],
    ["scoreboard loses its masking guard", (s) => ({ ...s, [SCOREBOARD]: s[SCOREBOARD].split("assertNotMasked").join("skipCheck") })],
    ["certifier bypass becomes transaction-local", (s) => ({ ...s, [CERTIFIER]: s[CERTIFIER].replace("'app.bypass_rls','lucia',false", "'app.bypass_rls','lucia',true") })],
    ["a Part B slice is dropped", (s) => ({ ...s, [BACKEND]: s[BACKEND].split('"scenario.escrow"').join('"scenario.gone"') })],
    ["hop.book loses its href", (s) => ({ ...s, [FE]: s[FE].replace('href: "/dispatch/book-load?book_load=1"', "href_missing: true") })],
    ["duplicate hop hrefs", (s) => ({ ...s, [FE]: s[FE].replace('href: "/dispatch/assignments"', 'href: "/dispatch/loads"') })],
    ["hop Link wiring removed", (s) => ({ ...s, [HOME]: s[HOME].replace("to={hop.href}", "to=\"/program\"") })],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (JSON.stringify(broken) === JSON.stringify(real)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(loadAll());
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) binding the tracker to live data:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
    `${LABEL} PASS — all FE keys bound, money probes exclude imported rows, both live writers refuse ` +
      `to publish from a masked connection, and every slice hrefs a live in-app route.`
);
