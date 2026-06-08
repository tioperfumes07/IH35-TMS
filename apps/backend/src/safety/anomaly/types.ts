export type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type AnomalyRule = {
  uuid: string;
  operating_company_id: string;
  rule_slug: string;
  rule_name: string;
  category: string;
  detector_function: string;
  threshold_config: Record<string, unknown>;
  severity: string;
  is_active: boolean;
  notify_roles: string[];
  cadence_minutes: number;
};
