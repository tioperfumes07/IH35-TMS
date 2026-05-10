export type UserRole =
  | "Owner"
  | "Administrator"
  | "Manager"
  | "Accountant"
  | "Dispatcher"
  | "Safety"
  | "Driver"
  | "Mechanic";

export type IdentityUser = {
  id: string;
  email: string | null;
  role: UserRole;
  default_company_id?: string | null;
  created_at: string;
  deactivated_at: string | null;
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
export type CustomerType = "broker" | "direct_shipper";

export type Driver = {
  id: string;
  operating_company_id: string;
  identity_user_id: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  cdl_class: CdlClass | null;
  cdl_expires_at: string | null;
  hire_date: string | null;
  pay_basis: MilesBasis;
  termination_date: string | null;
  dot_medical_expires_at: string | null;
  hazmat_endorsement_expires_at: string | null;
  visa_type: string | null;
  visa_number: string | null;
  visa_expires_at: string | null;
  passport_number: string | null;
  passport_expires_at: string | null;
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
  qbo_vendor_id: string | null;
  qbo_vendor_linked_at: string | null;
  qbo_vendor_linked_by_user_id: string | null;
  status: DriverStatus;
  notes: string | null;
  prior_driver_id: string | null;
  rehire_count: number;
  is_rehire: boolean;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
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
  pay_basis?: MilesBasis;
  dot_medical_expires_at?: string;
  hazmat_endorsement_expires_at?: string;
  visa_type?: string;
  visa_number?: string;
  visa_expires_at?: string;
  passport_number?: string;
  passport_expires_at?: string;
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
    | "pay_basis"
    | "dot_medical_expires_at"
    | "hazmat_endorsement_expires_at"
    | "visa_type"
    | "visa_number"
    | "visa_expires_at"
    | "passport_number"
    | "passport_expires_at"
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
    | "status"
    | "notes"
    | "deactivated_at"
  >
>;
