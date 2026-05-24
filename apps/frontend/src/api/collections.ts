import { apiRequest } from "./client";

export type CollectionAgingBucket = "current" | "1_30" | "31_60" | "61_90" | "91_plus";
export type CollectionTaskStatus = "open" | "contacted" | "promised" | "escalated" | "resolved";
export type CollectionTaskResolution = "paid" | "disputed" | "written_off";
export type CollectionContactType = "call" | "email" | "letter" | "sms";

export type CollectionTask = {
  id: string;
  operating_company_id: string;
  customer_id: string;
  customer_name: string | null;
  invoice_id: string;
  owed_cents: number;
  days_overdue: number;
  aging_bucket: CollectionAgingBucket;
  status: CollectionTaskStatus;
  resolution: CollectionTaskResolution | null;
  assigned_to_user_id: string | null;
  last_contact_at: string | null;
  next_action_date: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type CollectionContact = {
  id: string;
  task_id: string;
  contact_type: CollectionContactType;
  notes: string;
  next_action_date: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

export type CollectionTaskDetail = {
  task: CollectionTask;
  contacts: CollectionContact[];
};

function withCompany(path: string, operatingCompanyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export function listTasks(
  operatingCompanyId: string,
  filters: {
    bucket?: CollectionAgingBucket;
    owner?: string;
  } = {}
) {
  const query = new URLSearchParams();
  if (filters.bucket) query.set("bucket", filters.bucket);
  if (filters.owner) query.set("owner", filters.owner);
  const qs = query.toString();
  return apiRequest<{ tasks: CollectionTask[] }>(withCompany(`/api/v1/accounting/collections${qs ? `?${qs}` : ""}`, operatingCompanyId));
}

export function getTask(taskId: string, operatingCompanyId: string) {
  return apiRequest<CollectionTaskDetail>(withCompany(`/api/v1/accounting/collections/${encodeURIComponent(taskId)}`, operatingCompanyId));
}

export function logContact(
  taskId: string,
  input: {
    operating_company_id: string;
    contact_type: CollectionContactType;
    notes: string;
    next_action_date?: string;
  }
) {
  return apiRequest<{ contact: CollectionContact }>(`/api/v1/accounting/collections/${encodeURIComponent(taskId)}/contact`, {
    method: "POST",
    body: input,
  });
}

export function resolveTask(
  taskId: string,
  input: {
    operating_company_id: string;
    resolution: CollectionTaskResolution;
  }
) {
  return apiRequest<{ task_id: string; resolution: CollectionTaskResolution; closed_at: string | null }>(
    `/api/v1/accounting/collections/${encodeURIComponent(taskId)}/resolve`,
    {
      method: "POST",
      body: input,
    }
  );
}

export function triggerSync(
  input: {
    operating_company_id: string;
    thresholds_days?: number[];
  }
) {
  return apiRequest<{ created: number; updated: number; resolved: number; open_count: number }>(
    "/api/v1/accounting/collections/sync",
    {
      method: "POST",
      body: input,
    }
  );
}
