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

export type Driver = {
  id: string;
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
  termination_date: string | null;
  dot_medical_expires_at: string | null;
  hazmat_endorsement_expires_at: string | null;
  status: DriverStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
};

export type CreateDriverInput = {
  identity_user_id?: string;
  create_login_user?: boolean;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  cdl_number?: string;
  cdl_state?: string;
  cdl_class?: CdlClass;
  cdl_expires_at?: string;
  hire_date?: string;
  dot_medical_expires_at?: string;
  hazmat_endorsement_expires_at?: string;
  status?: DriverStatus;
  notes?: string;
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
    | "dot_medical_expires_at"
    | "hazmat_endorsement_expires_at"
    | "status"
    | "notes"
    | "deactivated_at"
  >
>;
