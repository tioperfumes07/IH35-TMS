/**
 * SHARED TEST FIXTURE FACTORIES
 *
 * WHY THIS EXISTS — three production outages in one day, same shape:
 *   EntityPickerKind (17:29Z) · AccountingPeriod.closing_journal_entry_id (01:02Z) ·
 *   Driver.prior_driver_name (01:14Z)
 * Each time a REQUIRED property was added to a shared API type while full-object test
 * fixtures were built as bare object literals. Every literal broke at once, `tsc -b`
 * exited 2, and because apps/frontend's build is `tsc -b && vite build` the static site
 * never published — freezing prod for 30+ minutes while agents kept merging on top.
 *
 * THE CONTRACT: each *_DEFAULTS object below is annotated with its real type, so adding
 * a required field to Driver / Customer / AccountingPeriod breaks EXACTLY ONE LINE IN
 * THIS FILE instead of N fixtures scattered across the tree. Fix it here, once.
 *
 * Defaults are the previously-verified literals from invariant23-phase1.test.tsx — they
 * were not invented. Override only what your test actually asserts on.
 */
import type { Customer } from "../api/mdata";
import type { AccountingPeriod } from "../api/my-accountant";
import type { Driver } from "../types/api";

export const TEST_OPERATING_COMPANY_ID = "00000000-0000-0000-0000-000000000099";
const oc = TEST_OPERATING_COMPANY_ID;

const CUSTOMER_DEFAULTS = {
  id: "c1",
  name: "ANTONIO RAMIREZ-MARTINEZ JR. TRANSPORT LLC",
  customer_code: "01",
  email: null,
  phone: null,
  billing_address: null,
  billing_state: null,
  mc_number: null,
  dot_number: null,
  tax_id: null,
  credit_limit: null,
  credit_limit_source: null,
  credit_limit_updated_at: null,
  payment_terms_id: null,
  operating_company_id: oc,
  customer_type: "broker" as const,
  status: "active" as const,
  default_billing_miles_basis: "practical_miles" as const,
  default_free_time_hours: "0",
  default_detention_rate: "0",
  notes: null,
  website: null,
  office_phone: null,
  fax_phone: null,
  main_contact_name: "MARIA LOPEZ-GARCIA SR.",
  main_contact_title: null,
  main_contact_email: null,
  main_contact_phone: null,
  main_contact_mobile: null,
  ar_email: null,
  ar_phone: null,
  ap_email: null,
  ap_phone: null,
  free_time_pickup_minutes: 0,
  free_time_delivery_minutes: 0,
  detention_rate_per_hour: "0",
  layover_charge_per_day: null,
  layover_currency: null,
  layover_first_night_free: true,
  layover_max_days: null,
  layover_notes: null,
  factoring_eligible: false,
  factoring_company_vendor_id: null,
  factoring_advance_rate_override: null,
  factoring_reserve_pct_override: null,
  factoring_recourse_type: null,
  factoring_notes: null,
  quality_overall_flag: "standard" as const,
  quality_payment_score: null,
  quality_cancellation_score: null,
  quality_disputes_count: 0,
  quality_last_evaluated_at: null,
  quality_notes: null,
  fmcsa_verified_at: null,
  fmcsa_lookup_id: null,
  fmcsa_authority_status_at_verification: null,
  fmcsa_last_checked_at: null,
  fmcsa_check_response: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  deactivated_at: null,
  created_by_user_id: "u1",
  updated_by_user_id: "u1",
} satisfies Customer;

const DRIVER_DEFAULTS: Driver = {
  id: "d1",
  operating_company_id: oc,
  identity_user_id: null,
  first_name: "ANTONIO",
  last_name: "RAMIREZ-MARTINEZ JR.",
  phone: "5555555555",
  email: null,
  cdl_number: null,
  cdl_state: null,
  cdl_class: null,
  cdl_expires_at: null,
  hire_date: null,
  date_of_birth: null,
  pay_basis: "practical_miles",
  termination_date: null,
  dot_medical_expires_at: null,
  hazmat_endorsement_expires_at: null,
  endorsement_h: false,
  visa_type: null,
  visa_number: null,
  visa_expires_at: null,
  has_b1_visa: false,
  b1_visa_number: null,
  b1_visa_expires_date: null,
  passport_number: null,
  passport_country: null,
  passport_expires_at: null,
  fast_card_number: null,
  fast_card_expiration: null,
  sentri_member: false,
  sentri_expiration: null,
  twic_card_number: null,
  twic_expiration: null,
  mexican_license_number: null,
  mexican_license_expiration: null,
  ine_number: null,
  curp: null,
  mx_address_line1: null,
  mx_address_line2: null,
  mx_city: null,
  mx_state: null,
  mx_postal_code: null,
  emergency_contact_name: null,
  emergency_contact_relationship: null,
  emergency_contact_phone_primary: null,
  emergency_contact_phone_alternate: null,
  emergency_contact_address: null,
  emergency_contact_notes: null,
  referred_by_driver_id: null,
  referral_source: null,
  referral_reward_paid_at: null,
  referral_reward_settlement_id: null,
  preferred_language: "en",
  qbo_vendor_id: null,
  qbo_vendor_linked_at: null,
  qbo_vendor_linked_by_user_id: null,
  status: "Active",
  notes: null,
  prior_driver_id: null,
  prior_driver_name: null,
  rehire_count: 0,
  is_rehire: false,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  deactivated_at: null,
  created_by_user_id: "u1",
  updated_by_user_id: "u1",
  updated_by_user_label: null,
};

/** A closed period with no resolvable closing JE — the common case. */
const ACCOUNTING_PERIOD_DEFAULTS: AccountingPeriod = {
  id: "p1",
  period_label: "FY2026 January",
  period_start: "2026-01-01",
  period_end: "2026-01-31",
  fiscal_year: 2026,
  status: "closed",
  closed_at: "2026-02-05",
  closing_journal_entry_id: null,
};

export function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return { ...CUSTOMER_DEFAULTS, ...overrides };
}

export function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return { ...DRIVER_DEFAULTS, ...overrides };
}

export function makeAccountingPeriod(overrides: Partial<AccountingPeriod> = {}): AccountingPeriod {
  return { ...ACCOUNTING_PERIOD_DEFAULTS, ...overrides };
}
