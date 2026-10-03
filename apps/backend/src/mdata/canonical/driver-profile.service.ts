/**
 * ROUND 326 item 3 — the driver profile: one read that is the whole driver. Seventeen blocks, each a value or a
 * NAMED reason it is empty (never a placeholder): pay basis · settlements + their lines · advances · escrow ·
 * deductions · reimbursements · fuel purchases · units and trailers · loads run · safety events · drug and alcohol ·
 * medical card · CDL · insurance · documents · HOS · Samsara linkage.
 * Voided / reversed rows never count. Every row carries the id the screen drills to.
 */

import { canonicalNotCancelledLoadClause } from "../../dispatch/canonical-active-load-set.js";

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
export type ProfileBlock<T> = { value: T; empty_reason: string | null };

export const DRIVER_PROFILE_BLOCKS = [
  "pay_basis", "settlements", "advances", "escrow", "deductions", "reimbursements", "fuel", "equipment", "loads",
  "safety", "drug_alcohol", "medical_card", "cdl", "insurance", "documents", "hos", "samsara",
] as const;

const n = (v: unknown) => Number(v ?? 0);
const cents = (dollars: unknown) => Math.round(Number(dollars ?? 0) * 100);
const daysTo = (d: string | Date | null) => (d == null ? null : Math.floor((new Date(d).getTime() - Date.now()) / 86_400_000));

