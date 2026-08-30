export type UserRole =
  | "Owner"
  | "Administrator"
  | "SuperAdmin"
  | "Manager"
  | "Accountant"
  | "Dispatcher"
  | "Safety"
  | "Driver"
  | "Mechanic";

export type IdentityUser = {
  id: string;
  name?: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  role: UserRole;
  auth_method?: "Google" | "Password" | "Google + Password" | "Invite pending" | string;
  default_company_id?: string | null;
  last_login_at?: string | null;
  created_at: string;
  deactivated_at: string | null;
  onboarding_completed_at?: string | null;
};

export type AuthMeResponse = {
  user: {
    uuid: string;
    email: string | null;
    role: UserRole;
  };
  session: {
    id: string;
  };
};

export type IdentityWorkflowAction = "WF-064-IDENT-001" | "WF-064-IDENT-002" | "WF-064-IDENT-003" | "WF-064-IDENT-004";
export type WorkflowStatus = "Pending" | "Approved" | "Rejected";

export type IdentityWorkflowRequest = {
  id: string;
  action_code: IdentityWorkflowAction;
  status: WorkflowStatus;
  requested_by: string;
  target_user: string;
  payload: Record<string, unknown>;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type DriverStatus = "Active" | "Probation" | "Inactive" | "Terminated" | "OnLeave";
export type CdlClass = "A" | "B" | "C";
export type MilesBasis = "short_miles" | "practical_miles";
export type PreferredLanguage = "en" | "es";
export type CustomerType = "broker" | "direct_shipper";

export type Driver = {
  id: string;
  operating_company_id: string;
  identity_user_id: string | null;
  /** True only while the linked identity account is active; the FK remains for audit/reverse links. */
  phone_login_enabled?: boolean;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  cdl_class: CdlClass | null;
  cdl_expires_at: string | null;
  hire_date: string | null;
  /** 49 CFR 391.21(b)(2) — required for DQ / MVR / Clearinghouse; create path must expose it. */
  date_of_birth: string | null;
  pay_basis: MilesBasis;
  termination_date: string | null;
  dot_medical_expires_at: string | null;
  hazmat_endorsement_expires_at: string | null;
  /** DOT hazmat "H" CDL endorsement (migration 0301). Canonical link:
   * mdata.driver_cdl_endorsements → reference.cdl_endorsements code 'H'; the shared driver-qualification
   * gate (dispatch/driver-qualification.service.ts) reads this to block an unendorsed driver from a
   * hazmat load. */
  endorsement_h: boolean;
  visa_type: string | null;
  visa_number: string | null;
  visa_expires_at: string | null;
  has_b1_visa: boolean;
  b1_visa_number: string | null;
  b1_visa_expires_date: string | null;
  passport_number: string | null;
  passport_expires_at: string | null;
  passport_country: string | null;
  fast_card_number: string | null;
  fast_card_expiration: string | null;
  sentri_member: boolean;
  sentri_expiration: string | null;
  twic_card_number: string | null;
  twic_expiration: string | null;
  mexican_license_number: string | null;
  mexican_license_expiration: string | null;
  ine_number: string | null;
  curp: string | null;
  mx_address_line1: string | null;
  mx_address_line2: string | null;
  mx_city: string | null;
  mx_state: string | null;
  mx_postal_code: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone_primary: string | null;
  emergency_contact_phone_alternate: string | null;
  emergency_contact_address: string | null;
  emergency_contact_notes: string | null;
  preferred_language: PreferredLanguage;
  qbo_vendor_id: string | null;
  /** Canonical local vendor resolved company-safely through mdata.vendors.qbo_vendor_id. */
  qbo_vendor_local_id?: string | null;
  qbo_vendor_name?: string | null;
  qbo_vendor_linked_at: string | null;
  qbo_vendor_linked_by_user_id: string | null;
  qbo_class_id?: string | null;
  /** External roster identity used only to disambiguate same-name active drivers. */
  samsara_driver_id?: string | null;
  /** ACCT-F18 / banking-b4 — Option-B RECOMMENDATION ONLY (pre-fill categorize; never auto-post). */
  default_expense_account_id?: string | null;
  settlement_auto_pay_enabled?: boolean;
  status: DriverStatus;
  notes: string | null;
  prior_driver_id: string | null;
  prior_driver_name: string | null;
  rehire_count: number;
  is_rehire: boolean;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  updated_by_user_label: string | null;
};

export type CreateDriverInput = {
  identity_user_id?: string;
  create_login_user?: boolean;
  operating_company_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  cdl_number?: string;
  cdl_state?: string;
  cdl_class?: CdlClass;
  cdl_expires_at?: string;
  hire_date?: string;
  date_of_birth?: string;
  pay_basis?: MilesBasis;
  dot_medical_expires_at?: string;
  hazmat_endorsement_expires_at?: string;
  endorsement_h?: boolean;
  visa_type?: string;
  visa_number?: string;
  visa_expires_at?: string;
  passport_number?: string;
  passport_expires_at?: string;
  passport_country?: string;
  mexican_license_number?: string;
  mexican_license_expiration?: string;
  ine_number?: string;
  curp?: string;
  mx_address_line1?: string;
  mx_address_line2?: string;
  mx_city?: string;
  mx_state?: string;
  mx_postal_code?: string;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone_primary?: string;
  emergency_contact_phone_alternate?: string;
  emergency_contact_address?: string;
  emergency_contact_notes?: string;
  preferred_language?: PreferredLanguage;
  status?: DriverStatus;
  notes?: string;
  override_returning_warning?: boolean;
  prior_driver_id?: string;
  is_rehire?: boolean;
};

export type DriverOnboardingCreateResponse = Driver & {
  invite_url: string;
  invite_expires_at: string | null;
  linked_user_event_type: "existing_user" | "new_user_created";
};

export type UpdateDriverInput = Partial<
  Pick<
    Driver,
    | "identity_user_id"
    | "first_name"
    | "last_name"
    | "phone"
    | "email"
    | "cdl_number"
    | "cdl_state"
    | "cdl_class"
    | "cdl_expires_at"
    | "hire_date"
    | "date_of_birth"
    | "pay_basis"
    | "dot_medical_expires_at"
    | "hazmat_endorsement_expires_at"
    | "endorsement_h"
    | "visa_type"
    | "visa_number"
    | "visa_expires_at"
    | "passport_number"
    | "passport_expires_at"
    | "passport_country"
    | "fast_card_number"
    | "fast_card_expiration"
    | "sentri_member"
    | "sentri_expiration"
    | "twic_card_number"
    | "twic_expiration"
    | "mexican_license_number"
    | "mexican_license_expiration"
    | "ine_number"
    | "curp"
    | "mx_address_line1"
    | "mx_address_line2"
    | "mx_city"
    | "mx_state"
    | "mx_postal_code"
    | "emergency_contact_name"
    | "emergency_contact_relationship"
    | "emergency_contact_phone_primary"
    | "emergency_contact_phone_alternate"
    | "emergency_contact_address"
    | "emergency_contact_notes"
    | "preferred_language"
    | "status"
    | "notes"
    | "deactivated_at"
    | "qbo_vendor_id"
    | "qbo_class_id"
    | "default_expense_account_id"
    | "settlement_auto_pay_enabled"
  >
>;