export async function readDriverProfile(client: Q, companyId: string, driverId: string) {
  const d = (
    await client.query(
      `SELECT id, first_name, last_name, status, employment_status, hire_date, termination_date, deactivated_at,
              cdl_number, cdl_state, cdl_class, cdl_expires_at, cdl_restrictions, hazmat_endorsement_expires_at,
              endorsement_h, endorsement_n, endorsement_p, endorsement_s, endorsement_t, endorsement_x,
              dot_medical_expires_at, samsara_driver_id, last_samsara_login_at
         FROM mdata.drivers WHERE id = $1 AND operating_company_id = $2`,
      [driverId, companyId]
    )
  ).rows[0];
  if (!d) return null;
  const args = [companyId, driverId];
  const rows = async (sql: string, extra: unknown[] = []) => (await client.query(sql, [...args, ...extra])).rows;

  // 1. Pay basis — the rate card (current + history).
  const rates = (await rows(
    `SELECT id, basis_type, rate_per_mile_cents, rate_empty_per_mile_cents, flat_per_load_cents, miles_basis,
            effective_from, effective_to, is_active, is_test_data, notes
       FROM driver_finance.driver_pay_rates WHERE operating_company_id = $1 AND driver_id = $2
      ORDER BY is_active DESC, effective_from DESC`
  )).map((r) => ({ ...r, rate_per_mile_cents: r.rate_per_mile_cents == null ? null : n(r.rate_per_mile_cents),
    rate_empty_per_mile_cents: r.rate_empty_per_mile_cents == null ? null : n(r.rate_empty_per_mile_cents),
    flat_per_load_cents: r.flat_per_load_cents == null ? null : n(r.flat_per_load_cents) }));
  const current = rates.find((r) => r.is_active && (r.effective_to == null || new Date(r.effective_to) >= new Date())) ?? null;

  // 2. Settlements + the lines behind them.
  const settlements = (await rows(
    `SELECT s.id, s.display_id, s.status, s.period_start, s.period_end, s.first_load_number, s.last_load_number,
            s.gross_pay, s.deductions_total, s.reimbursements_total, s.net_pay, s.paid_at, s.settlement_model, s.is_presettlement
       FROM driver_finance.driver_settlements s
      WHERE s.operating_company_id = $1 AND s.driver_id = $2 AND s.voided_at IS NULL AND s.reversed_at IS NULL
        AND s.status <> 'cancelled' AND s.is_sample_data IS NOT TRUE
      ORDER BY s.period_start DESC NULLS LAST LIMIT 52`
  )).map((s) => ({ ...s, gross_cents: cents(s.gross_pay), deductions_cents: cents(s.deductions_total),
    reimbursements_cents: cents(s.reimbursements_total), net_cents: cents(s.net_pay) }));
  const lines = settlements.length
    ? (await client.query(
        `SELECT l.id, l.settlement_id, l.line_type, l.category, l.description, l.amount, l.load_id, l.quantity, l.rate_cents
           FROM driver_finance.settlement_lines l
          WHERE l.operating_company_id = $1 AND l.settlement_id = ANY($2::uuid[]) AND l.voided_at IS NULL
            AND coalesce(l.is_active, true)
          ORDER BY l.created_at`,
        [companyId, settlements.map((s) => s.id)]
      )).rows.map((l) => ({ ...l, amount_cents: cents(l.amount) }))
    : [];
  const settlementsWithLines = settlements.map((s) => ({ ...s, lines: lines.filter((l) => l.settlement_id === s.id) }));

  // 3. Advances
  const advances = (await rows(
    `SELECT id, display_id, amount, outstanding_balance, purpose, status, disbursement_status, disbursed_at, posting_date,
            load_id, recovered_in_settlement_id
       FROM driver_finance.driver_advances
      WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL
      ORDER BY coalesce(posting_date, created_at::date) DESC`
  )).map((a) => ({ ...a, amount_cents: cents(a.amount), outstanding_cents: cents(a.outstanding_balance) }));

  // 4. Escrow — the GL-tied escrow accounts (accounting.escrow_accounts, holder_type='driver') and their postings.
  const escrowAccounts = (await rows(
    `SELECT id, purpose, status, balance_cents, coa_account_id FROM accounting.escrow_accounts
      WHERE operating_company_id = $1 AND holder_type = 'driver' AND holder_id = $2 ORDER BY purpose`
  )).map((x) => ({ ...x, balance_cents: n(x.balance_cents) }));
  const escrowPostings = escrowAccounts.length
    ? (await client.query(
        `SELECT p.id, p.escrow_account_id, p.posting_type, p.amount_cents, p.source_type, p.source_id, p.note, p.posted_at, p.linked_journal_entry_id
           FROM accounting.escrow_postings p
          WHERE p.operating_company_id = $1 AND p.escrow_account_id = ANY($2::uuid[])
          ORDER BY p.posted_at DESC LIMIT 50`,
        [companyId, escrowAccounts.map((x) => x.id)]
      )).rows.map((x) => ({ ...x, amount_cents: n(x.amount_cents) }))
    : [];

  // 5. Deductions
  const deductions = (await rows(
    `SELECT id, deduction_type, amount_cents, remaining_balance_cents, reason, status, is_held, applied_to_settlement_id,
            load_id, source_expense_id, source_fuel_transaction_id, created_at
       FROM driver_finance.driver_settlement_deductions
      WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL
      ORDER BY created_at DESC`
  )).map((x) => ({ ...x, amount_cents: n(x.amount_cents), remaining_balance_cents: x.remaining_balance_cents == null ? null : n(x.remaining_balance_cents) }));

  // 6. Reimbursements
  const reimbursements = (await rows(
    `SELECT id, reimbursement_type, amount_cents, reason, pay_mode, status, posting_date, paid_at, load_id, applied_to_settlement_id, journal_entry_id
       FROM driver_finance.driver_reimbursements
      WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL AND status <> 'void'
      ORDER BY coalesce(posting_date, created_at::date) DESC`
  )).map((x) => ({ ...x, amount_cents: n(x.amount_cents) }));

  // 7. Fuel purchases
  const fuel = (await rows(
    `SELECT f.id, coalesce(f.purchased_at, f.transaction_at) AS at, f.gallons, round(f.total_cost * 100)::bigint AS total_cents,
            f.location_city, f.location_state, f.unit_id, u.unit_number, f.load_id, f.vendor_id, v.vendor_name
       FROM fuel.fuel_transactions f
       LEFT JOIN mdata.units u ON u.id = f.unit_id
       LEFT JOIN mdata.vendors v ON v.id = f.vendor_id
      WHERE f.operating_company_id = $1 AND f.driver_id = $2 AND f.voided_at IS NULL AND f.archived_at IS NULL
      ORDER BY coalesce(f.purchased_at, f.transaction_at) DESC LIMIT 50`
  )).map((f) => ({ ...f, gallons: f.gallons == null ? null : n(f.gallons), total_cents: n(f.total_cents) }));

  // 8. Units (Samsara vehicle-driver assignments) and trailers (equipment assigned + trailers on the driver's DVIRs)
  const units = await rows(
    `SELECT a.id, a.unit_id, u.unit_number, a.started_at, a.ended_at, a.source
       FROM telematics.vehicle_driver_assignments a LEFT JOIN mdata.units u ON u.id = a.unit_id
      WHERE a.operating_company_id = $1 AND a.driver_id = $2
      ORDER BY a.started_at DESC LIMIT 25`
  );
  const trailers = await rows(
    `SELECT e.id, e.equipment_number, e.equipment_type, 'assigned' AS source, NULL::timestamptz AS last_seen_at
       FROM mdata.equipment e WHERE e.assigned_driver_id = $2 AND (e.owner_company_id = $1 OR e.currently_leased_to_company_id = $1)
     UNION ALL
     SELECT e.id, e.equipment_number, e.equipment_type, 'dvir', max(s.submitted_at)
       FROM safety.dvir_submissions s JOIN mdata.equipment e ON e.id = s.trailer_equipment_id
      WHERE s.operating_company_id = $1 AND s.driver_id = $2
      GROUP BY e.id, e.equipment_number, e.equipment_type
     ORDER BY 5 DESC NULLS FIRST`
  );

  // 9. Loads run
  const loads = (await rows(
    `SELECT l.id, l.load_number, l.status, l.rate_total_cents, l.assigned_unit_id, u.unit_number,
            CASE WHEN l.assigned_primary_driver_id = $2::uuid THEN 'primary' ELSE 'secondary' END AS seat,
            (SELECT s.city || ', ' || s.state FROM mdata.load_stops s WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.stop_type = 'pickup' ORDER BY s.sequence_number LIMIT 1) AS origin,
            (SELECT s.city || ', ' || s.state FROM mdata.load_stops s WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.stop_type = 'delivery' ORDER BY s.sequence_number DESC LIMIT 1) AS destination,
            (SELECT min(s.scheduled_arrival_at) FROM mdata.load_stops s WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL) AS first_stop_at
       FROM mdata.loads l LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
      WHERE l.operating_company_id = $1 AND (l.assigned_primary_driver_id = $2::uuid OR l.assigned_secondary_driver_id = $2::uuid)
        AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL AND l.canceled_at IS NULL AND ${canonicalNotCancelledLoadClause("l")}
      ORDER BY first_stop_at DESC NULLS LAST LIMIT 50`
  )).map((l) => ({ ...l, rate_total_cents: n(l.rate_total_cents) }));

  // 10. Safety events (incident register + Samsara harsh events)
  const safety = await rows(
    `SELECT id, 'safety_event' AS source, event_type AS kind, severity, status, occurred_at AS at, title, related_load_id AS load_id
       FROM safety.safety_events WHERE operating_company_id = $1 AND subject_driver_id = $2
     UNION ALL
     SELECT id, 'harsh_event', event_kind, severity, NULL, event_at, NULL, NULL
       FROM safety.harsh_events WHERE operating_company_id = $1 AND driver_id = $2
     ORDER BY at DESC NULLS LAST LIMIT 50`
  );

  // 11. Drug and alcohol
  const drugAlcohol = await rows(
    `SELECT id, 'drug_test' AS source, test_type::text AS test_type, result::text AS result, test_date AS at, lab_name AS detail
       FROM safety.drug_test WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL
     UNION ALL
     SELECT uuid, 'da_test_record', coalesce(test_kind, test_type)::text, result::text, coalesce(collected_at, scheduled_at)::date, chain_of_custody_id
       FROM safety.da_test_records WHERE operating_company_id::text = $1::text AND driver_uuid = $2
     UNION ALL
     SELECT id, 'compliance_result', test_type::text || ' / ' || test_reason::text, result::text, test_date, lab_id
       FROM compliance.drug_alcohol_test_results WHERE operating_company_id = $1 AND driver_id = $2
     ORDER BY at DESC NULLS LAST`
  );

  // 12. Medical card (card register, else the driver record's DOT medical expiry)
  const cards = await rows(
    `SELECT id, card_number, issued_date, expiry_date, source_doc_id
       FROM safety.medical_cards WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL
      ORDER BY expiry_date DESC NULLS LAST`
  );
  const medExpiry = cards[0]?.expiry_date ?? d.dot_medical_expires_at ?? null;
  const medical = { cards, expires_on: medExpiry, days_to_expiry: daysTo(medExpiry), source: cards.length ? "safety.medical_cards" : medExpiry ? "mdata.drivers.dot_medical_expires_at" : null };

  // 13. CDL
  const endorsements = (["h", "n", "p", "s", "t", "x"] as const).filter((e) => d[`endorsement_${e}`] === true).map((e) => e.toUpperCase());
  const cdl = {
    number_on_file: Boolean(d.cdl_number), state: d.cdl_state ?? null, class: d.cdl_class ?? null,
    expires_on: d.cdl_expires_at ?? null, days_to_expiry: daysTo(d.cdl_expires_at), restrictions: d.cdl_restrictions ?? null,
    endorsements, hazmat_expires_on: d.hazmat_endorsement_expires_at ?? null,
  };

  // 14. Insurance — the policies this driver is scheduled on
  const insurance = await rows(
    `SELECT ds.id, ds.policy_id, p.insurer_name, p.policy_number, p.coverage_type, p.effective_date, p.expiry_date,
            ds.submitted_at, ds.confirmed_by_insurer_at, ds.is_active
       FROM insurance.driver_schedule ds LEFT JOIN insurance.policy p ON p.id = ds.policy_id
      WHERE ds.operating_company_id = $1 AND ds.driver_id = $2 AND ds.voided_at IS NULL
      ORDER BY ds.is_active DESC, p.expiry_date DESC NULLS LAST`
  );

  // 15. Documents — files linked to the driver + the safety document register
  const documents = await rows(
    `SELECT f.id, 'file' AS source, f.original_filename AS name, NULL::text AS doc_type, f.document_date, f.expiration_date, fl.created_at AS added_at
       FROM docs.file_links fl JOIN docs.files f ON f.id = fl.file_id
      WHERE fl.entity_type = 'driver' AND fl.entity_id = $2 AND fl.deleted_at IS NULL AND f.deleted_at IS NULL AND f.operating_company_id = $1
     UNION ALL
     SELECT id, 'driver_document', file_name, doc_type, effective_date, expiry_date, created_at
       FROM safety.driver_documents WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL
     UNION ALL
     SELECT id, 'dq_file', item_name, status, effective_date, expiry_date, created_at
       FROM safety.driver_qualification_files WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL
     ORDER BY added_at DESC`
  );

  // 16. HOS — last 8 days of duty status, hours per status + the latest status
  const hosAgg = await rows(
    `SELECT duty_status, round(sum(extract(epoch FROM (least(coalesce(ended_at, now()), now()) - greatest(started_at, now() - interval '8 days'))) / 3600)::numeric, 1) AS hours
       FROM hos.duty_status_events
      WHERE operating_company_id = $1 AND driver_id = $2 AND coalesce(ended_at, now()) > now() - interval '8 days'
      GROUP BY duty_status ORDER BY 2 DESC`
  );
  const hosLast = (await rows(
    `SELECT duty_status, started_at, ended_at, unit_id, source FROM hos.duty_status_events
      WHERE operating_company_id = $1 AND driver_id = $2 ORDER BY started_at DESC LIMIT 1`
  ))[0] ?? null;

  const hosClock = (await rows(
    `SELECT duty_status, driving_hours_remaining, on_duty_hours_remaining, cycle_hours_remaining, time_to_next_break_minutes, polled_at
       FROM samsara.hos_snapshots WHERE operating_company_id = $1 AND driver_uuid = $2 ORDER BY polled_at DESC LIMIT 1`
  ))[0] ?? null;

  // 17. Samsara linkage
  const samsara = await rows(
    `SELECT a.samsara_driver_id, a.samsara_username, CASE WHEN a.is_active THEN 'active' ELSE 'inactive' END AS status, a.last_login_at AS last_at, 'account' AS source
       FROM mdata.driver_samsara_accounts a WHERE a.operating_company_id = $1 AND a.driver_id = $2
     UNION ALL
     SELECT sd.samsara_driver_id, NULL, sd.driver_activation_status, sd.last_seen_at, 'mirror'
       FROM integrations.samsara_drivers sd WHERE sd.operating_company_id = $1 AND sd.local_driver_id = $2`
  );

  const block = <T>(value: T, reason: string | null): ProfileBlock<T> => ({ value, empty_reason: reason });
  const sum = (xs: Array<{ amount_cents: number }>) => xs.reduce((s, x) => s + x.amount_cents, 0);

  return {
    driver: { id: d.id, name: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim(), status: d.status, employment_status: d.employment_status, hire_date: d.hire_date, termination_date: d.termination_date },
    pay_basis: block({ current, history: rates }, rates.length === 0 ? "No pay rate card is on file for this driver." : null),
    settlements: block(settlementsWithLines, settlements.length === 0 ? "No settlement has been issued to this driver." : null),
    advances: block({ outstanding_cents: advances.reduce((s, a) => s + a.outstanding_cents, 0), rows: advances }, advances.length === 0 ? "No advance has been issued to this driver." : null),
    escrow: block({ balance_cents: escrowAccounts.reduce((t, x) => t + x.balance_cents, 0), accounts: escrowAccounts, postings: escrowPostings },
      escrowAccounts.length === 0 ? "No escrow account is held for this driver." : null),
    deductions: block({ total_cents: sum(deductions), rows: deductions }, deductions.length === 0 ? "No deduction has been taken from this driver." : null),
    reimbursements: block({ total_cents: sum(reimbursements), rows: reimbursements }, reimbursements.length === 0 ? "No reimbursement has been recorded for this driver." : null),
    fuel: block(fuel, fuel.length === 0 ? "No fuel purchase is attributed to this driver." : null),
    equipment: block({ units, trailers }, units.length === 0 && trailers.length === 0 ? "No truck assignment and no trailer (assigned or on a DVIR) for this driver." : null),
    loads: block(loads, loads.length === 0 ? "This driver has not run a load." : null),
    safety: block(safety, safety.length === 0 ? "No safety event or harsh event names this driver." : null),
    drug_alcohol: block(drugAlcohol, drugAlcohol.length === 0 ? "No drug or alcohol test is recorded for this driver." : null),
    medical_card: block(medical, medExpiry == null ? "No medical card and no DOT medical expiry on file." : null),
    cdl: block(cdl, !cdl.number_on_file && cdl.expires_on == null ? "No CDL number or CDL expiry on file." : null),
    insurance: block(insurance, insurance.length === 0 ? "This driver is not scheduled on any insurance policy." : null),
    documents: block(documents, documents.length === 0 ? "No document is linked to this driver." : null),
    hos: block({ clock: hosClock ? { ...hosClock, driving_hours_remaining: hosClock.driving_hours_remaining == null ? null : n(hosClock.driving_hours_remaining), on_duty_hours_remaining: hosClock.on_duty_hours_remaining == null ? null : n(hosClock.on_duty_hours_remaining), cycle_hours_remaining: hosClock.cycle_hours_remaining == null ? null : n(hosClock.cycle_hours_remaining) } : null, last: hosLast, hours_8d: hosAgg.map((h) => ({ duty_status: h.duty_status, hours: n(h.hours) })) }, hosLast == null && hosClock == null ? "No HOS duty-status event has been received for this driver." : null),
    samsara: block({ samsara_driver_id: d.samsara_driver_id ?? null, last_login_at: d.last_samsara_login_at ?? null, links: samsara },
      samsara.length === 0 && !d.samsara_driver_id ? "This driver is not linked to a Samsara driver account." : null),
  };
}
